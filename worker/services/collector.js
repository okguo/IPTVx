import config from '../../config/config.js';
import { fetchText } from '../utils/fetch.js';
import { setKV, setJSON, KV_KEYS } from '../utils/cache.js';
import { parseM3U, filterInvalidEntries, buildM3U } from '../utils/parser.js';
import { processChannelsWithAI, buildEmbeddingIndex } from './ai.js';
import { processChannelsAdvanced } from './aiAdvanced.js';
import { validateAllChannels, summarizeHealth } from './validator.js';
import { generateAndCacheEPG } from './epg.js';
import { syncChannelsToD1, logCronRun } from './db.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('collector');
const PL = () => config.PIPELINE || {};

/** 并发拉取多源并解析 */
export async function collectSources() {
  const allEntries = [];
  const maxRaw = PL().maxRawEntries ?? 12000;

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

/** 未参与 HEAD 测速的源标记为 unknown（仍可播放） */
function markUnvalidatedSources(channels) {
  return channels.map((ch) => ({
    ...ch,
    sources: (ch.sources || []).map((s) =>
      s.status && s.status !== 'unknown'
        ? s
        : { ...s, status: 'unknown', success_rate: s.success_rate ?? 1, latency: s.latency ?? null },
    ),
  }));
}

/**
 * 完整采集流水线：采集 → AI → 测速（抽样）→ 写 KV
 * 大列表仅对前 validateMaxChannels 个频道做 HEAD，其余保留为 unknown
 */
export async function runFullPipeline(env, options = {}) {
  const started = Date.now();
  const pipelineCfg = PL();
  log.info('开始采集流水线');

  try {
    const rawEntries = await collectSources();
    log.info('原始条目', { count: rawEntries.length });

    let channels = await processChannelsWithAI(rawEntries);
    channels = await processChannelsAdvanced(env, channels);

    const maxCh = options.maxChannels ?? pipelineCfg.maxChannels ?? 2500;
    if (channels.length > maxCh) {
      log.warn('频道数超限，已截断', { total: channels.length, maxCh });
      channels = channels.slice(0, maxCh);
    }
    log.info('AI 处理后频道', { count: channels.length });

    const validateLimit = options.validateMaxChannels ?? pipelineCfg.validateMaxChannels ?? 400;
    const toValidate = channels.slice(0, validateLimit);
    const rest = channels.slice(validateLimit);

    const validated = await validateAllChannels(toValidate, {
      timeout: pipelineCfg.validateTimeoutMs ?? 3000,
    });
    const aliveValidated = validated.filter((ch) => ch.sources?.some((s) => s.status !== 'dead'));
    const aliveRest = markUnvalidatedSources(rest).filter((ch) => ch.sources?.length > 0);
    const alive = [...aliveValidated, ...aliveRest];

    log.info('测速后可用频道', {
      count: alive.length,
      validated: aliveValidated.length,
      unvalidated: aliveRest.length,
    });

    const playlist = buildM3U(alive, (ch) => {
      const s = ch.sources?.find((x) => x.status !== 'dead') || ch.sources?.[0];
      return s?.url;
    });
    const health = summarizeHealth(alive);
    const embeddings = buildEmbeddingIndex(alive.slice(0, 500));

    await setKV(env, KV_KEYS.PLAYLIST, playlist, config.KV_TTL.playlist);
    await setJSON(env, KV_KEYS.CHANNELS, alive, 'channels');
    await setJSON(env, KV_KEYS.HEALTH, health, 'health');
    await setJSON(env, KV_KEYS.EMBEDDINGS, embeddings, 'embeddings');

    const epgLimit = pipelineCfg.skipEpgOverChannels ?? 800;
    if (alive.length <= epgLimit) {
      await generateAndCacheEPG(env, alive);
    } else {
      log.warn('频道过多，跳过本次 EPG 生成', { count: alive.length, epgLimit });
    }

    const d1Limit = pipelineCfg.skipD1SyncOverChannels ?? 1500;
    if (alive.length <= d1Limit) {
      await syncChannelsToD1(env, alive);
    }

    const result = { channels: alive, health, playlist };
    await logCronRun(env, result, Date.now() - started);
    log.info('流水线完成', health);
    return result;
  } catch (err) {
    await logCronRun(env, null, Date.now() - started, 'error', String(err));
    throw err;
  }
}

export async function updateKV(env) {
  return runFullPipeline(env);
}
