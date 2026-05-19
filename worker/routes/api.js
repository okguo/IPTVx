import { getJSON, KV_KEYS } from '../utils/cache.js';
import { summarizeHealth } from '../services/validator.js';
import { buildM3U } from '../utils/parser.js';
import { pickBestSource, getClientContext } from '../services/router.js';
import { proxyStreamUrl, getBaseUrl } from '../services/fallback.js';
import { getMetrics } from '../services/metrics.js';
import { ensureBootstrap } from '../services/bootstrap.js';

export { pickBestSource, getClientContext };

export async function handleHealth(request, env, ctx = {}) {
  await ensureBootstrap(env, ctx.executionCtx);
  const health = (await getJSON(env, KV_KEYS.HEALTH)) || {
    healthy: 0,
    unstable: 0,
    dead: 0,
    channels: 0,
  };

  const channels = await getJSON(env, KV_KEYS.CHANNELS);
  const playlistReady = (channels?.length ?? 0) > 0;

  return Response.json({
    status: 'ok',
    service: 'IPTVx',
    ...health,
    playlist_ready: health.playlist_ready ?? playlistReady,
    schema_version: health.schema_version ?? null,
    colo: request.cf?.colo,
    country: request.cf?.country,
    isp: request.cf?.asOrganization,
  });
}

export async function handleStats(env) {
  const channels = (await getJSON(env, KV_KEYS.CHANNELS)) || [];
  const health = summarizeHealth(channels);

  const byCategory = {};
  for (const ch of channels) {
    const cat = ch.category || '其他';
    byCategory[cat] = (byCategory[cat] || 0) + 1;
  }

  return Response.json({
    ...health,
    byCategory,
    topChannels: channels.slice(0, 20).map((ch) => ({
      name: ch.name,
      normalized_name: ch.normalized_name,
      category: ch.category,
      sources: ch.sources?.length || 0,
      best_latency: ch.sources?.[0]?.latency,
      status: ch.sources?.[0]?.status,
    })),
  });
}

export async function handleMetrics(env) {
  const metrics = await getMetrics(env);
  return Response.json(metrics);
}

export async function handleDashboard(env) {
  const channels = (await getJSON(env, KV_KEYS.CHANNELS)) || [];
  const health = (await getJSON(env, KV_KEYS.HEALTH)) || summarizeHealth(channels);

  const rows = channels
    .slice(0, 200)
    .map((ch) => {
      const best = ch.sources?.[0];
      const statusClass = best?.status || 'unknown';
      return `<tr>
        <td>${escapeHtml(ch.name)}</td>
        <td>${escapeHtml(ch.normalized_name || '')}</td>
        <td>${escapeHtml(ch.category || '')}</td>
        <td>${best?.latency ?? '-'} ms</td>
        <td class="${statusClass}">${best?.status ?? '-'}</td>
        <td>${(best?.success_rate ?? 0).toFixed(2)}</td>
        <td>${ch.sources?.length ?? 0}</td>
      </tr>`;
    })
    .join('');

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>IPTVx Dashboard</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 24px; background: #0f172a; color: #e2e8f0; }
    h1 { color: #38bdf8; }
    nav { margin: 16px 0; }
    nav a { color: #38bdf8; margin-right: 16px; }
    .cards { display: flex; gap: 16px; flex-wrap: wrap; margin-bottom: 24px; }
    .card { background: #1e293b; padding: 16px 24px; border-radius: 8px; min-width: 120px; }
    .card strong { font-size: 1.8rem; display: block; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th, td { padding: 8px 12px; border-bottom: 1px solid #334155; text-align: left; }
    th { background: #1e293b; }
    .healthy { color: #4ade80; }
    .unstable { color: #fbbf24; }
    .dead { color: #f87171; }
  </style>
</head>
<body>
  <h1>IPTVx Dashboard</h1>
  <nav>
    <a href="/player">播放器</a>
    <a href="/admin">管理后台</a>
    <a href="/api/metrics">监控 API</a>
    <a href="/api/recommend">推荐 API</a>
  </nav>
  <div class="cards">
    <div class="card"><span>Healthy</span><strong class="healthy">${health.healthy}</strong></div>
    <div class="card"><span>Unstable</span><strong class="unstable">${health.unstable}</strong></div>
    <div class="card"><span>Dead</span><strong class="dead">${health.dead}</strong></div>
    <div class="card"><span>Channels</span><strong>${health.channels}</strong></div>
  </div>
  <p>更新于：${health.updated_at || '-'}</p>
  <table>
    <thead><tr><th>频道</th><th>标准化</th><th>分类</th><th>延迟</th><th>状态</th><th>成功率</th><th>源数</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="7">暂无数据</td></tr>'}</tbody>
  </table>
</body>
</html>`;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 按地区智能路由生成 M3U（支持 fallback 代理 URL） */
export async function buildRoutedPlaylist(env, request, options = {}) {
  const channels = await getJSON(env, KV_KEYS.CHANNELS);
  if (!channels?.length) return null;

  const userPrefs = options.userPrefs || null;
  const useProxy = options.useProxy ?? false;
  const baseUrl = getBaseUrl(request);

  return buildM3U(channels, (ch) => {
    if (useProxy) return proxyStreamUrl(request, ch, baseUrl);
    return pickBestSource(ch, request, userPrefs);
  });
}
