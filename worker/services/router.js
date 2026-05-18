import config from '../../config/config.js';

/**
 * 边缘智能路由：国家 / Colo / ISP (cf.asOrganization) 综合打分
 */
export function rankSources(channel, request, userPrefs = null) {
  const sources = (channel.sources || []).filter((s) => s.status !== 'dead');
  if (!sources.length) return channel.sources || [];

  const country = request?.cf?.country || 'XX';
  const colo = request?.cf?.colo || '';
  const isp = (request?.cf?.asOrganization || '').toLowerCase();
  const regionHint = config.REGION_COLO_MAP[colo] || colo;

  const scored = sources.map((s) => ({
    source: s,
    score: computeSourceScore(s, { country, colo, regionHint, isp, userPrefs, channel }),
  }));

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return (a.source.latency ?? 99999) - (b.source.latency ?? 99999);
  });

  return scored.map((x) => x.source);
}

export function pickBestSource(channel, request, userPrefs = null) {
  return rankSources(channel, request, userPrefs)[0]?.url || channel.sources?.[0]?.url;
}

function computeSourceScore(source, ctx) {
  let score = 0;
  const { country, regionHint, isp, userPrefs, channel } = ctx;

  if (source.status === 'healthy') score += 100;
  else if (source.status === 'unstable') score += 40;

  score += Math.round((source.success_rate ?? 0) * 30);
  if (source.latency != null) {
    score += Math.max(0, 50 - Math.floor(source.latency / 100));
  }

  const url = (source.url || '').toLowerCase();
  const srcName = (source.source || '').toLowerCase();

  // 国家优选
  const countryRules = config.ROUTING.countryBoost[country] || [];
  for (const hint of countryRules) {
    if (url.includes(hint) || srcName.includes(hint)) score += 20;
  }

  // ISP 优选（Requirements 4.5）
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

  if (regionHintMatches(source, regionHint, country)) score += 15;

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

function regionHintMatches(source, coloRegion, country) {
  if (!coloRegion) return false;
  const srcRegion = (source.source || '').toLowerCase();
  if (country === 'CN' && srcRegion.includes('judy')) return true;
  if (['HK', 'TW', 'HKMO'].includes(coloRegion) && srcRegion.includes('iptv')) return true;
  return false;
}

export function getClientContext(request) {
  return {
    country: request?.cf?.country,
    colo: request?.cf?.colo,
    isp: request?.cf?.asOrganization,
    city: request?.cf?.city,
  };
}
