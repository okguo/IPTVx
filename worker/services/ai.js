import config from '../../config/config.js';
import { isBroadcastEntry, isNonChineseEntry } from '../utils/parser.js';

const NORMALIZE_PATTERNS = [
  // CCTV10~CCTV17 必须放在 CCTV1~CCTV9 之前，避免 CCTV-10 被 CCTV-1 匹配
  [/CCTV[-\s]*17\s*(农业|农村)|央视17\s*(农业|农村)|中央17\s*(农业|农村)/i, 'CCTV17'],
  [/CCTV[-\s]*17|央视17|中央17/i, 'CCTV17'],
  [/CCTV[-\s]*16\s*奥运|央视16\s*奥运|中央16\s*奥运/i, 'CCTV16'],
  [/CCTV[-\s]*16|央视16|中央16/i, 'CCTV16'],
  [/CCTV[-\s]*15\s*(音乐)|央视15\s*(音乐)|中央15\s*(音乐)/i, 'CCTV15'],
  [/CCTV[-\s]*15|央视15|中央15/i, 'CCTV15'],
  [/CCTV[-\s]*14\s*(少儿)|央视14\s*(少儿)|中央14\s*(少儿)/i, 'CCTV14'],
  [/CCTV[-\s]*14|央视14|中央14/i, 'CCTV14'],
  [/CCTV[-\s]*13\s*(新闻)|央视13\s*(新闻)|中央13\s*(新闻)/i, 'CCTV13'],
  [/CCTV[-\s]*13|央视13|中央13/i, 'CCTV13'],
  [/CCTV[-\s]*12\s*(社会|法治)|央视12\s*(社会|法治)|中央12\s*(社会|法治)/i, 'CCTV12'],
  [/CCTV[-\s]*12|央视12|中央12/i, 'CCTV12'],
  [/CCTV[-\s]*11\s*(戏曲)|央视11\s*(戏曲)|中央11\s*(戏曲)/i, 'CCTV11'],
  [/CCTV[-\s]*11|央视11|中央11/i, 'CCTV11'],
  [/CCTV[-\s]*10\s*(科教)|央视10\s*(科教)|中央10\s*(科教)/i, 'CCTV10'],
  [/CCTV[-\s]*10|央视10|中央10/i, 'CCTV10'],
  // CCTV1~CCTV9
  [/CCTV[-\s]*1\s*综合|央视1\s*综合|中央1\s*综合/i, 'CCTV1'],
  [/CCTV[-\s]*1|央视1|中央1/i, 'CCTV1'],
  [/CCTV[-\s]*2\s*财经|央视2\s*财经|中央2\s*财经/i, 'CCTV2'],
  [/CCTV[-\s]*2|央视2|中央2/i, 'CCTV2'],
  [/CCTV[-\s]*3\s*综艺|央视3\s*综艺|中央3\s*综艺/i, 'CCTV3'],
  [/CCTV[-\s]*3|央视3|中央3/i, 'CCTV3'],
  [/CCTV[-\s]*4\s*(中文|国际)|央视4\s*(中文|国际)|中央4\s*(中文|国际)/i, 'CCTV4'],
  [/CCTV[-\s]*4|央视4|中央4/i, 'CCTV4'],
  [/CCTV[-\s]*5\s*\+|央视5\s*\+|中央5\s*\+/i, 'CCTV5+'],
  [/CCTV[-\s]*5\s*(体育|PLUS)|央视5|中央5/i, 'CCTV5'],
  [/CCTV[-\s]*6\s*电影|央视6\s*电影|中央6\s*电影/i, 'CCTV6'],
  [/CCTV[-\s]*6|央视6|中央6/i, 'CCTV6'],
  [/CCTV[-\s]*7\s*(国防|军事)|央视7\s*(国防|军事)|中央7\s*(国防|军事)/i, 'CCTV7'],
  [/CCTV[-\s]*7|央视7|中央7/i, 'CCTV7'],
  // ⚠️ CCTV-8K 必须放在 CCTV8 之前，避免 8K 被误判为 CCTV8 电视剧
  [/CCTV[-\s]*8K|CCTV[-\s]*8\s*K|央视8K|中央8K|8K超高清/i, 'CCTV8K'],
  [/CCTV[-\s]*8\s*(电视|剧)|央视8\s*(电视|剧)|中央8\s*(电视|剧)/i, 'CCTV8'],
  [/CCTV[-\s]*8|央视8|中央8/i, 'CCTV8'],
  [/CCTV[-\s]*9\s*纪录|央视9\s*纪录|中央9\s*纪录/i, 'CCTV9'],
  [/CCTV[-\s]*9|央视9|中央9/i, 'CCTV9'],
  [/CGTN\s*(西班牙语)|CGTN\s*Spanish/i, 'CGTN西班牙语'],
  [/CGTN\s*(法语)|CGTN\s*French/i, 'CGTN法语'],
  [/CGTN\s*(阿拉伯语)|CGTN\s*Arabic/i, 'CGTN阿拉伯语'],
  [/CGTN\s*(俄语)|CGTN\s*Russian/i, 'CGTN俄语'],
  [/CGTN\s*(纪录)|CGTN\s*Documentary/i, 'CGTN纪录'],
  [/CGTN/i, 'CGTN'],
  [/CCTV[-\s]*(\d{1,2})/i, (n) => `CCTV${n.match(/(\d{1,2})/)?.[1] || ''}`],
  [/凤凰卫视|凤凰中文/i, '凤凰中文'],
  [/凤凰资讯/i, '凤凰资讯'],
  [/TVB[\s-]*翡翠|翡翠台/i, 'TVB翡翠台'],
  [/TVB[\s-]*明珠|明珠台/i, 'TVB明珠台'],
  // 卫视频道标准化
  [/湖南卫视/i, '湖南卫视'],
  [/浙江卫视/i, '浙江卫视'],
  [/东方卫视/i, '东方卫视'],
  [/江苏卫视/i, '江苏卫视'],
  [/北京卫视/i, '北京卫视'],
  [/天津卫视/i, '天津卫视'],
  [/深圳卫视/i, '深圳卫视'],
  [/广东卫视/i, '广东卫视'],
  [/山东卫视/i, '山东卫视'],
  [/湖北卫视/i, '湖北卫视'],
  [/安徽卫视/i, '安徽卫视'],
  [/重庆卫视/i, '重庆卫视'],
  [/东南卫视/i, '东南卫视'],
  [/海峡卫视/i, '海峡卫视'],
  [/广西卫视/i, '广西卫视'],
  [/贵州卫视/i, '贵州卫视'],
  [/云南卫视/i, '云南卫视'],
  [/黑龙江卫视/i, '黑龙江卫视'],
  [/吉林卫视/i, '吉林卫视'],
  [/辽宁卫视/i, '辽宁卫视'],
  [/河北卫视/i, '河北卫视'],
  [/河南卫视/i, '河南卫视'],
  [/江西卫视/i, '江西卫视'],
  [/陕西卫视/i, '陕西卫视'],
  [/四川卫视/i, '四川卫视'],
  [/海南卫视/i, '海南卫视'],
  [/三沙卫视/i, '三沙卫视'],
  [/厦门卫视/i, '厦门卫视'],
  [/内蒙古卫视/i, '内蒙古卫视'],
  [/宁夏卫视/i, '宁夏卫视'],
  [/新疆卫视/i, '新疆卫视'],
  [/西藏卫视/i, '西藏卫视'],
  [/青海卫视/i, '青海卫视'],
  [/甘肃卫视/i, '甘肃卫视'],
  [/山西卫视/i, '山西卫视'],
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
  const identityText = `${name} ${meta.normalized_name || ''} ${meta.tvgId || ''}`.trim();
  const fullText = `${identityText} ${group} ${meta.source || ''} ${meta.url || ''}`.trim();

  // 4K/8K 超高清频道优先归类（三维分类矩阵：画质维度）
  if (/8K|8k|超高清8K/i.test(fullText)) return '4K超高清';
  if (/4K|4k|UHD|超高清4K/i.test(fullText) && !/CCTV/i.test(identityText)) {
    // CCTV 的 4K 频道仍归入央视频道，但标记画质
    return '4K超高清';
  }

  if (/咪咕|migu|miguvideo|cmvideo|咪视界/i.test(fullText) && /体育|足球|篮球|NBA|CBA|英超|西甲|欧冠|亚冠|中超|网球|斯诺克|F1|赛车|高尔夫|搏击|UFC/i.test(fullText)) {
    return '咪咕体育';
  }
  if (/CCTV|央视|CGTN/i.test(identityText)) return '央视频道';
  if (/\bTVB\b|\bATV\b|明珠|凤凰|凤凰卫视|无线|ViuTV|HOY|澳门|台湾|中视|华视|民视|台视|三立|东森|纬来|中天|耀才|RHK|VIU/i.test(fullText)) {
    return '港澳台';
  }
  if (/卫视/i.test(identityText)) return '卫视频道';
  if (isRegionalChannelText(identityText, group)) return '地方频道';

  for (const rule of config.CATEGORY_RULES || []) {
    if ((rule.patterns || []).every((p) => p.test(fullText))) return rule.name;
  }
  return '其他';
}

/** 检测频道画质等级 */
export function detectChannelQuality(name = '', group = '', sources = []) {
  const text = `${name} ${group} ${(sources || []).map(s => s.url).join(' ')}`;

  // 按优先级检测（8K > 4K > FHD > HD）
  const qualityPatterns = config.QUALITY_PATTERNS || {};

  if (qualityPatterns['8K']?.some(p => p.test(text))) return '8K';
  if (qualityPatterns['4K']?.some(p => p.test(text))) return '4K';
  if (qualityPatterns['FHD']?.some(p => p.test(text))) return 'FHD';
  if (qualityPatterns['HD']?.some(p => p.test(text))) return 'HD';

  return 'SD';
}

/** 获取体育频道的子分类（足球/篮球/综合等） */
export function getSportsSubCategory(name = '', group = '', sources = []) {
  const text = `${name} ${group} ${(sources || []).map(s => s.url).join(' ')}`;
  const subCategories = config.SPORTS_SUB_CATEGORY || [];

  for (const sub of subCategories) {
    if ((sub.patterns || []).some(p => p.test(text))) {
      return sub.name;
    }
  }

  return '综合体育';
}

function isRegionalChannelText(identityText, group = '') {
  const text = `${identityText} ${group}`;
  return /(北京|上海|天津|重庆|河北|山西|内蒙古|辽宁|吉林|黑龙江|江苏|浙江|安徽|福建|江西|山东|河南|湖北|湖南|广东|广西|海南|四川|贵州|云南|西藏|陕西|甘肃|青海|宁夏|新疆|深圳|广州|珠海|佛山|东莞|汕头|南宁|海口|南京|苏州|无锡|常州|南通|杭州|宁波|温州|嘉兴|绍兴|金华|合肥|芜湖|福州|厦门|泉州|南昌|赣州|济南|青岛|烟台|郑州|洛阳|武汉|宜昌|长沙|株洲|成都|绵阳|贵阳|昆明|拉萨|西安|宝鸡|兰州|西宁|银川|乌鲁木齐|哈尔滨|长春|沈阳|大连)/i.test(text)
    && /(台|频道|新闻|综合|公共|都市|生活|影视|文体|科教|少儿|教育|法治|民生|农村|城市|导视|家庭|移动电视|体育|休闲)/i.test(text);
}

function inferLocalRegion(text) {
  const REGION_RULES = [
    ['华北', /北京|天津|河北|山西|内蒙古/i],
    ['东北', /辽宁|吉林|黑龙江|大连|沈阳|哈尔滨|长春/i],
    ['华东', /上海|江苏|浙江|安徽|福建|江西|山东|南京|苏州|杭州|宁波|厦门|青岛/i],
    ['华中', /河南|湖北|湖南|武汉|长沙|郑州/i],
    ['华南', /广东|广西|海南|深圳|广州|珠海|汕头|佛山|东莞|南宁|海口/i],
    ['西南', /重庆|四川|贵州|云南|西藏|成都|昆明|贵阳/i],
    ['西北', /陕西|甘肃|青海|宁夏|新疆|西安|兰州|银川|乌鲁木齐/i],
  ];

  for (const [region, pattern] of REGION_RULES) {
    if (pattern.test(text)) return region;
  }
  return '综合';
}

export function inferPlaylistGroup(channel) {
  const category = channel.category || classifyChannel(channel.name, channel.group, channel);
  const text = `${channel.name || ''} ${channel.group || ''} ${channel.normalized_name || ''}`;
  const quality = channel.quality || detectChannelQuality(channel.name, channel.group, channel.sources);

  if (category === '4K超高清') return `4K超清-${quality}`;
  if (category === '咪咕体育') return channel.playlist_group || '咪咕体育-综合体育';
  if (category === '央视频道') return '央视频道';
  if (category === '卫视频道') return '卫视频道';
  if (category === '地方频道') return `地方频道-${inferLocalRegion(text)}`;
  if (category === '港澳台') return '港澳台';

  if (category === '体育') {
    // 使用体育子分类
    const subCategory = getSportsSubCategory(channel.name, channel.group, channel.sources);
    return `体育-${subCategory}`;
  }
  if (category === '影视') return '影视';
  if (category === '新闻') return '新闻';
  if (category === '少儿动漫') return '少儿动漫';
  if (category === '纪实人文') return '纪实人文';
  if (category === '综艺娱乐') return '综艺娱乐';
  return category || '其他';
}

export function isLowValueChannel(channel) {
  const text = `${channel.name || ''} ${channel.group || ''} ${channel.normalized_name || ''}`;
  const lowValue = config.CHANNEL_FILTER?.lowValueNames || [];
  const allowSpecials = config.CHANNEL_FILTER?.allowValuableSpecials || [];

  if (!lowValue.some((pattern) => pattern.test(text))) return false;
  return !allowSpecials.some((pattern) => pattern.test(text));
}

function isRegionalTvChannel(channel) {
  const text = `${channel.name || ''} ${channel.group || ''} ${channel.normalized_name || ''}`;
  return /(北京|上海|天津|重庆|河北|山西|内蒙古|辽宁|吉林|黑龙江|江苏|浙江|安徽|福建|江西|山东|河南|湖北|湖南|广东|广西|海南|四川|贵州|云南|西藏|陕西|甘肃|青海|宁夏|新疆|深圳|广州|珠海|佛山|东莞|汕头|南宁|海口|南京|苏州|无锡|常州|南通|杭州|宁波|温州|嘉兴|绍兴|金华|合肥|芜湖|福州|厦门|泉州|南昌|赣州|济南|青岛|烟台|郑州|洛阳|武汉|宜昌|长沙|株洲|成都|绵阳|贵阳|昆明|拉萨|西安|宝鸡|兰州|西宁|银川|乌鲁木齐|哈尔滨|长春|沈阳|大连)/i.test(text)
    && /(台|频道|新闻|综合|公共|都市|生活|影视|文体|科教|少儿|教育|法治|民生|农村|城市|导视|家庭|移动电视|体育|休闲)/i.test(text);
}

function isNamedEventStream(channel) {
  const text = `${channel.name || ''} ${channel.group || ''} ${channel.normalized_name || ''}`;
  if (/(CCTV|卫视|频道|电视台|新闻|综合|公共|影视|剧场|咪咕|凤凰|TVB|CHC)/i.test(text)) {
    return false;
  }
  return /(NBA\s*\d+|英超直播|西甲直播|欧冠直播|UFC|老鹰|凯尔特人|篮网|黄蜂|公牛|骑士|独行侠|掘金|活塞|勇士|火箭|步行者|快船|湖人|灰熊|热火|雄鹿|森林狼|鹈鹕|尼克斯|雷霆|魔术|76人|太阳|开拓者|国王|马刺|猛龙|爵士|奇才)/i.test(text);
}

/**
 * 多因子加权排序（三维分类矩阵排序策略）
 * 最终分数 = 基础分类分 + 画质加成 + 健康评分 + 源冗余度 + 用户收藏 + 顺序加成 - 时效惩罚
 */
export function channelPriorityScore(channel, userPrefs = null) {
  const matrix = config.CATEGORY_MATRIX || {};
  const primaryWeights = matrix.primaryWeights || {};
  const qualityBonus = matrix.qualityBonus || {};

  const category = channel.category || classifyChannel(channel.name, channel.group, channel);
  const quality = channel.quality || detectChannelQuality(channel.name, channel.group, channel.sources);
  let score = 0;

  // 1. 基础分类分（0-1200）
  score += primaryWeights[category] || primaryWeights['其他'] || 100;

  // 2. 画质加成（0-200）
  score += qualityBonus[quality] || 0;

  // 3. 健康评分加成（0-100）
  const healthScore = channel.health_score ?? 0;
  score += Math.round(healthScore * (matrix.healthScoreWeight || 1.0));

  // 4. 源冗余度（0-50）：源越多越稳定
  const sourceCount = channel.sources?.length || 0;
  score += Math.min(sourceCount * 10, matrix.maxSourceBonus || 50);

  // 5. 用户收藏加成（0-300）
  if (userPrefs?.favorite_channels?.includes(channel.normalized_name)) {
    score += matrix.favoriteBonus || 300;
  }

  // 6. CCTV 顺序加成：确保 CCTV1-17 严格按频道号顺序排列（编号越小分数越高）
  //    使用足够大的间隔（每档 20 分），确保画质加成不会打乱顺序
  const cctvMatch = (channel.normalized_name || channel.name || '').match(/^CCTV(\d{1,2})\+?$/i);
  if (cctvMatch) {
    const channelNum = parseInt(cctvMatch[1], 10);
    if (channelNum >= 1 && channelNum <= 17) {
      // CCTV1 = 340 分, CCTV2 = 320 分, ..., CCTV17 = 20 分
      // 间隔 20 分/档 >> 最大画质差距 (HD=50 vs SD=0 = 50 分差距)
      // 确保 CCTV(N) 永远排在 CCTV(N+1) 之前，不受画质影响
      score += (18 - channelNum) * 20;
    }
  }

  // 7. 核心频道额外加成（非 CCTV 顺序的频道）
  if (/CGTN/i.test(channel.normalized_name || '')) score += 5;
  if (/卫视/i.test(channel.name || '')) score += 30;
  if (/新闻综合|都市|公共|经济科教|影视/i.test(channel.name || '')) score += 20;

  // 8. 地区加成
  if (channel.region === 'CN') score += 15;
  if (isRegionalTvChannel(channel)) score += 40;

  // 9. 体育子分类加成（足球/篮球等热门赛事）
  if (category === '体育' || category === '咪咕体育') {
    const subCategory = channel.sports_sub_category || getSportsSubCategory(channel.name, channel.group, channel.sources);
    if (subCategory === '足球') score += 25;
    if (subCategory === '篮球') score += 20;
  }

  // 10. 低价值/时效惩罚
  if (isLowValueChannel(channel)) score -= 200;
  if (isNamedEventStream(channel)) score -= 100;

  // 11. 测速失败惩罚
  const hasDeadSources = channel.sources?.every(s => s.status === 'dead');
  if (hasDeadSources) score -= 150;

  return score;
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

  // 使用新的画质检测函数（支持 8K/4K/UHD/FHD/HD/SD）
  const quality = channel.quality || detectChannelQuality(channel.name, channel.group, channel.sources);
  tags.add(`quality:${quality}`);

  const genre = channel.category || classifyChannel(channel.name, channel.group);
  tags.add(`genre:${genre}`);

  // 体育子分类标签
  if (genre === '体育' || genre === '咪咕体育') {
    const subCategory = channel.sports_sub_category || getSportsSubCategory(channel.name, channel.group, channel.sources);
    tags.add(`sports:${subCategory}`);
  }

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
      const quality = detectChannelQuality(entry.name, entry.group, [{ url: entry.url }]);
      const sportsSubCategory = category === '体育' ? getSportsSubCategory(entry.name, entry.group, [{ url: entry.url }]) : '';

      ch = {
        name: entry.name,
        normalized_name: normalized,
        group: entry.group,
        playlist_group: entry.playlist_group || entry.group,
        logo: entry.logo,
        tvgId: entry.tvgId,
        category,
        region: 'INTL',
        quality,
        sports_sub_category: sportsSubCategory,
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
    // 使用新函数检测画质
    ch.quality = detectChannelQuality(ch.name, ch.group, ch.sources);
    // 更新体育子分类
    if (ch.category === '体育' || ch.category === '咪咕体育') {
      ch.sports_sub_category = getSportsSubCategory(ch.name, ch.group, ch.sources);
    }
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
      const quality = detectChannelQuality(entry.name, entry.group, [{ url: entry.url }]);
      const sportsSubCategory = category === '体育' ? getSportsSubCategory(entry.name, entry.group, [{ url: entry.url }]) : '';

      groups.push({
        name: entry.name,
        normalized_name: normalized,
        group: entry.group,
        playlist_group: entry.playlist_group || entry.group,
        logo: entry.logo,
        tvgId: entry.tvgId,
        category,
        region: tags.find((t) => t.startsWith('region:'))?.split(':')[1] || 'INTL',
        quality,
        sports_sub_category: sportsSubCategory,
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
    // 最终画质和体育子分类确认
    quality: detectChannelQuality(ch.name, ch.group, ch.sources),
    sports_sub_category: (ch.category === '体育' || ch.category === '咪咕体育')
      ? getSportsSubCategory(ch.name, ch.group, ch.sources)
      : ch.sports_sub_category,
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
  const filteredEntries = entries.filter((entry) => !isBroadcastEntry(entry) && !isNonChineseEntry(entry));
  const useFast = options.fast ?? filteredEntries.length > (config.PIPELINE?.fastDedupeThreshold ?? 500);
  const deduped = useFast ? dedupeChannelsFast(filteredEntries) : dedupeChannels(filteredEntries);
  return deduped
    .map((ch) => {
      ch.category = classifyChannel(ch.name, ch.group, {
        normalized_name: ch.normalized_name,
        source: (ch.sources || []).map((s) => s.source).join(' '),
        url: (ch.sources || []).map((s) => s.url).join(' '),
      });
      ch.playlist_group = inferPlaylistGroup(ch);
      const check = detectSuspiciousChannel(ch);
      if (check.suspicious) {
        ch.sources = ch.sources.map((s) => ({ ...s, status: 'dead', ai_flag: check.reason }));
      }
      ch.tags = buildChannelTags(ch);
      return ch;
    })
    .filter((ch) => !isLowValueChannel(ch))
    .filter((ch) => ch.sources.some((s) => s.status !== 'dead'));
}
