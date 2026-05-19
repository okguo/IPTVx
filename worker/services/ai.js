import config from '../../config/config.js';

const NORMALIZE_PATTERNS = [
  [/CCTV[-\s]*1|央视1|中央1/i, 'CCTV1'],
  [/CCTV[-\s]*2|央视2|中央2/i, 'CCTV2'],
  [/CCTV[-\s]*3|央视3|中央3/i, 'CCTV3'],
  [/CCTV[-\s]*4|央视4|中央4/i, 'CCTV4'],
  [/CCTV[-\s]*5\+|央视5\+|中央5\+/i, 'CCTV5+'],
  [/CCTV[-\s]*5(?!\+)|央视5(?!\+)|中央5(?!\+)/i, 'CCTV5'],
  [/CCTV[-\s]*6|央视6|中央6/i, 'CCTV6'],
  [/CCTV[-\s]*7|央视7|中央7/i, 'CCTV7'],
  [/CCTV[-\s]*8|央视8|中央8/i, 'CCTV8'],
  [/CCTV[-\s]*9|央视9|中央9/i, 'CCTV9'],
  [/CCTV[-\s]*(\d{1,2})/i, (n) => `CCTV${n.match(/(\d{1,2})/)?.[1] || ''}`],
  [/凤凰卫视|凤凰中文/i, '凤凰中文'],
  [/凤凰资讯/i, '凤凰资讯'],
  [/TVB[\s-]*翡翠|翡翠台/i, 'TVB翡翠台'],
  [/TVB[\s-]*明珠|明珠台/i, 'TVB明珠台'],
  [/湖南卫视/i, '湖南卫视'],
  [/浙江卫视/i, '浙江卫视'],
  [/东方卫视/i, '东方卫视'],
  [/江苏卫视/i, '江苏卫视'],
  [/北京卫视/i, '北京卫视'],
];

/** 频道名称标准化 */
export function normalizeChannel(rawName) {
  if (!rawName) return 'UNKNOWN';
  let name = rawName.trim();

  for (const [pattern, replacement] of NORMALIZE_PATTERNS) {
    if (pattern.test(name)) {
      name = typeof replacement === 'function' ? replacement(name) : replacement;
      return name.toUpperCase();
    }
  }

  return name
    .replace(/\s*(HD|FHD|4K|UHD|标清|高清|超清)\s*/gi, '')
    .replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '')
    .toUpperCase() || 'UNKNOWN';
}

/** 按关键词分类 */
export function classifyChannel(name, group = '', meta = {}) {
  const text = `${name} ${group} ${meta.normalized_name || ''} ${meta.source || ''} ${meta.url || ''}`;
  for (const rule of config.CATEGORY_RULES || []) {
    if ((rule.patterns || []).every((p) => p.test(text))) return rule.name;
  }
  return '其他';
}

export function inferPlaylistGroup(channel) {
  const category = channel.category || classifyChannel(channel.name, channel.group, channel);
  const text = `${channel.name || ''} ${channel.group || ''} ${channel.normalized_name || ''}`;

  if (category === '咪咕体育') return channel.playlist_group || '咪咕体育-综合体育';
  if (category === '央视频道') return '央视频道';
  if (category === '卫视频道') return '卫视频道';
  if (category === '地方频道') return '地方频道';
  if (category === '港澳台') return '港澳台';

  if (category === '体育') {
    if (/足球|英超|西甲|欧冠|亚冠|中超/i.test(text)) return '体育-足球';
    if (/篮球|NBA|CBA/i.test(text)) return '体育-篮球';
    return '体育-综合';
  }
  if (category === '影视') return '影视';
  if (category === '新闻') return '新闻';
  if (category === '少儿动漫') return '少儿动漫';
  if (category === '纪实人文') return '纪实人文';
  if (category === '综艺娱乐') return '综艺娱乐';
  return category || '其他';
}

function categoryPriority(category) {
  const index = (config.CATEGORY_RULES || []).findIndex((rule) => rule.name === category);
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

function preferValue(current, next) {
  if (!next) return current;
  if (!current) return next;
  if (current.length >= next.length) return current;
  return next;
}

function mergeTags(...tagLists) {
  return [...new Set(tagLists.flat().filter(Boolean))];
}

function preferPlaylistGroup(channel, entry, incomingCategory) {
  const explicit = entry.playlist_group || entry.group || '';
  if (!explicit) return channel.playlist_group || inferPlaylistGroup(channel);

  if (!channel.playlist_group) return explicit;
  if (incomingCategory === '咪咕体育' && /咪咕体育-/.test(explicit)) return explicit;
  return channel.playlist_group || inferPlaylistGroup(channel);
}

function mergeSourceIntoChannel(channel, entry) {
  const incomingCategory = classifyChannel(entry.name, entry.group, {
    normalized_name: channel.normalized_name,
    source: entry.source,
    url: entry.url,
  });
  const currentPriority = categoryPriority(channel.category);
  const incomingPriority = categoryPriority(incomingCategory);

  channel.name = preferValue(channel.name, entry.name);
  channel.group = incomingPriority < currentPriority
    ? preferValue(entry.group, channel.group)
    : preferValue(channel.group, entry.group);
  channel.logo = preferValue(channel.logo, entry.logo);
  channel.tvgId = preferValue(channel.tvgId, entry.tvgId);
  if (!channel.category || incomingPriority < currentPriority) {
    channel.category = incomingCategory;
  }
  channel.playlist_group = preferPlaylistGroup(channel, entry, incomingCategory);

  const src = streamFromEntry(entry);
  const dup = channel.sources.some((s) => s.url === src.url);
  if (!dup && channel.sources.length < config.MAX_SOURCES_PER_CHANNEL) {
    channel.sources.push(src);
  }

  channel.tags = mergeTags(channel.tags, buildChannelTags(channel));
  channel.region = channel.tags.find((t) => t.startsWith('region:'))?.split(':')[1] || 'INTL';
  channel.quality = channel.tags.find((t) => t.startsWith('quality:'))?.split(':')[1] || 'SD';
}

/** 自动标签：region / quality / genre */
export function buildChannelTags(channel) {
  const tags = new Set();
  const text = `${channel.name} ${channel.group || ''}`;

  if (/港澳|TVB|凤凰|ATV|明珠|ViuTV/i.test(text)) tags.add('region:HKMO');
  else if (/台湾|台视|中视|民视/i.test(text)) tags.add('region:TW');
  else if (/CN|央视|卫视|CCTV/i.test(text)) tags.add('region:CN');
  else tags.add('region:INTL');

  if (/4K|UHD/i.test(text)) tags.add('quality:4K');
  else if (/FHD|1080|高清/i.test(text)) tags.add('quality:FHD');
  else if (/HD|720/i.test(text)) tags.add('quality:HD');
  else tags.add('quality:SD');

  const genre = channel.category || classifyChannel(channel.name, channel.group);
  tags.add(`genre:${genre}`);
  if (genre === '咪咕体育' || /咪咕|migu|miguvideo|cmvideo|咪视界/i.test(`${text} ${(channel.sources || []).map((s) => s.url).join(' ')}`)) {
    tags.add('provider:migu');
  }
  if (channel.playlist_group) {
    tags.add(`playlist:${channel.playlist_group}`);
  }

  return [...tags];
}

/** 字符 n-gram 向量（轻量 embedding，用于去重） */
export function toEmbedding(text, dims = config.AI.embeddingDimensions) {
  const vec = new Float32Array(dims);
  const s = normalizeChannel(text).toLowerCase();
  for (let i = 0; i < s.length - 1; i++) {
    const gram = s.slice(i, i + 2);
    let hash = 0;
    for (let j = 0; j < gram.length; j++) {
      hash = (hash * 31 + gram.charCodeAt(j)) >>> 0;
    }
    vec[hash % dims] += 1;
  }
  const norm = Math.sqrt([...vec].reduce((a, b) => a + b * b, 0)) || 1;
  return [...vec].map((v) => v / norm);
}

export function cosineSimilarity(a, b) {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}

/** O(n) 快速去重：按标准化名称合并多源（大列表专用，避免 1102） */
export function dedupeChannelsFast(entries) {
  const map = new Map();

  for (const entry of entries) {
    const normalized = normalizeChannel(entry.name);
    const key = normalized;
    let ch = map.get(key);

    if (!ch) {
      const category = classifyChannel(entry.name, entry.group, {
        normalized_name: normalized,
        source: entry.source,
        url: entry.url,
      });
      ch = {
        name: entry.name,
        normalized_name: normalized,
        group: entry.group,
        playlist_group: entry.playlist_group || entry.group,
        logo: entry.logo,
        tvgId: entry.tvgId,
        category,
        region: 'INTL',
        quality: 'SD',
        tags: [],
        sources: [],
      };
      map.set(key, ch);
    }
    mergeSourceIntoChannel(ch, entry);
  }

  return [...map.values()].map((ch) => {
    ch.playlist_group = inferPlaylistGroup(ch);
    ch.tags = buildChannelTags(ch);
    ch.region = ch.tags.find((t) => t.startsWith('region:'))?.split(':')[1] || 'INTL';
    ch.quality = ch.tags.find((t) => t.startsWith('quality:'))?.split(':')[1] || 'SD';
    return ch;
  });
}

/** 基于 embedding 相似度去重并合并多源（小列表使用） */
export function dedupeChannels(entries, threshold = config.DEDUPE_SIMILARITY_THRESHOLD) {
  const threshold_fast = config.PIPELINE?.fastDedupeThreshold ?? 500;
  if (entries.length > threshold_fast) {
    return dedupeChannelsFast(entries);
  }
  const groups = [];

  for (const entry of entries) {
    const normalized = normalizeChannel(entry.name);
    const emb = toEmbedding(normalized);
    let merged = false;

    for (const group of groups) {
      const sim = cosineSimilarity(emb, group.embedding);
      const nameMatch = normalized === group.normalized_name;
      if (nameMatch || sim >= threshold) {
        mergeSourceIntoChannel(group, entry);
        merged = true;
        break;
      }
    }

    if (!merged) {
      const category = classifyChannel(entry.name, entry.group, {
        normalized_name: normalized,
        source: entry.source,
        url: entry.url,
      });
      const tags = buildChannelTags({ name: entry.name, group: entry.group, category });
      groups.push({
        name: entry.name,
        normalized_name: normalized,
        group: entry.group,
        playlist_group: entry.playlist_group || entry.group,
        logo: entry.logo,
        tvgId: entry.tvgId,
        category,
        region: tags.find((t) => t.startsWith('region:'))?.split(':')[1] || 'INTL',
        quality: tags.find((t) => t.startsWith('quality:'))?.split(':')[1] || 'SD',
        tags,
        embedding: emb,
        sources: [streamFromEntry(entry)],
      });
    }
  }

  return groups.map(({ embedding, ...ch }) => ({
    ...ch,
    playlist_group: inferPlaylistGroup(ch),
    tags: buildChannelTags(ch),
  }));
}

function streamFromEntry(entry) {
  return {
    url: entry.url,
    source: entry.source,
    status: 'unknown',
    latency: null,
    success_rate: 1,
    failures: 0,
    last_check: null,
  };
}

/** 可疑源检测：广告台 / 违规命名启发式 */
export function detectSuspiciousChannel(channel) {
  const text = `${channel.name} ${channel.group || ''} ${(channel.sources || []).map((s) => s.url).join(' ')}`;
  for (const pattern of config.AD_PATTERNS) {
    if (pattern.test(text)) {
      return { suspicious: true, reason: 'ad_or_maintenance_pattern' };
    }
  }
  if ((channel.name || '').length > 80) {
    return { suspicious: true, reason: 'abnormal_name_length' };
  }
  return { suspicious: false };
}

/** 定期刷新 embedding 索引（存入 KV 供后续 LLM 模式扩展） */
export function buildEmbeddingIndex(channels) {
  return channels.map((ch) => ({
    normalized_name: ch.normalized_name,
    embedding: toEmbedding(ch.normalized_name),
    category: ch.category,
    updated_at: Date.now(),
  }));
}

export async function processChannelsWithAI(entries, options = {}) {
  const useFast = options.fast ?? entries.length > (config.PIPELINE?.fastDedupeThreshold ?? 500);
  const deduped = useFast ? dedupeChannelsFast(entries) : dedupeChannels(entries);
  return deduped
    .map((ch) => {
      const check = detectSuspiciousChannel(ch);
      if (check.suspicious) {
        ch.sources = ch.sources.map((s) => ({ ...s, status: 'dead', ai_flag: check.reason }));
      }
      ch.tags = buildChannelTags(ch);
      return ch;
    })
    .filter((ch) => ch.sources.some((s) => s.status !== 'dead'));
}
