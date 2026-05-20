export default {
  DATA_SCHEMA_VERSION: 4,
  SOURCE_LIST: [
    // 高质量源列表（按优先级排序）
    'https://raw.githubusercontent.com/Jsnzkpg/Jsnzkpg/Jsnzkpg/Jsnzkpg1.m3u',  // 裤佬源：最全面
    'https://raw.githubusercontent.com/Kimentanm/aptv/master/m3u/iptv.m3u',      // Kimentanm 源
    'https://iptv.yang-1989.eu.org/m3u/Gather.m3u',                              // YanG 源
    'https://raw.githubusercontent.com/mzky/checklist/refs/heads/master/itvlist.m3u',
    'https://raw.githubusercontent.com/suxuang/myIPTV/main/ipv4.m3u',
  ],
  /** 咖啡直播源配置（动态爬取） */
  KAFEI_SOURCE: {
    enabled: true,
    apiUrl: 'https://www.kafeizhibo.com/api/v1/archor',
    crawlIntervalMs: 30 * 60 * 1000, // 30 分钟
  },
  /** 咪咕体育源配置 */
  MIGU_SOURCE: {
    enabled: true,
    // 咪咕 API 需要认证，使用公开的咪咕直播源列表作为替代
    staticList: [
      // 咪咕体育直播源（需要用户提供有效的直播源 URL）
      // 格式：{ name: '赛事 主队 vs 客队', url: 'https://...', category: '咪咕体育-足球' }
    ],
  },
  /**
   * 仅放置你有权限使用的咪咕体育直播源。
   * 代码会自动将其归入“咪咕体育”分类，并参与测速/去重/路由。
   * 支持两种写法：
   * 1. 字符串 URL：指向一个包含咪咕体育频道的 m3u 地址
   * 2. 对象：直接声明单条频道，适合手工维护足球/篮球/综合体育分组
   *    { name: '咪咕英超', subcategory: '足球', url: 'https://...' }
   */
  MIGU_SOURCE_LIST: [],
  EPG_SOURCES: [
    'https://iptv-org.github.io/epg/guides/cn.xml',
    'https://iptv-org.github.io/epg/guides/hk.xml',
  ],
  FETCH_TIMEOUT_MS: 8000,
  FETCH_RETRIES: 2,
  VALIDATE_TIMEOUT_MS: 8000,
  VALIDATE_CONCURRENCY: 8,
  MAX_FAILURES: 3,
  UNSTABLE_LATENCY_MS: 2000,
  MAX_SOURCES_PER_CHANNEL: 3, // 每频道最多 3 个源（精简）
  KV_TTL: {
    playlist: 86400,
    channels: 86400,
    health: 3600,
    epg: 43200,
    embeddings: 604800,
  },
  CRON_BATCH_SIZE: 20,
  /** 频道白名单：只保留这些核心频道（追求质量而非数量） */
  CHANNEL_WHITELIST: {
    enabled: true, // 设为 true 启用白名单模式
    /** 央视频道白名单（标准化名称） */
    cctv: [
      'CCTV1', 'CCTV2', 'CCTV3', 'CCTV4', 'CCTV5', 'CCTV5+',
      'CCTV6', 'CCTV7', 'CCTV8', 'CCTV9', 'CCTV10', 'CCTV11',
      'CCTV12', 'CCTV13', 'CCTV14', 'CCTV15', 'CCTV16', 'CCTV17',
      'CGTN', 'CGTN法语', 'CGTN俄语', 'CGTN西班牙语', 'CGTN阿拉伯语', 'CGTN纪录',
    ],
    /** 卫视频道白名单（包含关键词即可匹配） */
    satellite: [
      '湖南卫视', '浙江卫视', '东方卫视', '江苏卫视', '北京卫视',
      '广东卫视', '深圳卫视', '山东卫视', '天津卫视', '湖北卫视',
      '安徽卫视', '重庆卫视', '东南卫视', '广西卫视', '贵州卫视',
      '云南卫视', '黑龙江卫视', '吉林卫视', '辽宁卫视', '河北卫视',
      '河南卫视', '江西卫视', '陕西卫视', '四川卫视', '海南卫视',
      '内蒙古卫视', '宁夏卫视', '新疆卫视', '西藏卫视', '青海卫视',
      '甘肃卫视', '山西卫视',
    ],
    /** 港澳台频道白名单（包含关键词即可匹配） */
    hkmo: ['凤凰中文', '凤凰资讯', 'TVB翡翠台', 'TVB明珠台', '翡翠台', '明珠台', 'HOY', 'ViuTV'],
    /** 体育频道白名单（分类名 + 关键词） */
    sports_patterns: [
      /CCTV5[+]?体育|CCTV-5[+]?体育|CCTV5[+]?体育赛事/i,
      /广东体育|北京体育|上海体育|辽宁体育|山东体育|湖北体育|天津体育/i,
      /江苏体育|浙江体育|福建体育|安徽体育|江西体育|河南体育|河北体育/i,
      /四川体育|重庆体育|陕西体育|甘肃体育|贵州体育|云南体育|广西体育/i,
      /海南体育|黑龙江体育|吉林体育|内蒙古体育|新疆体育|宁夏体育/i,
      /青海体育|西藏体育|五星体育|劲爆体育|体育赛事|体育频道/i,
      /风云足球|足球|篮球|NBA|CBA|英超|西甲|意甲|德甲|法甲|欧冠|中超/i,
      /网球|斯诺克|F1|赛车|高尔夫|搏击|UFC|乒乓球|羽毛球|台球/i,
    ],
    /** 影视频道白名单（分类名 + 关键词） */
    movies_patterns: [
      /CCTV6[电影]?|CCTV-6[电影]?/i,
      /CCTV8[电视剧]?|CCTV-8[电视剧]?/i,
      /CHC家庭影院|CHC动作电影|CHC高清电影|CHC影迷电影/i,
      /第一剧场|风云剧场|怀旧剧场|黑莓电影|女性时尚/i,
      /动作电影|家庭影院|影迷电影|高清电影|电影频道/i,
      /影视频道|南方影视|东方影视|重庆影视|陕西影视|湖南影视/i,
    ],
    /** 少儿动漫频道白名单（分类名 + 关键词） */
    kids_patterns: [
      /CCTV14[少儿]?|CCTV-14[少儿]?/i,
      /少儿频道|少儿|卡通|动画|动漫|金鹰卡通|优漫卡通/i,
      /卡酷少儿|哈哈炫动|嘉佳卡通|广东少儿|北京少儿|上海少儿/i,
      /动漫秀场|新动漫|动漫世界|宝贝家|早期教育|幼儿教育/i,
      /Disney|迪士尼|Nick|Nickelodeon|Cartoon Network|CN卡通/i,
    ],
  },
  /** 流水线资源上限（防止 6+ 大源合并后触发 Worker 1102 CPU 超限） */
  PIPELINE: {
    maxRawEntries: 4000,
    maxChannels: 800,
    validateMaxChannels: 0,
    validateTimeoutMs: 2000,
    fastDedupeThreshold: 500,
    skipEpgOverChannels: 500,
    skipD1SyncOverChannels: 800,
    skipValidation: true, // 跳过测速：Cloudflare Workers 出口 IP 常被 IPTV 源屏蔽，测速结果不可靠
    /** 快速模式下的轻量测速（控制并发，避免 1102） */
    liteValidate: false, // 关闭轻量测速，原因同上
    liteValidateMaxChannels: 600,
    liteValidateTimeoutMs: 8000,
    liteValidateBatchSize: 20,
    liteValidateEarlyExit: true,
    liteValidateProbePerChannel: 3,
    /** 仅将测速通过的频道写入 M3U（设为 false 可保留所有频道，即使测速失败） */
    playlistOnlyPlayable: true,
    autoBootstrapOnRequest: true,
    /** 央视频道/卫视频道保留策略：即使测速失败也保留 */
    preserveCategories: ['央视频道', '卫视频道', '港澳台'],
  },
  DEDUPE_SIMILARITY_THRESHOLD: 0.82,
  AI: {
    mode: 'rule', // rule | embedding | llm
    llmEndpoint: '',
    embeddingDimensions: 32,
  },
  REGION_COLO_MAP: {
    SIN: 'SEA',
    HKG: 'HK',
    TPE: 'TW',
    NRT: 'JP',
    ICN: 'KR',
  },
  AD_PATTERNS: [
    /广告/i,
    /shopping/i,
    /infomercial/i,
    /test\s*pattern/i,
    /请更换源/i,
    /维护中/i,
  ],
  CHANNEL_FILTER: {
    /** 只保留中文地区高价值频道 */
    chineseRegionOnly: true,
    allowLatinBrands: [
      'CCTV',
      'CGTN',
      'TVB',
      'HOY',
      'ViuTV',
      '凤凰',
      '咪咕',
      'CHC',
    ],
    blockedGroups: [
      /台湾「限制」/i,
      /international/i,
      /overseas/i,
      /english/i,
      /foreign/i,
      /usa/i,
      /uk/i,
      /france/i,
      /germany/i,
      /italy/i,
      /spain/i,
      /japan/i,
      /korea/i,
      /india/i,
      /arab/i,
      /music tv/i,
    ],
    blockedCountryHints: [
      /美国|英国|法国|德国|意大利|西班牙|葡萄牙|荷兰|比利时|瑞士|奥地利|瑞典|挪威|丹麦|芬兰/i,
      /俄罗斯|乌克兰|波兰|希腊|土耳其|罗马尼亚|匈牙利|捷克/i,
      /日本|韩国|朝鲜|印度|巴基斯坦|孟加拉|越南|泰国|老挝|柬埔寨|缅甸|马来西亚|新加坡|印尼|菲律宾/i,
      /伊朗|伊拉克|阿富汗|阿联酋|沙特|卡塔尔|以色列|埃及|南非|尼日利亚|索马里/i,
      /加拿大|巴西|阿根廷|智利|秘鲁|墨西哥/i,
    ],
    blockedNames: [
      /\bBBC\b/i,
      /\bCNN\b/i,
      /\bCNBC\b/i,
      /\bBLOOMBERG\b/i,
      /\bFOX\b/i,
      /\bSKY\b/i,
      /\bHBO\b/i,
      /\bDISCOVERY\b/i,
      /\bANIMAL PLANET\b/i,
      /\bNATIONAL GEOGRAPHIC\b/i,
      /\bMTV\b/i,
      /\bESPN\b/i,
      /\bSTAR SPORTS\b/i,
      /\bEUROSPORT\b/i,
      /\bNHK\b/i,
      /\bKBS\b/i,
      /\bSBS\b/i,
      /\bTV5\b/i,
      /\bTVE\b/i,
      /\bRAI\b/i,
      /\bTF1\b/i,
      /\bZDF\b/i,
      /\bARD\b/i,
      /\bAXN\b/i,
      /\bTHAIPBS\b/i,
      /\bNDTV\b/i,
      /\bMBC\b/i,
      /\bARIRANG\b/i,
      /\bKBS\b/i,
      /\bTRT\b/i,
      /\bODISHA\b/i,
      /\bSANSAD\b/i,
      /\bZEE\b/i,
      /\bFUJI\b/i,
      /\bNITTELE\b/i,
      /\bGOLF NETWORK\b/i,
      /专区/i,
    ],
    blockedUrlPatterns: [
      /iptv\.catvod\.com/i,
      /live\.ottiptv\.cc\/huya/i,
      /live\.ottiptv\.cc\/bilibili/i,
      /douyu1\.php/i,
      /douyin\//i,
      /\/yy\//i,
      /live\.nctv\.top/i,
      /czstream\.com/i,
      /goodiptv\.club\/douyu/i,
      /cdn\.jdshipin\.com:8880\/huya\.php/i,
      /jdshipin\.com\/.*(huya|douyu)/i,
      /kwimgs\.com/i,
      /yximgs\.com/i,
      /ffzy-play/i,
      /cfss\.cc\/api\/kg/i,
      /\.mp4(\?|$)/i,
    ],
    lowValueNames: [
      /专场/i,
      /系列/i,
      /点歌台/i,
      /直播间/i,
      /DJ/i,
      /手游/i,
      /单机/i,
      /海选/i,
      /陪看/i,
      /台长/i,
      /Fans/i,
      /音乐秀/i,
      /精选\d+首/i,
      /合集/i,
      /演唱会完整/i,
      /电影轮播/i,
      /NBA\s*\d+/i,
      /原神|斗地主|QQ飞车|我的世界|拳皇|植物大战僵尸/i,
    ],
    allowValuableSpecials: [
      /CCTV/i,
      /CGTN/i,
      /卫视/i,
      /频道/i,
      /电视台/i,
      /新闻综合/i,
      /公共频道/i,
      /凤凰/i,
      /TVB/i,
      /咪咕/i,
      /CHC/i,
    ],
  },
  SAAS: {
    sessionTtlSeconds: 86400 * 7,
    defaultRole: 'user',
    adminApiKeys: [], // 可在 wrangler secret 或环境变量覆盖
  },
  ROUTING: {
    ispBoost: {
      电信: ['judy-gotv', '.cn'],
      联通: ['judy-gotv', '.cn'],
      移动: ['judy-gotv', 'migu'],
      telecom: ['judy-gotv'],
      unicom: ['judy-gotv'],
      mobile: ['judy-gotv'],
    },
    countryBoost: {
      CN: ['judy-gotv', '.cn'],
      HK: ['iptv-org', 'tvb'],
      TW: ['iptv-org'],
    },
  },
  METRICS: {
    retentionDays: 30,
  },
  STREAM: {
    proxyPath: '/api/stream',
    maxFallbackAttempts: 3,
  },
  CATEGORY_RULES: [
    { name: '咪咕体育', patterns: [/咪咕|migu|miguvideo|cmvideo|咪视界/i, /体育|足球|篮球|NBA|CBA|英超|西甲|欧冠|亚冠|中超|网球|斯诺克|F1|赛车|高尔夫|搏击|UFC/i] },
    { name: '央视频道', patterns: [/CCTV|央视|CGTN/i] },
    { name: '央视频道', patterns: [/CGTN\s*(西班牙语|法语|阿拉伯语|俄语|纪录)/i] },
    { name: '港澳台', patterns: [/\bTVB\b|\bATV\b|明珠|凤凰|凤凰卫视|无线|ViuTV|HOY|澳门|台湾|中视|华视|民视|台视|三立|东森|纬来|中天|耀才|RHK|VIU/i] },
    { name: '卫视频道', patterns: [/卫视/i] },
    { name: '地方频道', patterns: [/(北京|上海|天津|重庆|河北|山西|内蒙古|辽宁|吉林|黑龙江|江苏|浙江|安徽|福建|江西|山东|河南|湖北|湖南|广东|广西|海南|四川|贵州|云南|西藏|陕西|甘肃|青海|宁夏|新疆|深圳|广州|珠海|佛山|东莞|汕头|南宁|海口|南京|苏州|无锡|常州|南通|杭州|宁波|温州|嘉兴|绍兴|金华|合肥|芜湖|福州|厦门|泉州|南昌|赣州|济南|青岛|烟台|郑州|洛阳|武汉|宜昌|长沙|株洲|广州|深圳|珠海|南宁|桂林|海口|三亚|成都|绵阳|贵阳|昆明|拉萨|西安|宝鸡|兰州|西宁|银川|乌鲁木齐|哈尔滨|长春|沈阳|大连)/i, /台|频道|新闻|综合|公共|都市|生活|影视|文体|科教|少儿|教育|法治|民生|农村|城市|导视|家庭|移动电视|体育|休闲/i] },
    { name: '体育', patterns: [/体育|足球|篮球|NBA|CBA|英超|西甲|欧冠|亚冠|中超|ESPN|Sport|F1|网球|斯诺克|高尔夫|搏击|UFC/i] },
    { name: '影视', patterns: [/电影|影院|CHC|影视|电视剧|剧场|影视频道|欢笑剧场|经典剧场/i] },
    { name: '新闻', patterns: [/新闻|资讯|凤凰资讯|新闻频道|新闻综合/i] },
    { name: '少儿动漫', patterns: [/少儿|儿童|卡通|动漫|Cartoon|KAKU|CCTV14|金鹰卡通|动画/i] },
    { name: '纪实人文', patterns: [/纪实|人文|地理|探索|Discovery|National Geographic|求索|风云地理/i] },
    { name: '综艺娱乐', patterns: [/综艺|娱乐|音乐|演唱会|芒果|Show|MTV/i] },
  ],
};
