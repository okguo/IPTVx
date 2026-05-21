import config from '../../config/config.js';
import { fetchText } from '../utils/fetch.js';
import { setKV, setJSON, KV_KEYS } from '../utils/cache.js';
import { parseM3U, filterInvalidEntries, buildM3U } from '../utils/parser.js';
import { processChannelsWithAI, buildEmbeddingIndex, channelPriorityScore } from './ai.js';
import { processChannelsAdvanced } from './aiAdvanced.js';
import {
  validateAllChannels,
  validateChannelsLite,
  filterPlayableChannels,
  summarizeHealth,
} from './validator.js';
import { generateAndCacheEPG } from './epg.js';
import { syncChannelsToD1, logCronRun } from './db.js';
import { enrichChannelLogos } from './logo.js';
import { batchRecordValidationResults } from './validationHistory.js';
import { batchRecordSourceTests, recordSourceTest } from './sourceManager.js';
import { computeBatchHealthScores, getHealthScoreDistribution } from './healthScore.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('collector');
const PL = () => config.PIPELINE || {};

export async function collectSources(env) {
  const allEntries = [];
  const maxRaw = PL().maxRawEntries ?? 4000;
  const sourceList = [...(config.SOURCE_LIST || []), ...(config.MIGU_SOURCE_LIST || [])];
  const sourceResults = []; // 用于记录源测试结果

  const results = await Promise.allSettled(
    sourceList.map(async (item) => {
      const url = typeof item === 'string' ? item : item.url;
      const label = typeof item === 'string' ? sourceLabelFromUrl(item) : item.source || 'custom';
      const start = Date.now();

      try {
        const text = await fetchText(url);
        const parsed = parseM3U(text, label);
        const filtered = filterInvalidEntries(parsed);
        const latency = Date.now() - start;

        // 记录源测试结果
        sourceResults.push({ url, label, success: true, latency, channel_count: filtered.length });
        return filtered;
      } catch (err) {
        sourceResults.push({ url, label, success: false, latency: Date.now() - start });
        log.warn('源拉取失败', { url, label, error: String(err) });
        return [];
      }
    }),
  );

  // 批量记录源测试结果
  if (env && sourceResults.length > 0) {
    await batchRecordSourceTests(env, sourceResults);
  }

  for (const r of results) {
    if (r.status === 'fulfilled' && r.value.length > 0) {
      allEntries.push(...r.value);
    }
  }

  // 爬取咖啡直播源（体育频道）
  if (config.KAFEI_SOURCE?.enabled) {
    try {
      const kafeiEntries = await fetchKafeiSports();
      allEntries.push(...kafeiEntries);
      log.info('咖啡直播源', { count: kafeiEntries.length });
    } catch (e) {
      log.warn('咖啡直播源爬取失败', { error: String(e) });
    }
  }

  // 添加咪咕体育静态源
  const miguEntries = getMiguStaticSources();
  if (miguEntries.length > 0) {
    allEntries.push(...miguEntries);
    log.info('咪咕体育源', { count: miguEntries.length });
  }

  if (allEntries.length > maxRaw) {
    log.warn('原始条目超限，已截断', { total: allEntries.length, maxRaw });
    return allEntries.slice(0, maxRaw);
  }
  return allEntries;
}

/**
 * 爬取咖啡直播体育频道
 * API: https://www.kafeizhibo.com/api/v1/archor
 * 频道名称格式：赛事类型 主队 vs 客队（主播名）
 */
async function fetchKafeiSports() {
  const apiUrl = config.KAFEI_SOURCE.apiUrl;
  const res = await fetch(apiUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
  });

  if (!res.ok) {
    throw new Error(`Kafei API error: ${res.status}`);
  }

  const json = await res.json();
  if (json.code !== 200) {
    throw new Error(`Kafei API returned error: ${json.message}`);
  }

  const archors = json.data || [];
  const entries = [];

  for (const a of archors) {
    if (!a.stream_url || (a.status !== 'live' && a.status !== 'online')) continue;

    // 构建频道名称：赛事 主队 vs 客队（主播名）
    const title = (a.title || '').trim();
    const archorName = (a.name || '').trim();
    const league = a.league_name || '';
    const homeTeam = a.match_info?.home_team || '';
    const awayTeam = a.match_info?.away_team || '';

    let displayName;
    if (title && !/^[A-Za-z0-9]+$/.test(title)) {
      // 标题包含赛事信息
      displayName = archorName && !/^\d+$/.test(archorName) ? `${title}（${archorName}）` : title;
    } else if (homeTeam && awayTeam) {
      // 从 match_info 构建
      displayName = `${league} ${homeTeam} vs ${awayTeam}`;
      if (archorName && !/^\d+$/.test(archorName)) displayName += `（${archorName}）`;
    } else {
      displayName = archorName || `主播${a.room_id}`;
    }

    // 分类映射
    const categoryMap = {
      0: '体育-综合',
      1: '体育-足球',
      2: '体育-篮球',
      3: '体育-综合',
    };
    const category = categoryMap[a.category] || '体育-综合';

    entries.push({
      name: displayName,
      group: category,
      category: '体育',
      playlist_group: category,
      logo: a.avatar ? `https://www.kafeizhibo.com${a.avatar}` : '',
      tvgId: '',
      url: a.stream_url,
      source: 'kafei',
      meta: {
        league,
        title: a.title || '',
        homeTeam,
        awayTeam,
        heat: a.heat || 0,
      },
    });
  }

  return entries;
}

/**
 * 获取咪咕体育静态源列表
 */
function getMiguStaticSources() {
  const miguConfig = config.MIGU_SOURCE;
  if (!miguConfig?.enabled) return [];

  const staticList = miguConfig.staticList || [];
  return staticList.map((item) => ({
    name: item.name,
    group: item.category || '咪咕体育',
    category: '体育',
    playlist_group: item.category || '咪咕体育',
    logo: item.logo || '',
    tvgId: '',
    url: item.url,
    source: 'migu',
    meta: {
      league: item.league || '',
      homeTeam: item.homeTeam || '',
      awayTeam: item.awayTeam || '',
    },
  }));
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

  let playableValidated;
  if (pipelineCfg.playlistOnlyPlayable) {
    // 重要频道（央视频道/卫视频道/港澳台）即使测速失败也保留
    const preserveCats = new Set(pipelineCfg.preserveCategories || []);
    if (preserveCats.size > 0) {
      const importantChannels = validated.filter((ch) => preserveCats.has(ch.category));
      const otherPlayable = filterPlayableChannels(
        validated.filter((ch) => !preserveCats.has(ch.category)),
      );
      playableValidated = [...importantChannels, ...otherPlayable];
    } else {
      playableValidated = filterPlayableChannels(validated);
    }
  } else {
    playableValidated = validated;
  }

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
  // Logo 自动补全
  const logoResult = await enrichChannelLogos(alive, env);
  const enrichedChannels = logoResult.channels;

  // 计算健康评分
  const scoredChannels = computeBatchHealthScores(enrichedChannels);
  const healthDistribution = getHealthScoreDistribution(scoredChannels);

  const playlist = buildM3U(scoredChannels, (ch) => {
    // 优先选择策略：healthy/unstable 的 HTTPS 源 > healthy/unstable 的 HTTP 源 > 其他
    const httpsSources = ch.sources?.filter((x) => x.url.startsWith('https://')) || [];
    const httpSources = ch.sources?.filter((x) => x.url.startsWith('http://')) || [];

    // 先找健康的 HTTPS 源
    const healthyHttps = httpsSources.find((x) => x.status === 'healthy' || x.status === 'unstable');
    if (healthyHttps) return healthyHttps.url;

    // 再找健康的 HTTP 源
    const healthyHttp = httpSources.find((x) => x.status === 'healthy' || x.status === 'unstable');
    if (healthyHttp) return healthyHttp.url;

    // 最后兜底：任意非 dead 源
    const nonDead = ch.sources?.find((x) => x.status !== 'dead');
    if (nonDead) return nonDead.url;

    // 最终兜底：第一个源
    return ch.sources?.[0]?.url;
  });
  const health = summarizeHealth(scoredChannels);
  health.pipeline_mode = meta.pipeline_mode || 'fast';
  health.schema_version = config.DATA_SCHEMA_VERSION || 1;
  health.playlist_ready = scoredChannels.length > 0;
  health.playable_channels = scoredChannels.length;
  health.health_distribution = healthDistribution;
  if (meta.filtered_out != null) {
    health.filtered_out = meta.filtered_out;
  }
  health.note =
    meta.note ||
    (health.healthy + health.unstable > 0
      ? '已过滤无响应源，M3U 仅含测速通过的频道'
      : '轻量测速后暂无可用源，请检查 SOURCE_LIST 或稍后重试');

  const embeddings = buildEmbeddingIndex(scoredChannels.slice(0, 200));

  await setKV(env, KV_KEYS.PLAYLIST, playlist, config.KV_TTL.playlist);
  await setJSON(env, KV_KEYS.CHANNELS, scoredChannels, 'channels');
  await setJSON(env, KV_KEYS.HEALTH, health, 'health');
  await setJSON(env, KV_KEYS.EMBEDDINGS, embeddings, 'embeddings');

  // 记录测速历史
  if (scoredChannels.length > 0) {
    await batchRecordValidationResults(env, scoredChannels);
  }

  return { channels: scoredChannels, health, playlist };
}

/** 轻量流水线：采集 → 去重 → 轻量测速 → 过滤失效源 */
export async function runFastPipeline(env) {
  const started = Date.now();
  const pipelineCfg = PL();
  log.info('开始快速采集流水线');

  try {
    const rawEntries = await collectSources(env);
    log.info('原始条目', { count: rawEntries.length });

    let channels = await processChannelsWithAI(rawEntries, { fast: true });

    // 白名单过滤：只保留核心频道
    const whitelist = config.CHANNEL_WHITELIST;
    if (whitelist?.enabled) {
      const beforeWhitelist = channels.length;
      channels = channels.filter((ch) => {
        const cat = ch.category || '';
        const name = ch.normalized_name || ch.name || '';
        const quality = ch.quality || 'SD';

        // 4K/8K 超高清频道：优先保留
        if (cat === '4K超高清') {
          const ultraHdList = whitelist.ultra_hd || [];
          if (ultraHdList.some((w) => name.toUpperCase().includes(w.toUpperCase()) || quality === '8K' || quality === '4K')) {
            return true;
          }
        }

        // 央视频道：精确匹配标准化名称
        if (cat === '央视频道') {
          return (whitelist.cctv || []).some((w) => name.toUpperCase().includes(w.toUpperCase()));
        }

        // 卫视频道：包含关键词即可
        if (cat === '卫视频道') {
          return (whitelist.satellite || []).some((w) => name.includes(w));
        }

        // 港澳台：包含关键词即可
        if (cat === '港澳台') {
          return (whitelist.hkmo || []).some((w) => name.includes(w));
        }

        // 体育频道：匹配正则模式 或 来自咖啡直播源
        if (cat === '体育') {
          const isKafei = ch.sources?.some((s) => s.source === 'kafei') || ch.source === 'kafei';
          if (isKafei) return true; // 咖啡直播源直接通过
          return (whitelist.sports_patterns || []).some((p) => p.test(name));
        }

        // 影视频道：匹配正则模式
        if (cat === '影视') {
          return (whitelist.movies_patterns || []).some((p) => p.test(name));
        }

        // 少儿动漫：匹配正则模式
        if (cat === '少儿动漫') {
          return (whitelist.kids_patterns || []).some((p) => p.test(name));
        }

        // 其他分类：不保留（只保留上述分类）
        return false;
      });
      log.info('白名单过滤', { before: beforeWhitelist, after: channels.length });
    }

    channels.sort((a, b) => channelPriorityScore(b) - channelPriorityScore(a));

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
    const rawEntries = await collectSources(env);
    let channels = await processChannelsWithAI(rawEntries, { fast: true });
    channels.sort((a, b) => channelPriorityScore(b) - channelPriorityScore(a));

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
