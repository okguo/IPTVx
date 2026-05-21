import { handleM3U } from './routes/m3u.js';
import { handleEPG } from './routes/epg.js';
import {
  handleHealth,
  handleStats,
  handleDashboard,
  handleMetrics,
  handleValidationTrend,
  handleSourceReport,
  handleActiveSources,
  handleSetSourceStatus,
  handleHealthScore,
  handleSourceDiscovery,
  handleTriggerDiscovery,
  handleHeatmapReport,
  handleUserGeo,
} from './routes/api.js';
import { handleRegister, handleLogin } from './routes/auth.js';
import {
  handleGetPreferences,
  handlePutPreferences,
  handleRecommendations,
  handleAddFavorite,
  handleRemoveFavorite,
  handleGetFavorites,
} from './routes/user.js';
import { handleStream, handleStreamPlaylist } from './routes/stream.js';
import { handleAdminApi, handleAdminPage } from './routes/admin.js';
import { handlePlayerPage } from './routes/player.js';
import { runFastPipeline } from './services/collector.js';
import { withRequestContext } from './middleware/request.js';
import { createLogger } from './utils/logger.js';

const log = createLogger('worker');

const ROUTES = [
  { method: 'GET', path: '/', handler: (req, env, ctx) => handleHealth(req, env, ctx) },
  { method: 'GET', path: '/health', handler: (req, env, ctx) => handleHealth(req, env, ctx) },
  { method: 'GET', path: '/iptv.m3u', handler: (req, env, ctx) => handleM3U(req, env, ctx) },
  { method: 'GET', path: '/epg.xml', handler: (req, env) => handleEPG(req, env) },
  { method: 'GET', path: '/api/stats', handler: (req, env) => handleStats(env) },
  { method: 'GET', path: '/api/metrics', handler: (req, env) => handleMetrics(env) },
  { method: 'GET', path: '/api/recommend', handler: (req, env, ctx) => handleRecommendations(req, env, ctx) },
  { method: 'GET', path: '/api/validation/trend', handler: (req, env) => handleValidationTrend(req, env) },
  { method: 'GET', path: '/api/source/report', handler: (req, env) => handleSourceReport(req, env) },
  { method: 'GET', path: '/api/source/active', handler: (req, env) => handleActiveSources(req, env) },
  { method: 'POST', path: '/api/source/status', handler: (req, env) => handleSetSourceStatus(req, env) },
  { method: 'GET', path: '/api/health/score', handler: (req, env) => handleHealthScore(req, env) },
  { method: 'GET', path: '/api/source/discovery', handler: (req, env) => handleSourceDiscovery(req, env) },
  { method: 'POST', path: '/api/source/discovery', handler: (req, env) => handleTriggerDiscovery(env) },
  { method: 'GET', path: '/api/heatmap', handler: (req, env) => handleHeatmapReport(req, env) },
  { method: 'GET', path: '/api/geo', handler: (req) => handleUserGeo(req) },
  { method: 'GET', path: '/dashboard', handler: (req, env) => handleDashboard(env) },
  { method: 'GET', path: '/player', handler: (req) => handlePlayerPage(req) },
  { method: 'GET', path: '/admin', handler: (req, env) => handleAdminPage(env) },
  { method: 'POST', path: '/api/auth/register', handler: (req, env) => handleRegister(req, env) },
  { method: 'POST', path: '/api/auth/login', handler: (req, env) => handleLogin(req, env) },
  { method: 'GET', path: '/api/user/preferences', handler: (req, env, ctx) => handleGetPreferences(req, env, ctx) },
  { method: 'PUT', path: '/api/user/preferences', handler: (req, env, ctx) => handlePutPreferences(req, env, ctx) },
  { method: 'POST', path: '/api/user/favorites', handler: (req, env, ctx) => handleAddFavorite(req, env, ctx) },
  { method: 'DELETE', path: '/api/user/favorites', handler: (req, env, ctx) => handleRemoveFavorite(req, env, ctx) },
  { method: 'GET', path: '/api/user/favorites', handler: (req, env, ctx) => handleGetFavorites(req, env, ctx) },
  { method: 'GET', path: '/api/stream/playlist', handler: (req, env, ctx) => handleStreamPlaylist(req, env, ctx) },
];

function matchRoute(url, method) {
  const path = url.pathname;

  if (path.startsWith('/api/stream/') && method === 'GET') {
    return { handler: (req, env, ctx) => handleStream(req, env, ctx) };
  }
  if (path.startsWith('/api/admin/')) {
    return { handler: (req, env, ctx) => handleAdminApi(req, env, ctx) };
  }

  const found = ROUTES.find((r) => r.path === path && r.method === method);
  return found ? { handler: found.handler } : null;
}

export default {
  async fetch(request, env, ctx) {
    return withRequestContext(request, env, async (req, environment, context) => {
      const url = new URL(req.url);
      const route = matchRoute(url, req.method);

      if (route) {
        return route.handler(req, environment, { ...context, executionCtx: ctx });
      }

      return Response.json(
        {
          service: 'IPTVx',
          phase: 4,
          routes: [
            '/health',
            '/iptv.m3u?proxy=1',
            '/epg.xml',
            '/player',
            '/dashboard',
            '/admin',
            '/api/auth/register',
            '/api/auth/login',
            '/api/user/preferences',
            '/api/user/favorites',
            '/api/recommend',
            '/api/stream/{channelId}',
            '/api/metrics',
            '/api/validation/trend',
            '/api/source/report',
            '/api/source/active',
            '/api/health/score',
            '/api/source/discovery',
            '/api/heatmap',
            '/api/geo',
          ],
        },
        { status: 404 },
      );
    }, ctx);
  },

  async scheduled(event, env, ctx) {
    log.info('Cron 触发', { cron: event.cron });
    ctx.waitUntil(runFastPipeline(env).catch((e) => console.error('[scheduled]', e)));
  },
};
