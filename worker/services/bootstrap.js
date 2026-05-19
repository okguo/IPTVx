import config from '../../config/config.js';
import { runFastPipeline } from './collector.js';
import { getJSON, setJSON, KV_KEYS } from '../utils/cache.js';

const BOOTSTRAP_LOCK_MS = 5 * 60 * 1000;

function currentSchemaVersion() {
  return config.DATA_SCHEMA_VERSION || 1;
}

function isRecentRunning(status) {
  if (!status || status.status !== 'running') return false;
  const started = Date.parse(status.started_at || '');
  if (!started) return false;
  return Date.now() - started < BOOTSTRAP_LOCK_MS;
}

export async function shouldBootstrap(env) {
  if (!config.PIPELINE?.autoBootstrapOnRequest) return false;

  const [health, channels, bootstrapStatus] = await Promise.all([
    getJSON(env, KV_KEYS.HEALTH),
    getJSON(env, KV_KEYS.CHANNELS),
    getJSON(env, KV_KEYS.BOOTSTRAP_STATUS),
  ]);

  if ((channels?.length ?? 0) > 0 && health?.schema_version === currentSchemaVersion()) {
    return false;
  }

  if (bootstrapStatus?.schema_version === currentSchemaVersion() && isRecentRunning(bootstrapStatus)) {
    return false;
  }

  return true;
}

export async function ensureBootstrap(env, executionCtx) {
  if (!executionCtx?.waitUntil) return false;
  const needed = await shouldBootstrap(env);
  if (!needed) return false;

  const schemaVersion = currentSchemaVersion();
  await setJSON(env, KV_KEYS.BOOTSTRAP_STATUS, {
    status: 'running',
    schema_version: schemaVersion,
    started_at: new Date().toISOString(),
  });

  executionCtx.waitUntil(
    runFastPipeline(env)
      .then(() =>
        setJSON(env, KV_KEYS.BOOTSTRAP_STATUS, {
          status: 'completed',
          schema_version: schemaVersion,
          started_at: new Date().toISOString(),
        }),
      )
      .catch((error) =>
        setJSON(env, KV_KEYS.BOOTSTRAP_STATUS, {
          status: 'failed',
          schema_version: schemaVersion,
          started_at: new Date().toISOString(),
          error: String(error),
        }),
      ),
  );

  return true;
}
