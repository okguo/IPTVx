/**
 * 解析 M3U / M3U8 播放列表为统一频道条目
 * @returns {Array<{name:string,group:string,logo:string,url:string,tvgId:string,source:string}>}
 */
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

/** 过滤 udp/rtp 协议与空 URL */
export function filterInvalidEntries(entries) {
  return entries.filter((e) => {
    const url = (e.url || '').trim();
    if (!url) return false;
    const lower = url.toLowerCase();
    if (lower.startsWith('udp://') || lower.startsWith('rtp://')) return false;
    return true;
  });
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
    const groupTitle = ch.group || ch.category || '其他';
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
