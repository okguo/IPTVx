import config from '../../config/config.js';
import { KV_KEYS, getJSON, setJSON, getKV, setKV } from '../utils/cache.js';
import { sha256Hex, randomToken, randomApiKey } from '../utils/crypto.js';

export async function hashPassword(password, salt = 'iptvx') {
  return sha256Hex(`${salt}:${password}`);
}

export async function createUser(env, { email, password, role }) {
  const users = (await getJSON(env, 'users:index')) || { emails: {}, ids: {} };
  if (users.emails[email]) {
    throw new AuthError('邮箱已注册', 409);
  }

  const id = `u_${randomToken(8)}`;
  const apiKey = randomApiKey();
  const user = {
    id,
    email,
    password_hash: await hashPassword(password),
    api_key: apiKey,
    role: role || config.SAAS.defaultRole,
    created_at: new Date().toISOString(),
    preferences: defaultPreferences(),
  };

  users.emails[email] = id;
  users.ids[id] = email;
  await setJSON(env, 'users:index', users);
  await setJSON(env, `${KV_KEYS.USER_PREFIX}${id}`, user);
  await setKV(env, `${KV_KEYS.APIKEY_PREFIX}${apiKey}`, id, config.KV_TTL.playlist);

  return { user: sanitizeUser(user), apiKey };
}

export async function loginUser(env, { email, password }) {
  const users = (await getJSON(env, 'users:index')) || { emails: {} };
  const id = users.emails[email];
  if (!id) throw new AuthError('用户不存在', 401);

  const user = await getJSON(env, `${KV_KEYS.USER_PREFIX}${id}`);
  const hash = await hashPassword(password);
  if (user.password_hash !== hash) throw new AuthError('密码错误', 401);

  const token = randomToken(32);
  const session = {
    userId: id,
    email: user.email,
    role: user.role,
    expires: Date.now() + config.SAAS.sessionTtlSeconds * 1000,
  };
  await setJSON(env, `${KV_KEYS.SESSION_PREFIX}${token}`, session);
  await setKV(env, `${KV_KEYS.SESSION_PREFIX}${token}`, JSON.stringify(session), config.SAAS.sessionTtlSeconds);

  return { token, user: sanitizeUser(user) };
}

export async function resolveAuth(request, env) {
  const apiKey = request.headers.get('X-API-Key') || new URL(request.url).searchParams.get('api_key');

  const adminKey = env.ADMIN_API_KEY;
  if (adminKey && apiKey === adminKey) {
    return {
      user: { id: 'admin', email: 'admin@iptvx.local', role: 'admin', preferences: {} },
      method: 'admin_key',
    };
  }

  if (apiKey) {
    const userId = await getKV(env, `${KV_KEYS.APIKEY_PREFIX}${apiKey}`);
    if (userId) {
      const user = await getJSON(env, `${KV_KEYS.USER_PREFIX}${userId}`);
      if (user) return { user, method: 'api_key' };
    }
  }

  const authHeader = request.headers.get('Authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (token) {
    const session = await getJSON(env, `${KV_KEYS.SESSION_PREFIX}${token}`);
    if (session && session.expires > Date.now()) {
      const user = await getJSON(env, `${KV_KEYS.USER_PREFIX}${session.userId}`);
      if (user) return { user, method: 'session', token };
    }
  }

  return null;
}

export function requireAuth(auth, roles = []) {
  if (!auth?.user) throw new AuthError('未授权', 401);
  if (roles.length && !roles.includes(auth.user.role) && auth.user.role !== 'admin') {
    throw new AuthError('权限不足', 403);
  }
  return auth.user;
}

export async function updateUserPreferences(env, userId, prefs) {
  const user = await getJSON(env, `${KV_KEYS.USER_PREFIX}${userId}`);
  if (!user) throw new AuthError('用户不存在', 404);

  user.preferences = { ...user.preferences, ...prefs, updated_at: new Date().toISOString() };
  await setJSON(env, `${KV_KEYS.USER_PREFIX}${userId}`, user);

  return user.preferences;
}

function defaultPreferences() {
  return {
    favorite_categories: [],
    preferred_region: '',
    preferred_quality: 'HD',
    blocked_channels: [],
    preferred_isp: '',
  };
}

function sanitizeUser(user) {
  const { password_hash, api_key, ...safe } = user;
  return safe;
}

export class AuthError extends Error {
  constructor(message, status = 401) {
    super(message);
    this.status = status;
  }
}
