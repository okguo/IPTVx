import { requireAuth, updateUserPreferences, AuthError } from '../services/auth.js';
import { recommendChannels } from '../services/recommend.js';
import { getJSON, KV_KEYS } from '../utils/cache.js';
import { computeChannelHealthScore, getHealthLevel } from '../services/healthScore.js';

export async function handleGetPreferences(request, env, ctx) {
  try {
    const user = requireAuth(ctx.auth);
    return Response.json({ preferences: user.preferences });
  } catch (err) {
    return authError(err);
  }
}

export async function handlePutPreferences(request, env, ctx) {
  try {
    const user = requireAuth(ctx.auth);
    const body = await request.json();
    const prefs = await updateUserPreferences(env, user.id, body);
    return Response.json({ preferences: prefs });
  } catch (err) {
    return authError(err);
  }
}

/** 添加收藏频道 */
export async function handleAddFavorite(request, env, ctx) {
  try {
    const user = requireAuth(ctx.auth);
    const body = await request.json();
    const channelName = body.channel_name;

    if (!channelName) {
      return Response.json({ error: 'channel_name required' }, { status: 400 });
    }

    const favorites = user.preferences.favorite_channels || [];
    if (favorites.includes(channelName)) {
      return Response.json({ message: 'already favorited', favorites });
    }

    favorites.push(channelName);
    const prefs = await updateUserPreferences(env, user.id, { favorite_channels: favorites });
    return Response.json({ message: 'added', preferences: prefs });
  } catch (err) {
    return authError(err);
  }
}

/** 移除收藏频道 */
export async function handleRemoveFavorite(request, env, ctx) {
  try {
    const user = requireAuth(ctx.auth);
    const body = await request.json();
    const channelName = body.channel_name;

    if (!channelName) {
      return Response.json({ error: 'channel_name required' }, { status: 400 });
    }

    const favorites = (user.preferences.favorite_channels || []).filter((n) => n !== channelName);
    const prefs = await updateUserPreferences(env, user.id, { favorite_channels: favorites });
    return Response.json({ message: 'removed', preferences: prefs });
  } catch (err) {
    return authError(err);
  }
}

/** 获取收藏频道列表（带详细信息） */
export async function handleGetFavorites(request, env, ctx) {
  try {
    const user = requireAuth(ctx.auth);
    const favorites = user.preferences.favorite_channels || [];
    const channels = await getJSON(env, KV_KEYS.CHANNELS) || [];

    const favoriteDetails = favorites.map((name) => {
      const ch = channels.find((c) => c.normalized_name === name || c.name === name);
      if (!ch) return { name, available: false };

      const score = computeChannelHealthScore(ch);
      const level = getHealthLevel(score);
      return {
        name: ch.normalized_name,
        display_name: ch.name,
        category: ch.category,
        logo: ch.logo,
        health_score: score,
        health_level: level,
        available: true,
      };
    });

    return Response.json({ favorites: favoriteDetails, total: favoriteDetails.length });
  } catch (err) {
    return authError(err);
  }
}

export async function handleRecommendations(request, env, ctx) {
  const user = ctx.auth?.user || null;
  const limit = Number(new URL(request.url).searchParams.get('limit') || 20);
  const data = await recommendChannels(env, request, user, limit);
  return Response.json(data);
}

function authError(err) {
  if (err instanceof AuthError) {
    return Response.json({ error: err.message }, { status: err.status });
  }
  return Response.json({ error: String(err) }, { status: 500 });
}
