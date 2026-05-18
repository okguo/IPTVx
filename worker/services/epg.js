import config from '../../config/config.js';
import { fetchText } from '../utils/fetch.js';
import { getKV, setKV, getJSON, KV_KEYS } from '../utils/cache.js';
import { normalizeChannel } from './ai.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('epg');

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

/** 从 XMLTV 提取与频道匹配的 programme 块 */
export function matchEpgForChannels(xmlChunks, channels) {
  const names = new Set(
    channels.flatMap((ch) => [
      normalizeChannel(ch.normalized_name || ch.name),
      normalizeChannel(ch.name),
      (ch.tvgId || '').toLowerCase(),
    ]),
  );

  const matchedProgrammes = [];
  const channelBlocks = [];

  for (const xml of xmlChunks) {
    if (!xml) continue;

    const channelRe = /<channel[^>]*id="([^"]*)"[^>]*>[\s\S]*?<\/channel>/gi;
    let m;
    while ((m = channelRe.exec(xml)) !== null) {
      const block = m[0];
      const id = m[1];
      if (channelIdMatches(id, block, names)) {
        channelBlocks.push(block);
      }
    }

    const progRe = /<programme[\s\S]*?<\/programme>/gi;
    let p;
    while ((p = progRe.exec(xml)) !== null) {
      const block = p[0];
      const channelAttr = block.match(/channel="([^"]*)"/i)?.[1] || '';
      if (channelIdMatches(channelAttr, block, names)) {
        matchedProgrammes.push(block);
      }
    }
  }

  return buildXmltvDocument(channelBlocks, matchedProgrammes);
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
