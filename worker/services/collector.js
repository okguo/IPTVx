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

/** 并发拉取多源并解析 */
export async function collectSources() {
  const allEntries = [];

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

  return allEntries;
}

function sourceLabelFromUrl(url) {
  if (url.includes('judy-gotv')) return 'judy-gotv';
  if (url.includes('iptv-org')) return 'iptv-org';
  return 'custom';
}

/** 完整采集流水线：采集 → AI → 高级AI → 测速 → 写 KV/D1 */
export async function runFullPipeline(env) {
  const started = Date.now();
  log.info('开始采集流水线');

  try {
    const rawEntries = await collectSources();
    log.info('原始条目', { count: rawEntries.length });

    let channels = await processChannelsWithAI(rawEntries);
    channels = await processChannelsAdvanced(env, channels);
    log.info('AI 处理后频道', { count: channels.length });

    channels = await validateAllChannels(channels);
    const alive = channels.filter((ch) => ch.sources?.some((s) => s.status !== 'dead'));
    log.info('测速后可用频道', { count: alive.length });

    const playlist = buildM3U(alive, (ch) => ch.sources?.[0]?.url);
    const health = summarizeHealth(alive);
    const embeddings = buildEmbeddingIndex(alive);

    await setKV(env, KV_KEYS.PLAYLIST, playlist, config.KV_TTL.playlist);
    await setJSON(env, KV_KEYS.CHANNELS, alive, 'channels');
    await setJSON(env, KV_KEYS.HEALTH, health, 'health');
    await setJSON(env, KV_KEYS.EMBEDDINGS, embeddings, 'embeddings');

    await generateAndCacheEPG(env, alive);
    await syncChannelsToD1(env, alive);

    const result = { channels: alive, health, playlist };
    await logCronRun(env, result, Date.now() - started);
    log.info('流水线完成', health);
    return result;
  } catch (err) {
    await logCronRun(env, null, Date.now() - started, 'error', String(err));
    throw err;
  }
}

/** @deprecated 使用 runFullPipeline */
export async function updateKV(env) {
  return runFullPipeline(env);
}
