import config from '../../config/config.js';

const NORMALIZE_PATTERNS = [
  [/CCTV[-\s]*1|央视1|中央1/i, 'CCTV1'],
  [/CCTV[-\s]*2|央视2|中央2/i, 'CCTV2'],
  [/CCTV[-\s]*3|央视3|中央3/i, 'CCTV3'],
  [/CCTV[-\s]*4|央视4|中央4/i, 'CCTV4'],
  [/CCTV[-\s]*5\+?|央视5|中央5|体育/i, 'CCTV5'],
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
export function classifyChannel(name, group = '') {
  const text = `${name} ${group}`;
  for (const [category, patterns] of Object.entries(config.CATEGORY_KEYWORDS)) {
    if (patterns.some((p) => p.test(text))) return category;
  }
  return '其他';
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

/** 基于 embedding 相似度去重并合并多源 */
export function dedupeChannels(entries, threshold = config.DEDUPE_SIMILARITY_THRESHOLD) {
  const groups = [];

  for (const entry of entries) {
    const normalized = normalizeChannel(entry.name);
    const emb = toEmbedding(normalized);
    let merged = false;

    for (const group of groups) {
      const sim = cosineSimilarity(emb, group.embedding);
      const nameMatch = normalized === group.normalized_name;
      if (nameMatch || sim >= threshold) {
        group.sources.push(streamFromEntry(entry));
        merged = true;
        break;
      }
    }

    if (!merged) {
      const category = classifyChannel(entry.name, entry.group);
      const tags = buildChannelTags({ name: entry.name, group: entry.group, category });
      groups.push({
        name: entry.name,
        normalized_name: normalized,
        group: entry.group,
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

  return groups.map(({ embedding, ...ch }) => ch);
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

export async function processChannelsWithAI(entries) {
  const deduped = dedupeChannels(entries);
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
