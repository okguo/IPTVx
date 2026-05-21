import { getJSON, KV_KEYS } from '../utils/cache.js';
import { summarizeHealth } from '../services/validator.js';
import { buildM3U } from '../utils/parser.js';
import { pickBestSource, getClientContext, rankSources } from '../services/router.js';
import { proxyStreamUrl, getBaseUrl } from '../services/fallback.js';
import { getMetrics } from '../services/metrics.js';
import { ensureBootstrap } from '../services/bootstrap.js';
import { getValidationHistory, getChannelTrend, getGlobalSourceStats, getHeatmapReport } from '../services/validationHistory.js';
import { getSourceQualityReport, getActiveSources, getSourceStats, setSourceStatus, discoverAndEvaluateSources } from '../services/sourceManager.js';
import { computeChannelHealthScore, getHealthLevel, getHealthScoreDistribution } from '../services/healthScore.js';
import { getSourceDiscoveryHistory } from '../services/sourceDiscovery.js';
import { getUserRegion } from '../services/geoASNMap.js';

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

  // Phase 1+2: 预先对每个频道进行 GeoIP+ASN 路由排序
  const rankedChannels = await Promise.all(
    channels.map(async (ch) => {
      const ranked = await rankSources(ch, request, userPrefs, env);
      return { ...ch, sources: ranked };
    }),
  );

  return buildM3U(rankedChannels, (ch) => {
    if (useProxy) return proxyStreamUrl(request, ch, baseUrl);
    // sources 已按 GeoIP+ASN 排序，取第一个
    return ch.sources?.[0]?.url || ch.sources?.[0]?.url;
  });
}

/** 获取频道测速历史趋势 */
export async function handleValidationTrend(request, env) {
  const url = new URL(request.url);
  const channel = url.searchParams.get('channel');
  const days = Number(url.searchParams.get('days') || 7);

  if (!channel) {
    return Response.json({ error: 'channel parameter required' }, { status: 400 });
  }

  const trend = await getChannelTrend(env, channel, days);
  return Response.json(trend);
}

/** 获取源质量报告 */
export async function handleSourceReport(request, env) {
  const report = await getSourceQualityReport(env);
  return Response.json(report);
}

/** 获取活跃源列表 */
export async function handleActiveSources(request, env) {
  const sources = await getActiveSources(env);
  return Response.json({ sources });
}

/** 手动设置源状态 */
export async function handleSetSourceStatus(request, env) {
  const url = new URL(request.url);
  const sourceUrl = url.searchParams.get('url');
  const status = url.searchParams.get('status');

  if (!sourceUrl || !status) {
    return Response.json({ error: 'url and status parameters required' }, { status: 400 });
  }

  const result = await setSourceStatus(env, sourceUrl, status);
  if (!result) {
    return Response.json({ error: 'source not found' }, { status: 404 });
  }
  return Response.json({ source: result });
}

/** 获取频道健康评分 */
export async function handleHealthScore(request, env) {
  const url = new URL(request.url);
  const channel = url.searchParams.get('channel');

  if (!channel) {
    // 返回整体分布
    const channels = await getJSON(env, KV_KEYS.CHANNELS) || [];
    const distribution = getHealthScoreDistribution(channels);
    return Response.json(distribution);
  }

  const channels = await getJSON(env, KV_KEYS.CHANNELS) || [];
  const ch = channels.find((c) => c.normalized_name === channel || c.name === channel);
  if (!ch) {
    return Response.json({ error: 'channel not found' }, { status: 404 });
  }

  const score = computeChannelHealthScore(ch);
  const level = getHealthLevel(score);
  return Response.json({ channel: ch.normalized_name, score, level });
}

/** 源发现历史 */
export async function handleSourceDiscovery(request, env) {
  const history = await getSourceDiscoveryHistory(env);
  return Response.json(history);
}

/** 触发源发现 */
export async function handleTriggerDiscovery(env) {
  const result = await discoverAndEvaluateSources(env);
  return Response.json(result);
}

/** 获取热力图报告 */
export async function handleHeatmapReport(request, env) {
  const url = new URL(request.url);
  const region = url.searchParams.get('region');
  const asn = url.searchParams.get('asn');
  const sourceUrl = url.searchParams.get('source');
  const topN = Number(url.searchParams.get('limit') || 20);

  const report = await getHeatmapReport(env, { region, asn, sourceUrl, topN });
  return Response.json(report);
}

/** 获取用户地理位置信息 */
export async function handleUserGeo(request) {
  const cf = request?.cf || {};
  const userRegion = getUserRegion(cf);

  return Response.json({
    country: cf.country,
    region: cf.region,
    asn: cf.asn,
    city: cf.city,
    colo: cf.colo,
    isp: cf.asOrganization,
    ...userRegion,
  });
}
