import config from '../../config/config.js';

/**
 * 解析 M3U / M3U8 播放列表为统一频道条目
 * @returns {Array<{name:string,group:string,logo:string,url:string,tvgId:string,source:string}>}
 */
const BROADCAST_PROTOCOLS = ['udp://', 'rtp://', 'rtsp://', 'igmp://'];
const BROADCAST_GROUP_PATTERNS = [
  /广播/i,
  /电台/i,
  /\bradio\b/i,
  /\bfm\b/i,
  /\bam\b/i,
  /组播/i,
  /multicast/i,
];
const BROADCAST_NAME_PATTERNS = [
  /广播/i,
  /电台/i,
  /\bradio\b/i,
  /中国之声/i,
  /经济之声/i,
  /音乐之声/i,
  /交通广播/i,
  /都市之声/i,
  /文艺之声/i,
  /调频/i,
  /频率/i,
  /FM\d+(?:\.\d+)?/i,
  /AM\d+(?:\.\d+)?/i,
];
const CJK_RE = /[\u3400-\u9fff]/;

export function parseM3U(content, sourceLabel = 'unknown') {
  const lines = content.split(/\r?\n/);
  const entries = [];
  let pending = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line === '#EXTM3U') continue;

    if (line.startsWith('#EXTINF:')) {
      pending = parseExtinf(line, sourceLabel);
    } else if (!line.startsWith('#') && pending) {
      pending.url = line;
      entries.push(pending);
      pending = null;
    }
  }
  return entries;
}

function parseExtinf(line, sourceLabel) {
  const tvgId = matchAttr(line, 'tvg-id');
  const tvgName = matchAttr(line, 'tvg-name');
  const logo = matchAttr(line, 'tvg-logo');
  const group = matchAttr(line, 'group-title');
  const display = line.includes(',') ? line.slice(line.lastIndexOf(',') + 1).trim() : 'Unknown';

  return {
    name: tvgName || display,
    group: group || '',
    logo: logo || '',
    tvgId: tvgId || '',
    url: '',
    source: sourceLabel,
  };
}

function matchAttr(line, key) {
  const re = new RegExp(`${key}="([^"]*)"`, 'i');
  return line.match(re)?.[1] ?? '';
}

/** 过滤空 URL、组播协议及广播/电台类条目，仅保留直播视频源 */
export function filterInvalidEntries(entries) {
  return entries.filter((e) => {
    const url = (e.url || '').trim();
    if (!url) return false;
    const lower = url.toLowerCase();
    if (BROADCAST_PROTOCOLS.some((protocol) => lower.startsWith(protocol))) return false;
    if (isBroadcastEntry(e)) return false;
    if (isNonChineseEntry(e)) return false;
    return true;
  });
}

export function isBroadcastEntry(entry) {
  const name = `${entry.name || ''} ${entry.tvgId || ''}`.trim();
  const group = entry.group || '';
  const url = (entry.url || '').toLowerCase();

  if (BROADCAST_PROTOCOLS.some((protocol) => url.startsWith(protocol))) {
    return true;
  }

  if (BROADCAST_GROUP_PATTERNS.some((pattern) => pattern.test(group))) {
    return true;
  }

  if (BROADCAST_NAME_PATTERNS.some((pattern) => pattern.test(name))) {
    return true;
  }

  return false;
}

export function isNonChineseEntry(entry) {
  if (!config.CHANNEL_FILTER?.chineseRegionOnly) return false;

  const name = `${entry.name || ''}`.trim();
  const group = `${entry.group || ''}`.trim();
  const text = `${name} ${group}`.trim();
  const upper = text.toUpperCase();

  if (!text) return false;

  const allowLatinBrands = config.CHANNEL_FILTER.allowLatinBrands || [];
  if (allowLatinBrands.some((token) => upper.includes(String(token).toUpperCase()))) {
    return false;
  }

  const blockedGroups = config.CHANNEL_FILTER.blockedGroups || [];
  if (blockedGroups.some((pattern) => pattern.test(group))) return true;

  const blockedCountryHints = config.CHANNEL_FILTER.blockedCountryHints || [];
  if (blockedCountryHints.some((pattern) => pattern.test(text))) return true;

  const blockedNames = config.CHANNEL_FILTER.blockedNames || [];
  if (blockedNames.some((pattern) => pattern.test(name) || pattern.test(text))) return true;

  const blockedUrlPatterns = config.CHANNEL_FILTER.blockedUrlPatterns || [];
  const url = `${entry.url || ''}`;
  if (blockedUrlPatterns.some((pattern) => pattern.test(url))) return true;

  if (CJK_RE.test(text)) return false;

  return /^[A-Z0-9\s._+-]+$/i.test(text);
}

/** 将频道列表序列化为 M3U */
export function buildM3U(channels, pickUrl) {
  const lines = ['#EXTM3U'];
  for (const ch of channels) {
    const url = pickUrl ? pickUrl(ch) : ch.sources?.[0]?.url;
    if (!url) continue;

    const attrs = ['-1'];
    if (ch.logo) attrs.push(`tvg-logo="${escapeAttr(ch.logo)}"`);
    if (ch.normalized_name || ch.name) {
      attrs.push(`tvg-name="${escapeAttr(ch.normalized_name || ch.name)}"`);
    }
    if (ch.tvgId) attrs.push(`tvg-id="${escapeAttr(ch.tvgId)}"`);
    const groupTitle = ch.playlist_group || ch.category || ch.group || '其他';
    attrs.push(`group-title="${escapeAttr(groupTitle)}"`);
    if (ch.region) attrs.push(`tvg-country="${escapeAttr(ch.region)}"`);

    const tags = (ch.tags || []).join(',');
    if (tags) attrs.push(`tvg-tags="${escapeAttr(tags)}"`);

    lines.push(`#EXTINF:${attrs.join(' ')},${ch.name}`);
    lines.push(url);
  }
  return lines.join('\n') + '\n';
}

function escapeAttr(value) {
  return String(value).replace(/"/g, "'");
}
