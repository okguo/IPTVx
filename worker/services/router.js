import config from '../../config/config.js';
import { getGeoASNPreference, sourceMatchesPreference, getSourcePreferenceRank, getUserRegion } from './geoASNMap.js';
import { getGeoASNHeatmapScore, getHeatmapReport } from './validationHistory.js';
import { getJSON, KV_KEYS } from '../utils/cache.js';

const HEATMAP_KEY = 'heatmap:geoasn';

/**
 * 边缘智能路由：GeoIP + ASN 组合调度
 * Phase 1: 静态 GeoIP+ASN 偏好映射
 * Phase 2: 叠加历史热力图延迟数据
 */
export async function rankSources(channel, request, userPrefs = null, env = null) {
  const sources = (channel.sources || []).filter((s) => s.status !== 'dead');
  if (!sources.length) return channel.sources || [];

  const cf = request?.cf || {};
  const country = cf.country || 'XX';
  const colo = cf.colo || '';
  const isp = (cf.asOrganization || '').toLowerCase();
  const asn = cf.asn || 0;
  const region = cf.region || '*';

  // Phase 1: GeoIP+ASN 静态偏好
  const geoASNPreference = getGeoASNPreference(cf);

  // Phase 2: 历史热力图延迟数据（按 GeoIP+ASN 聚合）
  const geoASNKey = `${country}-${region}-${asn}`;
  let heatmap = null;
  if (env) {
    heatmap = (await getJSON(env, HEATMAP_KEY)) || null;
  }

  const scored = sources.map((s) => ({
    source: s,
    score: computeSourceScore(s, {
      country,
      colo,
      regionHint: config.REGION_COLO_MAP[colo] || colo,
      region,
      isp,
      asn,
      geoASNKey,
      geoASNPreference,
      userPrefs,
      channel,
      heatmap,
    }),
  }));

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return (a.source.latency ?? 99999) - (b.source.latency ?? 99999);
  });

  return scored.map((x) => x.source);
}

export async function pickBestSource(channel, request, userPrefs = null, env = null) {
  const ranked = await rankSources(channel, request, userPrefs, env);
  return ranked[0]?.url || channel.sources?.[0]?.url;
}

function computeSourceScore(source, ctx) {
  let score = 0;
  const { country, regionHint, region, isp, asn, geoASNKey, geoASNPreference, userPrefs, channel, heatmap } = ctx;

  // ========== 基础健康分 ==========
  if (source.status === 'healthy') score += 100;
  else if (source.status === 'unstable') score += 40;

  score += Math.round((source.success_rate ?? 0) * 30);

  // ========== 延迟分（Cron 测速的基准延迟） ==========
  if (source.latency != null) {
    score += Math.max(0, 50 - Math.floor(source.latency / 100));
  }

  // ========== Phase 1: GeoIP+ASN 静态偏好（权重最高） ==========
  if (geoASNPreference) {
    const prefRank = getSourcePreferenceRank(source.url, source.source, geoASNPreference);
    if (prefRank < 999) {
      // 优先级排名转换为分数：排名 0 = 200 分，排名 1 = 150 分，排名 2 = 100 分
      const prefScore = Math.max(50, 200 - prefRank * 50);
      score += prefScore * (geoASNPreference.weight / 100);
    }
  }

  // ========== Phase 2: 历史热力图延迟加成 ==========
  if (heatmap) {
    const heatmapScore = getGeoASNHeatmapScore(source.url, geoASNKey, heatmap);
    if (heatmapScore) {
      // 热力图分数：历史平均延迟的倒数，转换为 0-100 的加成
      const latencyBonus = Math.max(0, 100 - Math.floor(heatmapScore.avg_latency / 20));
      score += latencyBonus * heatmapScore.confidence;
    }
  }

  // ========== 传统 ISP/Country 匹配（向后兼容） ==========
  const url = (source.url || '').toLowerCase();
  const srcName = (source.source || '').toLowerCase();

  // 国家优选
  const countryRules = config.ROUTING.countryBoost[country] || [];
  for (const hint of countryRules) {
    if (url.includes(hint) || srcName.includes(hint)) score += 20;
  }

  // ISP 优选
  for (const [ispKey, hints] of Object.entries(config.ROUTING.ispBoost)) {
    if (isp.includes(ispKey.toLowerCase())) {
      for (const hint of hints) {
        if (url.includes(hint) || srcName.includes(hint)) score += 25;
      }
    }
  }

  if (userPrefs?.preferred_isp && isp.includes(userPrefs.preferred_isp.toLowerCase())) {
    score += 15;
  }

  // 用户偏好地区/画质
  if (userPrefs?.preferred_region && channel.region === userPrefs.preferred_region) {
    score += 10;
  }
  if (userPrefs?.preferred_quality && channel.quality === userPrefs.preferred_quality) {
    score += 8;
  }

  // 历史质量加权
  if (source.history_score) score += Math.round(source.history_score * 20);

  return score;
}

/**
 * 从源 URL 或标签中提取区域信息
 */
function getRegionFromSource(source) {
  const url = (source.url || '').toLowerCase();
  const srcName = (source.source || '').toLowerCase();
  const text = `${url} ${srcName}`;

  if (text.includes('gd') || text.includes('guangdong') || text.includes('华南')) return '华南';
  if (text.includes('bj') || text.includes('beijing') || text.includes('华北')) return '华北';
  if (text.includes('sh') || text.includes('shanghai') || text.includes('华东')) return '华东';
  if (text.includes('js') || text.includes('jiangsu') || text.includes('华东')) return '华东';
  if (text.includes('zj') || text.includes('zhejiang')) return '华东';
  if (text.includes('sd') || text.includes('shandong')) return '华东';
  if (text.includes('hb') || text.includes('hubei') || text.includes('华中')) return '华中';
  if (text.includes('hn') || text.includes('hunan')) return '华中';
  if (text.includes('sc') || text.includes('sichuan') || text.includes('西南')) return '西南';
  if (text.includes('cq') || text.includes('chongqing')) return '西南';
  if (text.includes('yn') || text.includes('yunnan')) return '西南';
  if (text.includes('gz') || text.includes('guizhou')) return '西南';
  if (text.includes('sn') || text.includes('shaanxi') || text.includes('西北')) return '西北';
  if (text.includes('gs') || text.includes('gansu')) return '西北';
  if (text.includes('ln') || text.includes('liaoning') || text.includes('东北')) return '东北';
  if (text.includes('jl') || text.includes('jilin')) return '东北';
  if (text.includes('hl') || text.includes('heilongjiang')) return '东北';

  return null;
}

export function getClientContext(request) {
  const cf = request?.cf || {};
  const userRegion = getUserRegion(cf);

  return {
    country: cf.country,
    colo: cf.colo,
    isp: cf.asOrganization,
    asn: cf.asn,
    city: cf.city,
    region: cf.region,
    ...userRegion,
  };
}

/**
 * 请求时延迟采样（Phase 2）
 * 在用户实际播放时记录延迟，用于构建热力图
 */
export async function sampleRequestLatency(env, sourceUrl, geoASNKey, latencyMs) {
  if (!env || !sourceUrl || !geoASNKey || latencyMs == null) return;

  try {
    await recordRequestLatency(env, sourceUrl, geoASNKey, latencyMs);
  } catch (err) {
    // 静默失败，不影响用户体验
  }
}
