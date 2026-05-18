import { getJSON, KV_KEYS } from '../utils/cache.js';
import { rankSources, getClientContext } from './router.js';

/**
 * 个性化推荐：地区 + ISP + 用户偏好 + 历史质量
 */
export async function recommendChannels(env, request, authUser = null, limit = 20) {
  const channels = (await getJSON(env, KV_KEYS.CHANNELS)) || [];
  const prefs = authUser?.preferences || {};
  const ctx = getClientContext(request);

  const scored = channels
    .filter((ch) => !isBlocked(ch, prefs))
    .map((ch) => {
      const ranked = rankSources(ch, request, prefs);
      const best = ranked[0];
      return {
        channel: ch,
        best_source: best,
        score: channelRecommendScore(ch, best, ctx, prefs),
        fallbacks: ranked.slice(1, 3).map((s) => s.url),
      };
    })
    .filter((r) => r.best_source && r.best_source.status !== 'dead')
    .sort((a, b) => b.score - a.score);

  return {
    context: ctx,
    recommendations: scored.slice(0, limit).map((r) => ({
      id: channelId(r.channel),
      name: r.channel.name,
      normalized_name: r.channel.normalized_name,
      category: r.channel.category,
      logo: r.channel.logo,
      recommended_url: r.best_source.url,
      latency: r.best_source.latency,
      status: r.best_source.status,
      fallbacks: r.fallbacks,
      score: r.score,
    })),
  };
}

export async function recommendForChannel(env, request, channelKey, authUser = null) {
  const channels = (await getJSON(env, KV_KEYS.CHANNELS)) || [];
  const ch = channels.find(
    (c) => channelId(c) === channelKey || c.normalized_name === channelKey,
  );
  if (!ch) return null;

  const prefs = authUser?.preferences || {};
  const ranked = rankSources(ch, request, prefs);

  return {
    channel: ch.normalized_name,
    sources: ranked.map((s, i) => ({
      index: i,
      url: s.url,
      latency: s.latency,
      status: s.status,
      primary: i === 0,
    })),
  };
}

function channelRecommendScore(channel, bestSource, ctx, prefs) {
  let score = 0;
  if (bestSource?.status === 'healthy') score += 50;
  score += Math.max(0, 30 - Math.floor((bestSource?.latency || 3000) / 100));

  if (prefs.favorite_categories?.includes(channel.category)) score += 25;
  if (prefs.preferred_region && channel.region === prefs.preferred_region) score += 15;
  if (ctx.country === 'CN' && channel.region === 'CN') score += 10;

  return score;
}

function isBlocked(channel, prefs) {
  const blocked = prefs.blocked_channels || [];
  return blocked.includes(channel.normalized_name) || blocked.includes(channel.name);
}

export function channelId(channel) {
  return encodeURIComponent(channel.normalized_name || channel.name);
}
