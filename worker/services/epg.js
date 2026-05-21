import config from '../../config/config.js';
import { fetchText } from '../utils/fetch.js';
import { getKV, setKV, getJSON, KV_KEYS } from '../utils/cache.js';
import { normalizeChannel } from './ai.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('epg');

/** EPG 频道 ID 映射表（标准化名称 → XMLTV ID） */
const TVG_ID_MAP = {
  'CCTV1': 'CCTV1.cn',
  'CCTV2': 'CCTV2.cn',
  'CCTV3': 'CCTV3.cn',
  'CCTV4': 'CCTV4.cn',
  'CCTV5': 'CCTV5.cn',
  'CCTV5+': 'CCTV5plus.cn',
  'CCTV6': 'CCTV6.cn',
  'CCTV7': 'CCTV7.cn',
  'CCTV8': 'CCTV8.cn',
  'CCTV9': 'CCTV9.cn',
  'CCTV10': 'CCTV10.cn',
  'CCTV11': 'CCTV11.cn',
  'CCTV12': 'CCTV12.cn',
  'CCTV13': 'CCTV13.cn',
  'CCTV14': 'CCTV14.cn',
  'CCTV15': 'CCTV15.cn',
  'CCTV16': 'CCTV16.cn',
  'CCTV17': 'CCTV17.cn',
  '湖南卫视': 'HunanTV.cn',
  '浙江卫视': 'ZhejiangTV.cn',
  '东方卫视': 'DragonTV.cn',
  '江苏卫视': 'JiangsuTV.cn',
  '北京卫视': 'BeijingTV.cn',
  '凤凰中文': 'PhoenixChinese.hk',
  '凤凰资讯': 'PhoenixInfo.hk',
  'TVB翡翠台': 'TVBJade.hk',
  'TVB明珠台': 'TVBPearl.hk',
};

/** 获取当前时间（XMLTV 格式） */
function getXmltvTime(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, '').slice(0, 15) + ' +0800';
}

/** 获取当前节目的时间范围 */
function getCurrentProgrammeTimeslot(durationHours = 2) {
  const now = new Date();
  const start = getXmltvTime(now);
  const end = getXmltvTime(new Date(now.getTime() + durationHours * 60 * 60 * 1000));
  return { start, end };
}

/** 拉取并合并多个 XMLTV 源 */
export async function fetchEpgSources() {
  const chunks = [];

  for (const url of config.EPG_SOURCES) {
    try {
      const xml = await fetchText(url, { timeout: 15000 });
      chunks.push(xml);
    } catch (err) {
      log.warn('EPG 拉取失败', { url, error: String(err) });
    }
  }

  return chunks;
}

/** 从 XMLTV 提取与频道匹配的 programme 块（支持智能 XMLTV ID 映射） */
export function matchEpgForChannels(xmlChunks, channels) {
  const names = new Set(
    channels.flatMap((ch) => [
      normalizeChannel(ch.normalized_name || ch.name),
      normalizeChannel(ch.name),
      (ch.tvgId || '').toLowerCase(),
    ]),
  );

  // 构建 XMLTV ID 映射
  const tvgIdMap = new Map();
  for (const ch of channels) {
    const normName = ch.normalized_name || ch.name;
    if (TVG_ID_MAP[normName]) {
      tvgIdMap.set(TVG_ID_MAP[normName].toLowerCase(), normName);
    }
  }

  const matchedProgrammes = [];
  const channelBlocks = [];
  const matchedChannelIds = new Set();

  for (const xml of xmlChunks) {
    if (!xml) continue;

    const channelRe = /<channel[^>]*id="([^"]*)"[^>]*>[\s\S]*?<\/channel>/gi;
    let m;
    while ((m = channelRe.exec(xml)) !== null) {
      const block = m[0];
      const id = m[1];
      if (channelIdMatches(id, block, names) || tvgIdMap.has(id.toLowerCase())) {
        if (!matchedChannelIds.has(id)) {
          channelBlocks.push(block);
          matchedChannelIds.add(id);
        }
      }
    }

    const progRe = /<programme[\s\S]*?<\/programme>/gi;
    let p;
    while ((p = progRe.exec(xml)) !== null) {
      const block = p[0];
      const channelAttr = block.match(/channel="([^"]*)"/i)?.[1] || '';
      if (channelIdMatches(channelAttr, block, names) || tvgIdMap.has(channelAttr.toLowerCase())) {
        matchedProgrammes.push(block);
      }
    }
  }

  // 如果 XML 数据不足，为未匹配的频道生成占位节目
  if (channels.length > 0 && matchedProgrammes.length < channels.length * 2) {
    const fallbackProgrammes = generateFallbackProgrammes(channels, tvgIdMap);
    matchedProgrammes.push(...fallbackProgrammes);
  }

  return buildXmltvDocument(channelBlocks, matchedProgrammes);
}

/** 为未匹配的频道生成占位节目 */
function generateFallbackProgrammes(channels, tvgIdMap) {
  const programmes = [];
  const { start, end } = getCurrentProgrammeTimeslot();

  for (const ch of channels) {
    const normName = ch.normalized_name || ch.name;
    const tvgId = ch.tvgId || TVG_ID_MAP[normName] || `${normName.toLowerCase()}.custom`;

    programmes.push(
      `<programme start="${start}" stop="${end}" channel="${tvgId}">` +
      `<title lang="zh">${normName} 直播</title>` +
      `<desc lang="zh">${normName} 实时直播</desc>` +
      `<category lang="zh">${ch.category || '其他'}</category>` +
      `</programme>`,
    );
  }

  return programmes;
}

function channelIdMatches(id, block, names) {
  const idNorm = normalizeChannel(id);
  if (names.has(idNorm) || names.has(id.toLowerCase())) return true;

  const display = block.match(/<display-name[^>]*>([^<]*)<\/display-name>/i)?.[1];
  if (display && names.has(normalizeChannel(display))) return true;

  return false;
}

function buildXmltvDocument(channels, programmes) {
  const uniqueChannels = [...new Set(channels)];
  const uniqueProgs = [...new Set(programmes)].slice(0, 5000);

  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<tv generator-info-name="IPTVx">\n' +
    uniqueChannels.join('\n') +
    '\n' +
    uniqueProgs.join('\n') +
    '\n</tv>\n'
  );
}

export async function generateAndCacheEPG(env, channels) {
  const chunks = await fetchEpgSources();
  const xml =
    channels?.length > 0
      ? matchEpgForChannels(chunks, channels)
      : chunks.join('\n') || emptyXmltv();

  await setKV(env, KV_KEYS.EPG, xml, config.KV_TTL.epg);
  return xml;
}

function emptyXmltv() {
  return '<?xml version="1.0" encoding="UTF-8"?>\n<tv generator-info-name="IPTVx"></tv>\n';
}

export async function generateEPG(env) {
  const cached = await getKV(env, KV_KEYS.EPG);
  if (cached) return cached;

  const channels = (await getJSON(env, KV_KEYS.CHANNELS)) || [];
  return generateAndCacheEPG(env, channels);
}
