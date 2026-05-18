import config from '../../config/config.js';

export const KV_KEYS = {
  PLAYLIST: 'playlist',
  CHANNELS: 'channels',
  HEALTH: 'health',
  EPG: 'epg',
  EMBEDDINGS: 'embeddings',
  CRON_STATUS: 'cron:status',
  CRON_HISTORY: 'cron:history',
  METRICS_PREFIX: 'metrics:',
  USER_PREFIX: 'user:',
  SESSION_PREFIX: 'session:',
  APIKEY_PREFIX: 'apikey:',
};

function kv(env) {
  return env.IPTV_KV;
}

export async function getKV(env, key) {
  return kv(env)?.get(key) ?? null;
}

export async function setKV(env, key, value, ttl) {
  const opts = ttl ? { expirationTtl: ttl } : undefined;
  await kv(env)?.put(key, value, opts);
}

export async function getJSON(env, key) {
  const raw = await getKV(env, key);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function setJSON(env, key, value, ttlKey) {
  const ttl = ttlKey ? config.KV_TTL[ttlKey] : undefined;
  await setKV(env, key, JSON.stringify(value), ttl);
}
