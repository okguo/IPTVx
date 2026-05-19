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
  const sourceList = [...(config.SOURCE_LIST || []), ...(config.MIGU_SOURCE_LIST || [])];

  const results = await Promise.allSettled(
    sourceList.map(async (item) => {
      if (typeof item === 'string') {
        const label = sourceLabelFromUrl(item);
        const text = await fetchText(item);
        const parsed = parseM3U(text, label);
        return filterInvalidEntries(parsed);
      }
      return normalizeCuratedSourceItem(item);
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
  if (/migu|miguvideo|aikanvod|cmvideo/i.test(url)) return 'migu';
  if (url.includes('bit.ly')) return 'bitly';
  return 'custom';
}

function normalizeCuratedSourceItem(item) {
  if (!item?.url || !item?.name) {
    throw new Error('invalid curated source item: name and url are required');
  }

  const category = item.category || '咪咕体育';
  const subcategory = item.subcategory || '';
  const playlistGroup = subcategory ? `${category}-${subcategory}` : category;

  return filterInvalidEntries([
    {
      name: item.name,
      group: playlistGroup,
      category,
      playlist_group: playlistGroup,
      logo: item.logo || '',
      tvgId: item.tvgId || '',
      url: item.url,
      source: item.source || sourceLabelFromUrl(item.url),
      tags: item.tags || [],
    },
  ]);
}

export async function applyLiteValidation(channels) {
  const pipelineCfg = PL();
  if (pipelineCfg.skipValidation || !pipelineCfg.liteValidate) {
    return {
      channels,
      meta: {
        validated: 0,
        skipped_validation: 0,
        playable_validated: 0,
        failed_validation: 0,
      },
    };
  }

  const validateCap = pipelineCfg.liteValidateMaxChannels ?? channels.length;
  const toValidate = channels.slice(0, validateCap);
  const skipped = channels.slice(validateCap);

  log.info('开始轻量测速', {
    count: channels.length,
    validateCap,
    skipped: skipped.length,
  });

  const validated = await validateChannelsLite(toValidate, { pipeline: pipelineCfg });
  const playableValidated = pipelineCfg.playlistOnlyPlayable
    ? filterPlayableChannels(validated)
    : validated;
  const combined = [...playableValidated, ...skipped];

  log.info('测速完成', {
    input: channels.length,
    validated: validated.length,
    playableValidated: playableValidated.length,
    skippedValidation: skipped.length,
    finalChannels: combined.length,
  });

  return {
    channels: combined,
    meta: {
      validated: validated.length,
      skipped_validation: skipped.length,
      playable_validated: playableValidated.length,
      failed_validation: validated.length - playableValidated.length,
    },
  };
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
  health.schema_version = config.DATA_SCHEMA_VERSION || 1;
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
    const { channels: alive, meta: validationMeta } = await applyLiteValidation(beforeValidate);
    const filteredOut = validationMeta.failed_validation ?? (beforeValidate.length - alive.length);

    log.info('最终可播放频道', {
      count: alive.length,
      filteredOut,
      skippedValidation: validationMeta.skipped_validation,
    });

    const result = await persistChannels(env, alive, {
      pipeline_mode: 'fast-validated',
      filtered_out: filteredOut,
      validated_channels: validationMeta.validated,
      skipped_validation: validationMeta.skipped_validation,
      note: validationMeta.skipped_validation
        ? `已测速 ${validationMeta.validated} 个频道，剔除 ${filteredOut} 个不可用频道，另有 ${validationMeta.skipped_validation} 个频道因快速模式未测速但仍保留在 M3U 中`
        : `已测速并剔除 ${filteredOut} 个不可用频道，M3U 中保留 ${alive.length} 个`,
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
      const liteResult = await applyLiteValidation(beforeValidate);
      alive = liteResult.channels;
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
