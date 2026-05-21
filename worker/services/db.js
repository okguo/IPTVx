import { KV_KEYS, getJSON, setJSON } from '../utils/cache.js';

/** D1 可用时使用 D1，否则 KV 回退 */
export function hasD1(env) {
  return Boolean(env.DB);
}

/** 将 KV 频道数据同步到 D1（批量 UPSERT 优化） */
export async function syncChannelsToD1(env, channels) {
  if (!hasD1(env) || !channels?.length) return;

  const db = env.DB;

  // 批量处理，每批 50 条
  const batchSize = 50;
  for (let i = 0; i < channels.length; i += batchSize) {
    const batch = channels.slice(i, i + batchSize);

    // 使用批量 UPSERT
    const values = batch.map((ch) =>
      `('${dbEscape(ch.name)}','${dbEscape(ch.normalized_name)}','${dbEscape(ch.category || '')}','${dbEscape(ch.region || '')}','${dbEscape(ch.group || '')}','${dbEscape(ch.logo || '')}','${dbEscape(JSON.stringify(ch.tags || []))}')`,
    ).join(',');

    await db.prepare(
      `INSERT INTO channels (name, normalized_name, category, region, group_title, logo, tags)
       VALUES ${values}
       ON CONFLICT(normalized_name) DO UPDATE SET
         name=excluded.name,
         category=excluded.category,
         region=excluded.region,
         logo=excluded.logo,
         tags=excluded.tags,
         updated_at=datetime('now')`,
    ).run();

    // 批量删除旧 streams 并插入新 streams
    const channelIds = await Promise.all(
      batch.map((ch) =>
        db.prepare('SELECT id FROM channels WHERE normalized_name = ?').bind(ch.normalized_name).first(),
      ),
    );

    const streamValues = [];
    for (let j = 0; j < batch.length; j++) {
      const ch = batch[j];
      const channelId = channelIds[j]?.id;
      if (!channelId) continue;

      for (const [k, s] of (ch.sources || []).entries()) {
        streamValues.push(
          `(${channelId},'${dbEscape(s.url)}','${dbEscape(s.source)}',${s.latency ?? 'NULL'},'${dbEscape(s.status)}',${s.success_rate ?? 1},${k})`,
        );
      }
    }

    if (streamValues.length > 0) {
      const idsToDelete = channelIds.filter(Boolean).map((r) => r.id).join(',');
      if (idsToDelete) {
        await db.prepare(`DELETE FROM streams WHERE channel_id IN (${idsToDelete})`).run();
      }

      await db.prepare(
        `INSERT INTO streams (channel_id, url, source, latency, status, success_rate, priority)
         VALUES ${streamValues.join(',')}`,
      ).run();
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

/** 转义 SQL 字符串（防止 SQL 注入） */
function dbEscape(str) {
  if (str == null) return '';
  return String(str).replace(/'/g, "''");
}
