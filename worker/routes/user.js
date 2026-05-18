import { requireAuth, updateUserPreferences, AuthError } from '../services/auth.js';
import { recommendChannels } from '../services/recommend.js';

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
