import { KV_KEYS, getJSON, setJSON } from '../utils/cache.js';

/** D1 可用时使用 D1，否则 KV 回退 */
export function hasD1(env) {
  return Boolean(env.DB);
}

/** 将 KV 频道数据同步到 D1 */
export async function syncChannelsToD1(env, channels) {
  if (!hasD1(env) || !channels?.length) return;

  const db = env.DB;
  for (const ch of channels) {
    const existing = await db
      .prepare('SELECT id FROM channels WHERE normalized_name = ?')
      .bind(ch.normalized_name)
      .first();

    let channelId = existing?.id;
    if (!channelId) {
      const r = await db
        .prepare(
          `INSERT INTO channels (name, normalized_name, category, region, group_title, logo, tags)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          ch.name,
          ch.normalized_name,
          ch.category || '',
          ch.region || '',
          ch.group || '',
          ch.logo || '',
          JSON.stringify(ch.tags || []),
        )
        .run();
      channelId = r.meta.last_row_id;
    } else {
      await db
        .prepare(
          `UPDATE channels SET name=?, category=?, region=?, logo=?, tags=?, updated_at=datetime('now') WHERE id=?`,
        )
        .bind(ch.name, ch.category, ch.region, ch.logo, JSON.stringify(ch.tags || []), channelId)
        .run();
      await db.prepare('DELETE FROM streams WHERE channel_id = ?').bind(channelId).run();
    }

    for (const [i, s] of (ch.sources || []).entries()) {
      await db
        .prepare(
          `INSERT INTO streams (channel_id, url, source, latency, status, success_rate, priority)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(channelId, s.url, s.source, s.latency, s.status, s.success_rate ?? 1, i)
        .run();
    }
  }
}

export async function logCronRun(env, result, durationMs, status = 'ok', message = '') {
  const entry = {
    status,
    channels_count: result?.channels?.length ?? 0,
    healthy: result?.health?.healthy ?? 0,
    dead: result?.health?.dead ?? 0,
    duration_ms: durationMs,
    message,
    started_at: new Date().toISOString(),
  };

  const history = (await getJSON(env, KV_KEYS.CRON_HISTORY)) || [];
  history.unshift(entry);
  await setJSON(env, KV_KEYS.CRON_HISTORY, history.slice(0, 50));

  await setJSON(env, KV_KEYS.CRON_STATUS, {
    ...entry,
    last_cron: entry.started_at,
    next_cron: '0 * * * *',
  });

  if (hasD1(env)) {
    await env.DB.prepare(
      `INSERT INTO cron_logs (status, channels_count, healthy, dead, duration_ms, message)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind(entry.status, entry.channels_count, entry.healthy, entry.dead, entry.duration_ms, message)
      .run();
  }
}

export async function getChannelsFromD1(env) {
  if (!hasD1(env)) return null;

  const rows = await env.DB.prepare(
    `SELECT c.*, GROUP_CONCAT(s.url) as urls
     FROM channels c
     LEFT JOIN streams s ON s.channel_id = c.id AND s.status != 'dead'
     WHERE c.enabled = 1
     GROUP BY c.id`,
  ).all();

  return (rows.results || []).map((row) => ({
    id: row.id,
    name: row.name,
    normalized_name: row.normalized_name,
    category: row.category,
    region: row.region,
    group: row.group_title,
    logo: row.logo,
    tags: row.tags ? JSON.parse(row.tags) : [],
    sources: (row.urls || '').split(',').filter(Boolean).map((url) => ({ url, status: 'healthy' })),
  }));
}
