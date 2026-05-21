import { getJSON, setJSON, KV_KEYS } from '../utils/cache.js';
import config from '../../config/config.js';

/**
 * 频道测速结果持久化 + 历史趋势
 * 记录每个频道的历史测速数据（成功率、延迟趋势），支持智能源选择
 */

const MAX_HISTORY_DAYS = config.METRICS?.retentionDays || 30;
const MAX_ENTRIES_PER_CHANNEL = 100;

/**
 * 获取测速历史记录
 */
export async function getValidationHistory(env, normalized_name = null) {
  const history = (await getJSON(env, KV_KEYS.VALIDATION_HISTORY)) || {};

  if (normalized_name) {
    return history[normalized_name] || [];
  }

  return history;
}

/**
 * 记录单次测速结果到历史
 */
export async function recordValidationResult(env, channel, sources, timestamp = Date.now()) {
  const history = (await getJSON(env, KV_KEYS.VALIDATION_HISTORY)) || {};
  const key = channel.normalized_name || channel.name;

  if (!history[key]) {
    history[key] = [];
  }

  const entry = {
    timestamp,
    date: new Date(timestamp).toISOString().slice(0, 10),
    sources: sources.map((s) => ({
      url: s.url,
      source: s.source,
      status: s.status,
      latency: s.latency,
      success_rate: s.success_rate,
    })),
    healthy_count: sources.filter((s) => s.status === 'healthy').length,
    unstable_count: sources.filter((s) => s.status === 'unstable').length,
    dead_count: sources.filter((s) => s.status === 'dead').length,
    avg_latency: computeAvgLatency(sources),
  };

  history[key].push(entry);

  // 限制每个频道的历史条目数
  if (history[key].length > MAX_ENTRIES_PER_CHANNEL) {
    history[key] = history[key].slice(-MAX_ENTRIES_PER_CHANNEL);
  }

  // 清理过期的历史记录
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - MAX_HISTORY_DAYS);
  const cutoffStr = cutoffDate.toISOString().slice(0, 10);

  history[key] = history[key].filter((e) => e.date >= cutoffStr);

  await setJSON(env, KV_KEYS.VALIDATION_HISTORY, history);

  return entry;
}

/**
 * 批量记录测速结果
 */
export async function batchRecordValidationResults(env, channels, timestamp = Date.now()) {
  const history = (await getJSON(env, KV_KEYS.VALIDATION_HISTORY)) || {};
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - MAX_HISTORY_DAYS);
  const cutoffStr = cutoffDate.toISOString().slice(0, 10);

  for (const ch of channels) {
    const key = ch.normalized_name || ch.name;
    if (!history[key]) {
      history[key] = [];
    }

    const sources = ch.sources || [];
    const entry = {
      timestamp,
      date: new Date(timestamp).toISOString().slice(0, 10),
      sources: sources.map((s) => ({
        url: s.url,
        source: s.source,
        status: s.status,
        latency: s.latency,
        success_rate: s.success_rate,
      })),
      healthy_count: sources.filter((s) => s.status === 'healthy').length,
      unstable_count: sources.filter((s) => s.status === 'unstable').length,
      dead_count: sources.filter((s) => s.status === 'dead').length,
      avg_latency: computeAvgLatency(sources),
    };

    history[key].push(entry);

    // 限制条目数并清理过期数据
    if (history[key].length > MAX_ENTRIES_PER_CHANNEL) {
      history[key] = history[key].slice(-MAX_ENTRIES_PER_CHANNEL);
    }
    history[key] = history[key].filter((e) => e.date >= cutoffStr);
  }

  await setJSON(env, KV_KEYS.VALIDATION_HISTORY, history);
}

/**
 * 获取频道的历史趋势（成功率、延迟）
 */
export async function getChannelTrend(env, normalized_name, days = 7) {
  const history = await getValidationHistory(env, normalized_name);
  if (!history || history.length === 0) {
    return { trend: [], summary: null };
  }

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  const cutoffTs = cutoffDate.getTime();

  const recent = history.filter((e) => e.timestamp >= cutoffTs);

  if (recent.length === 0) {
    return { trend: [], summary: null };
  }

  // 按日期聚合
  const dailyMap = new Map();
  for (const entry of recent) {
    if (!dailyMap.has(entry.date)) {
      dailyMap.set(entry.date, {
        date: entry.date,
        healthy_rate: 0,
        avg_latency: 0,
        checks: 0,
      });
    }
    const day = dailyMap.get(entry.date);
    const total = entry.healthy_count + entry.unstable_count + entry.dead_count;
    const healthyRate = total > 0 ? (entry.healthy_count / total) * 100 : 0;

    day.healthy_rate = (day.healthy_rate * day.checks + healthyRate) / (day.checks + 1);
    day.avg_latency = (day.avg_latency * day.checks + (entry.avg_latency || 0)) / (day.checks + 1);
    day.checks += 1;
  }

  const trend = [...dailyMap.values()].sort((a, b) => a.date.localeCompare(b.date));

  // 计算摘要
  const summary = {
    avg_healthy_rate: trend.reduce((sum, d) => sum + d.healthy_rate, 0) / trend.length,
    avg_latency: trend.reduce((sum, d) => sum + d.avg_latency, 0) / trend.length,
    total_checks: recent.length,
    trend_direction: computeTrendDirection(trend),
  };

  return { trend, summary };
}

/**
 * 获取源级别的历史成功率
 */
export async function getSourceHistoryScore(env, url, days = 14) {
  const history = (await getJSON(env, KV_KEYS.VALIDATION_HISTORY)) || {};
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  const cutoffTs = cutoffDate.getTime();

  let totalChecks = 0;
  let successChecks = 0;
  let totalLatency = 0;

  for (const entries of Object.values(history)) {
    for (const entry of entries) {
      if (entry.timestamp < cutoffTs) continue;
      for (const src of entry.sources) {
        if (src.url === url) {
          totalChecks += 1;
          if (src.status === 'healthy' || src.status === 'unstable') {
            successChecks += 1;
          }
          if (src.latency != null) {
            totalLatency += src.latency;
          }
        }
      }
    }
  }

  if (totalChecks === 0) return null;

  return {
    success_rate: successChecks / totalChecks,
    avg_latency: totalLatency / totalChecks,
    total_checks: totalChecks,
  };
}

/**
 * 获取全局源统计（哪些源整体表现好）
 */
export async function getGlobalSourceStats(env, days = 14) {
  const history = (await getJSON(env, KV_KEYS.VALIDATION_HISTORY)) || {};
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  const cutoffTs = cutoffDate.getTime();

  const sourceMap = new Map();

  for (const entries of Object.values(history)) {
    for (const entry of entries) {
      if (entry.timestamp < cutoffTs) continue;
      for (const src of entry.sources) {
        if (!sourceMap.has(src.source)) {
          sourceMap.set(src.source, {
            source: src.source,
            total_checks: 0,
            healthy: 0,
            unstable: 0,
            dead: 0,
            total_latency: 0,
            latency_count: 0,
          });
        }
        const stat = sourceMap.get(src.source);
        stat.total_checks += 1;
        if (src.status === 'healthy') stat.healthy += 1;
        else if (src.status === 'unstable') stat.unstable += 1;
        else if (src.status === 'dead') stat.dead += 1;
        if (src.latency != null) {
          stat.total_latency += src.latency;
          stat.latency_count += 1;
        }
      }
    }
  }

  const stats = [...sourceMap.values()].map((s) => ({
    ...s,
    success_rate: s.total_checks > 0 ? (s.healthy + s.unstable) / s.total_checks : 0,
    avg_latency: s.latency_count > 0 ? s.total_latency / s.latency_count : null,
  }));

  stats.sort((a, b) => b.success_rate - a.success_rate);
  return stats;
}

function computeAvgLatency(sources) {
  const valid = sources.filter((s) => s.latency != null);
  if (valid.length === 0) return null;
  return valid.reduce((sum, s) => sum + s.latency, 0) / valid.length;
}

function computeTrendDirection(trend) {
  if (trend.length < 2) return 'stable';
  const recent = trend.slice(-3);
  const older = trend.slice(0, Math.max(1, trend.length - 3));

  const recentAvg = recent.reduce((sum, d) => sum + d.healthy_rate, 0) / recent.length;
  const olderAvg = older.reduce((sum, d) => sum + d.healthy_rate, 0) / older.length;

  const diff = recentAvg - olderAvg;
  if (diff > 5) return 'improving';
  if (diff < -5) return 'declining';
  return 'stable';
}

/**
 * Phase 2: GeoIP+ASN 延迟热力图
 * 记录用户请求时的实际延迟，按 GeoIP+ASN 维度聚合
 */

const HEATMAP_KEY = 'heatmap:geoasn';
const HEATMAP_TTL_DAYS = 30;
const HEATMAP_MAX_ENTRIES_PER_SOURCE = 500;

/**
 * 记录请求时延迟采样
 */
export async function recordRequestLatency(env, sourceUrl, geoASNKey, latencyMs) {
  if (!env || !sourceUrl || !geoASNKey || latencyMs == null) return;

  const heatmap = (await getJSON(env, HEATMAP_KEY)) || {};

  // 键格式：源URL + GeoASNKey
  const key = `${sourceUrl}::${geoASNKey}`;
  if (!heatmap[key]) {
    heatmap[key] = {
      source_url: sourceUrl,
      geo_asn_key: geoASNKey,
      samples: [],
      total_samples: 0,
    };
  }

  const entry = heatmap[key];
  entry.samples.push({
    timestamp: Date.now(),
    latency_ms: latencyMs,
  });
  entry.total_samples += 1;

  // 限制样本数量
  if (entry.samples.length > HEATMAP_MAX_ENTRIES_PER_SOURCE) {
    entry.samples = entry.samples.slice(-HEATMAP_MAX_ENTRIES_PER_SOURCE);
  }

  // 清理过期样本
  const cutoffTs = Date.now() - HEATMAP_TTL_DAYS * 24 * 60 * 60 * 1000;
  entry.samples = entry.samples.filter((s) => s.timestamp >= cutoffTs);

  await setJSON(env, HEATMAP_KEY, heatmap);
}

/**
 * 获取 GeoIP+ASN 热力图延迟分数
 */
export function getGeoASNHeatmapScore(sourceUrl, geoASNKey, heatmap = null) {
  if (!heatmap) {
    // 同步调用，无法获取 KV 数据，返回 null
    return null;
  }

  const key = `${sourceUrl}::${geoASNKey}`;
  const entry = heatmap[key];
  if (!entry || !entry.samples || entry.samples.length === 0) {
    // 回退：尝试用全国同 ASN 的数据
    const fallbackKey = sourceUrl + '::' + geoASNKey.replace(/^[A-Z]{2}-[A-Z]{2}/, 'CN-*');
    const fallback = heatmap[fallbackKey];
    if (!fallback || !fallback.samples || fallback.samples.length < 5) {
      return null; // 数据不足
    }
    return computeHeatmapStats(fallback.samples);
  }

  return computeHeatmapStats(entry.samples);
}

/**
 * 异步版本：从 KV 获取热力图数据
 */
export async function getGeoASNHeatmapScoreAsync(env, sourceUrl, geoASNKey) {
  if (!env) return null;

  const heatmap = (await getJSON(env, HEATMAP_KEY)) || {};
  return getGeoASNHeatmapScore(sourceUrl, geoASNKey, heatmap);
}

/**
 * 计算热力图统计
 */
function computeHeatmapStats(samples) {
  if (!samples || samples.length === 0) return null;

  const latencies = samples.map((s) => s.latency_ms).filter((l) => l != null && l > 0);
  if (latencies.length === 0) return null;

  latencies.sort((a, b) => a - b);

  const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;
  const median = latencies[Math.floor(latencies.length / 2)];
  const p95 = latencies[Math.floor(latencies.length * 0.95)];
  const min = latencies[0];
  const max = latencies[latencies.length - 1];

  return {
    avg_latency: Math.round(avg),
    median_latency: Math.round(median),
    p95_latency: Math.round(p95),
    min_latency: Math.round(min),
    max_latency: Math.round(max),
    sample_count: latencies.length,
    confidence: Math.min(1, latencies.length / 50), // 50 个样本 = 100% 置信度
  };
}

/**
 * 获取热力图报告（按 GeoIP+ASN 聚合）
 */
export async function getHeatmapReport(env, options = {}) {
  const heatmap = (await getJSON(env, HEATMAP_KEY)) || {};
  const { region, asn, sourceUrl, topN = 20 } = options;

  const entries = Object.values(heatmap);
  let filtered = entries.filter((e) => e.samples && e.samples.length >= 5);

  if (region) {
    filtered = filtered.filter((e) => e.geo_asn_key.includes(`-${region}-`));
  }
  if (asn) {
    filtered = filtered.filter((e) => e.geo_asn_key.endsWith(`-${asn}`));
  }
  if (sourceUrl) {
    filtered = filtered.filter((e) => e.source_url === sourceUrl);
  }

  const stats = filtered.map((e) => {
    const s = computeHeatmapStats(e.samples);
    if (!s) return null;
    return {
      source_url: e.source_url,
      geo_asn_key: e.geo_asn_key,
      ...s,
    };
  }).filter(Boolean);

  stats.sort((a, b) => a.avg_latency - b.avg_latency);

  return {
    top_sources: stats.slice(0, topN),
    total_entries: entries.length,
    filtered_entries: stats.length,
  };
}
