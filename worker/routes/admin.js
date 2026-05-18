import { getJSON, setJSON, KV_KEYS } from '../utils/cache.js';
import { requireAuth, AuthError } from '../services/auth.js';
import { runFullPipeline } from '../services/collector.js';
import { getMetrics } from '../services/metrics.js';
import { summarizeHealth } from '../services/validator.js';

export async function handleAdminApi(request, env, ctx) {
  try {
    requireAuth(ctx.auth, ['admin']);
  } catch (err) {
    if (err instanceof AuthError) {
      return Response.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  const url = new URL(request.url);
  const path = url.pathname;

  if (path === '/api/admin/channels' && request.method === 'GET') {
    const channels = (await getJSON(env, KV_KEYS.CHANNELS)) || [];
    return Response.json({ channels, total: channels.length });
  }

  if (path.startsWith('/api/admin/channels/') && request.method === 'PUT') {
    const id = decodeURIComponent(path.split('/').pop());
    const body = await request.json();
    const channels = (await getJSON(env, KV_KEYS.CHANNELS)) || [];
    const idx = channels.findIndex((c) => c.normalized_name === id || c.name === id);
    if (idx < 0) return Response.json({ error: 'not found' }, { status: 404 });

    channels[idx] = { ...channels[idx], ...body };
    await setJSON(env, KV_KEYS.CHANNELS, channels, 'channels');
    return Response.json({ channel: channels[idx] });
  }

  if (path === '/api/admin/cron/trigger' && request.method === 'POST') {
    const result = await runFullPipeline(env);
    return Response.json({ ok: true, health: result.health });
  }

  if (path === '/api/admin/cron/status' && request.method === 'GET') {
    const status = await getJSON(env, KV_KEYS.CRON_STATUS);
    const history = (await getJSON(env, KV_KEYS.CRON_HISTORY)) || [];
    return Response.json({ status, history: history.slice(0, 20) });
  }

  if (path === '/api/admin/metrics' && request.method === 'GET') {
    const metrics = await getMetrics(env);
    return Response.json(metrics);
  }

  return Response.json({ error: 'not found' }, { status: 404 });
}

export async function handleAdminPage(env) {
  const channels = (await getJSON(env, KV_KEYS.CHANNELS)) || [];
  const health = (await getJSON(env, KV_KEYS.HEALTH)) || summarizeHealth(channels);
  const cronStatus = (await getJSON(env, KV_KEYS.CRON_STATUS)) || {};
  const cronHistory = (await getJSON(env, KV_KEYS.CRON_HISTORY)) || [];
  const metrics = await getMetrics(env, 3);

  const channelRows = channels
    .slice(0, 100)
    .map(
      (ch) => `<tr>
      <td>${esc(ch.normalized_name)}</td>
      <td>${esc(ch.name)}</td>
      <td>${esc(ch.category)}</td>
      <td>${ch.sources?.length || 0}</td>
      <td>${esc(ch.sources?.[0]?.status)}</td>
      <td><button onclick="toggleChannel('${esc(ch.normalized_name)}')">编辑</button></td>
    </tr>`,
    )
    .join('');

  const cronRows = cronHistory
    .slice(0, 10)
    .map(
      (c) => `<tr>
      <td>${esc(c.started_at)}</td>
      <td>${esc(c.status)}</td>
      <td>${c.channels_count}</td>
      <td>${c.healthy}/${c.dead}</td>
      <td>${c.duration_ms}ms</td>
    </tr>`,
    )
    .join('');

  const metricCards = (metrics.days || [])
    .map(
      (d) => `<div class="card"><span>${d.day}</span><strong>${d.visits}</strong><small>访问 / ${d.avg_latency_ms || 0}ms</small></div>`,
    )
    .join('');

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>IPTVx 管理后台</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: system-ui, sans-serif; margin: 0; background: #0f172a; color: #e2e8f0; }
    header { background: #1e293b; padding: 16px 24px; display: flex; justify-content: space-between; align-items: center; }
    main { padding: 24px; max-width: 1400px; margin: 0 auto; }
    h2 { color: #38bdf8; margin-top: 32px; }
    .cards { display: flex; gap: 16px; flex-wrap: wrap; margin: 16px 0; }
    .card { background: #1e293b; padding: 16px; border-radius: 8px; min-width: 140px; }
    .card strong { font-size: 1.5rem; display: block; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 13px; }
    th, td { padding: 8px; border-bottom: 1px solid #334155; text-align: left; }
    th { background: #1e293b; }
    button { background: #38bdf8; color: #0f172a; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: 600; }
    button:hover { background: #7dd3fc; }
    .actions { display: flex; gap: 12px; margin: 16px 0; }
    input { background: #1e293b; border: 1px solid #475569; color: #e2e8f0; padding: 8px; border-radius: 6px; }
  </style>
</head>
<body>
  <header>
    <h1>IPTVx 管理后台</h1>
    <div>
      <input id="apiKey" placeholder="Admin API Key" />
      <button onclick="triggerCron()">立即运行 Cron</button>
    </div>
  </header>
  <main>
    <div class="cards">
      <div class="card"><span>Healthy</span><strong>${health.healthy || 0}</strong></div>
      <div class="card"><span>Dead</span><strong>${health.dead || 0}</strong></div>
      <div class="card"><span>Channels</span><strong>${health.channels || channels.length}</strong></div>
      <div class="card"><span>上次 Cron</span><strong style="font-size:0.9rem">${esc(cronStatus.started_at || '-')}</strong></div>
    </div>

    <h2>访问监控</h2>
    <div class="cards">${metricCards || '<p>暂无数据</p>'}</div>

    <h2>Cron 任务历史</h2>
    <table><thead><tr><th>时间</th><th>状态</th><th>频道数</th><th>健康/失效</th><th>耗时</th></tr></thead>
    <tbody>${cronRows || '<tr><td colspan="5">暂无</td></tr>'}</tbody></table>

    <h2>频道 / 源管理</h2>
    <table><thead><tr><th>ID</th><th>名称</th><th>分类</th><th>源数</th><th>状态</th><th>操作</th></tr></thead>
    <tbody>${channelRows}</tbody></table>
  </main>
  <script>
    function headers() {
      const key = document.getElementById('apiKey').value;
      return key ? { 'X-API-Key': key, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
    }
    async function triggerCron() {
      const r = await fetch('/api/admin/cron/trigger', { method: 'POST', headers: headers() });
      alert(JSON.stringify(await r.json()));
      location.reload();
    }
    function toggleChannel(id) {
      const cat = prompt('新分类 (留空跳过):');
      if (cat === null) return;
      fetch('/api/admin/channels/' + encodeURIComponent(id), {
        method: 'PUT', headers: headers(),
        body: JSON.stringify(cat ? { category: cat } : {})
      }).then(() => location.reload());
    }
  </script>
</body>
</html>`;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');
}
