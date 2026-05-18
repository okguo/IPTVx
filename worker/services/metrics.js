import { getJSON, setJSON } from '../utils/cache.js';
import config from '../../config/config.js';

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function metricsKey(day = todayKey()) {
  return `${config.METRICS?.retentionDays ? 'metrics' : 'metrics'}:${day}`;
}

/** 记录访问指标（延迟 / 健康度 / 访问量） */
export async function recordMetric(env, event) {
  const day = todayKey();
  const key = `metrics:${day}`;
  const data = (await getJSON(env, key)) || {
    day,
    visits: 0,
    stream_requests: 0,
    m3u_requests: 0,
    epg_requests: 0,
    api_requests: 0,
    errors: 0,
    latency_sum: 0,
    latency_count: 0,
    by_country: {},
    by_path: {},
  };

  data.visits += 1;
  const pathType = classifyPath(event.path);
  if (pathType) data[`${pathType}_requests`] = (data[`${pathType}_requests`] || 0) + 1;
  if (event.error) data.errors += 1;
  if (event.latencyMs != null) {
    data.latency_sum += event.latencyMs;
    data.latency_count += 1;
  }

  if (event.country) {
    data.by_country[event.country] = (data.by_country[event.country] || 0) + 1;
  }
  data.by_path[event.path] = (data.by_path[event.path] || 0) + 1;

  await setJSON(env, key, data);

  if (env.DB) {
    const avg = data.latency_count ? data.latency_sum / data.latency_count : 0;
    await env.DB.prepare(
      `INSERT INTO metrics_daily (day, visits, stream_requests, m3u_requests, errors, avg_latency_ms)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(day) DO UPDATE SET
         visits = visits + 1,
         stream_requests = stream_requests + excluded.stream_requests,
         m3u_requests = m3u_requests + excluded.m3u_requests,
         errors = errors + excluded.errors,
         avg_latency_ms = ?`,
    )
      .bind(day, 1, pathType === 'stream' ? 1 : 0, pathType === 'm3u' ? 1 : 0, event.error ? 1 : 0, avg, avg)
      .run();
  }
}

function classifyPath(path) {
  if (path.includes('/api/stream')) return 'stream';
  if (path.includes('/iptv.m3u')) return 'm3u';
  if (path.includes('/epg.xml')) return 'epg';
  if (path.startsWith('/api/')) return 'api';
  return null;
}

export async function getMetrics(env, days = 7) {
  const result = [];
  const now = new Date();

  for (let i = 0; i < days; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const day = d.toISOString().slice(0, 10);
    const data = await getJSON(env, `metrics:${day}`);
    if (data) {
      result.push({
        ...data,
        avg_latency_ms: data.latency_count ? Math.round(data.latency_sum / data.latency_count) : 0,
      });
    }
  }

  const health = await getJSON(env, 'health');
  return { days: result, health };
}
