export default {
  SOURCE_LIST: [
    'https://bit.ly/iptv-aptv',
    'https://iptv.yang-1989.eu.org/m3u/Gather.m3u',
    'https://bit.ly/jsnzkpg',
    'https://bit.ly/itvlist',
    'https://bit.ly/suxuang-v4',
    // 'https://iptv-org.github.io/iptv/index.m3u',
  ],
  EPG_SOURCES: [
    'https://iptv-org.github.io/epg/guides/cn.xml',
    'https://iptv-org.github.io/epg/guides/hk.xml',
  ],
  FETCH_TIMEOUT_MS: 8000,
  FETCH_RETRIES: 2,
  VALIDATE_TIMEOUT_MS: 5000,
  VALIDATE_CONCURRENCY: 8,
  MAX_FAILURES: 3,
  UNSTABLE_LATENCY_MS: 3000,
  MAX_SOURCES_PER_CHANNEL: 3,
  KV_TTL: {
    playlist: 86400,
    channels: 86400,
    health: 3600,
    epg: 43200,
    embeddings: 604800,
  },
  CRON_BATCH_SIZE: 20,
  /** 流水线资源上限（防止 6+ 大源合并后触发 Worker 1102 CPU 超限） */
  PIPELINE: {
    maxRawEntries: 4000,
    maxChannels: 800,
    validateMaxChannels: 0,
    validateTimeoutMs: 2000,
    fastDedupeThreshold: 500,
    skipEpgOverChannels: 500,
    skipD1SyncOverChannels: 800,
    skipValidation: false,
    /** 快速模式下的轻量测速（控制并发，避免 1102） */
    liteValidate: true,
    liteValidateMaxChannels: 600,
    liteValidateTimeoutMs: 5000,
    liteValidateBatchSize: 15,
    liteValidateEarlyExit: true,
    /** 仅将测速通过的频道写入 M3U */
    playlistOnlyPlayable: true,
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
  CATEGORY_KEYWORDS: {
    体育: [/体育|足球|篮球|NBA|ESPN|Sport|英超|西甲|F1/i],
    新闻: [/新闻|News|CCTV|央视|BBC|CNN|CNBC/i],
    少儿: [/少儿|儿童|卡通|Cartoon|KAKU|CCTV14|金鹰卡通/i],
    港澳: [/港澳|TVB|ATV|明珠|凤凰|凤凰卫视|无线|ViuTV|HOY/i],
    电影: [/电影|影院|Movie|HBO|好莱坞|CHC|IPTV电影/i],
  },
};
