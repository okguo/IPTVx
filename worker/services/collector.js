import config from '../../config/config.js';
import { fetchText } from '../utils/fetch.js';
import { setKV, setJSON, KV_KEYS } from '../utils/cache.js';
import { parseM3U, filterInvalidEntries, buildM3U } from '../utils/parser.js';
import { processChannelsWithAI, buildEmbeddingIndex } from './ai.js';
import { processChannelsAdvanced } from './aiAdvanced.js';
import {
  validateAllChannels,
  validateChannelsLite,
  filterPlayableChannels,
  summarizeHealth,
} from './validator.js';
import { generateAndCacheEPG } from './epg.js';
import { syncChannelsToD1, logCronRun } from './db.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('collector');
const PL = () => config.PIPELINE || {};

export async function collectSources() {
  const allEntries = [];
  const maxRaw = PL().maxRawEntries ?? 4000;

  const results = await Promise.allSettled(
    config.SOURCE_LIST.map(async (url) => {
      const label = sourceLabelFromUrl(url);
      const text = await fetchText(url);
      const parsed = parseM3U(text, label);
      return filterInvalidEntries(parsed);
    }),
  );

  for (const r of results) {
    if (r.status === 'fulfilled') {
      allEntries.push(...r.value);
    } else {
      log.warn('源拉取失败', { error: String(r.reason) });
    }
  }

  if (allEntries.length > maxRaw) {
    log.warn('原始条目超限，已截断', { total: allEntries.length, maxRaw });
    return allEntries.slice(0, maxRaw);
  }
  return allEntries;
}

function sourceLabelFromUrl(url) {
  if (url.includes('iptv-org')) return 'iptv-org';
  if (url.includes('yang-1989')) return 'yang-1989';
  if (url.includes('bit.ly')) return 'bitly';
  return 'custom';
}

async function applyLiteValidation(channels) {
  const pipelineCfg = PL();
  if (pipelineCfg.skipValidation || !pipelineCfg.liteValidate) {
    return channels;
  }

  log.info('开始轻量测速', { count: channels.length });
  const validated = await validateChannelsLite(channels, { pipeline: pipelineCfg });
  const playable = pipelineCfg.playlistOnlyPlayable
    ? filterPlayableChannels(validated)
    : validated;

  log.info('测速完成', {
    input: channels.length,
    validated: validated.length,
    playable: playable.length,
  });
  return playable;
}

async function persistChannels(env, alive, meta = {}) {
  const playlist = buildM3U(alive, (ch) => {
    const s =
      ch.sources?.find((x) => x.status === 'healthy' || x.status === 'unstable') ||
      ch.sources?.find((x) => x.status !== 'dead') ||
      ch.sources?.[0];
    return s?.url;
  });
  const health = summarizeHealth(alive);
  health.pipeline_mode = meta.pipeline_mode || 'fast';
  health.playlist_ready = alive.length > 0;
  health.playable_channels = alive.length;
  if (meta.filtered_out != null) {
    health.filtered_out = meta.filtered_out;
  }
  health.note =
    meta.note ||
    (health.healthy + health.unstable > 0
      ? '已过滤无响应源，M3U 仅含测速通过的频道'
      : '轻量测速后暂无可用源，请检查 SOURCE_LIST 或稍后重试');

  const embeddings = buildEmbeddingIndex(alive.slice(0, 200));

  await setKV(env, KV_KEYS.PLAYLIST, playlist, config.KV_TTL.playlist);
  await setJSON(env, KV_KEYS.CHANNELS, alive, 'channels');
  await setJSON(env, KV_KEYS.HEALTH, health, 'health');
  await setJSON(env, KV_KEYS.EMBEDDINGS, embeddings, 'embeddings');

  return { channels: alive, health, playlist };
}

/** 轻量流水线：采集 → 去重 → 轻量测速 → 过滤失效源 */
export async function runFastPipeline(env) {
  const started = Date.now();
  const pipelineCfg = PL();
  log.info('开始快速采集流水线');

  try {
    const rawEntries = await collectSources();
    log.info('原始条目', { count: rawEntries.length });

    let channels = await processChannelsWithAI(rawEntries, { fast: true });

    const maxCh = pipelineCfg.maxChannels ?? 800;
    if (channels.length > maxCh) {
      channels = channels.slice(0, maxCh);
    }

    const beforeValidate = channels.filter((ch) => ch.sources?.length > 0);
    const alive = await applyLiteValidation(beforeValidate);
    const filteredOut = beforeValidate.length - alive.length;

    log.info('最终可播放频道', { count: alive.length, filteredOut });

    const result = await persistChannels(env, alive, {
      pipeline_mode: 'fast-validated',
      filtered_out: filteredOut,
      note: `已测速并剔除 ${filteredOut} 个不可用频道，M3U 中保留 ${alive.length} 个`,
    });
    await logCronRun(env, result, Date.now() - started, 'ok', 'fast_pipeline');
    return result;
  } catch (err) {
    await logCronRun(env, null, Date.now() - started, 'error', String(err));
    throw err;
  }
}

export async function runFullPipeline(env, options = {}) {
  const started = Date.now();
  const pipelineCfg = PL();
  const skipValidation = options.skipValidation ?? pipelineCfg.skipValidation ?? false;
  log.info('开始完整采集流水线', { skipValidation });

  try {
    const rawEntries = await collectSources();
    let channels = await processChannelsWithAI(rawEntries, { fast: true });

    if (rawEntries.length <= 1000) {
      channels = await processChannelsAdvanced(env, channels);
    }

    const maxCh = pipelineCfg.maxChannels ?? 800;
    if (channels.length > maxCh) {
      channels = channels.slice(0, maxCh);
    }

    let beforeValidate = channels.filter((ch) => ch.sources?.length > 0);
    let alive;

    if (skipValidation) {
      alive = beforeValidate;
    } else if (pipelineCfg.liteValidate) {
      alive = await applyLiteValidation(beforeValidate);
    } else {
      const validateLimit = pipelineCfg.validateMaxChannels ?? 400;
      const validated = await validateAllChannels(beforeValidate.slice(0, validateLimit), {
        timeout: pipelineCfg.validateTimeoutMs ?? 2000,
      });
      alive = filterPlayableChannels(validated);
    }

    const filteredOut = beforeValidate.length - alive.length;
    const result = await persistChannels(env, alive, {
      pipeline_mode: 'full',
      filtered_out: filteredOut,
    });

    const epgLimit = pipelineCfg.skipEpgOverChannels ?? 500;
    if (alive.length <= epgLimit) {
      await generateAndCacheEPG(env, alive);
    }

    const d1Limit = pipelineCfg.skipD1SyncOverChannels ?? 800;
    if (alive.length <= d1Limit) {
      await syncChannelsToD1(env, alive);
    }

    await logCronRun(env, result, Date.now() - started);
    return result;
  } catch (err) {
    await logCronRun(env, null, Date.now() - started, 'error', String(err));
    throw err;
  }
}

export async function updateKV(env) {
  return runFastPipeline(env);
}
