import { handleM3U } from './routes/m3u.js';
import { handleEPG } from './routes/epg.js';
import { handleHealth, handleStats, handleDashboard } from './routes/api.js';
import { runFullPipeline } from './services/collector.js';
import { createLogger } from './utils/logger.js';

const log = createLogger('worker');

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path === '/' || path === '/health') {
        return handleHealth(request, env);
      }
      if (path === '/iptv.m3u') {
        return handleM3U(request, env);
      }
      if (path === '/epg.xml') {
        return handleEPG(request, env);
      }
      if (path === '/api/stats') {
        return handleStats(env);
      }
      if (path === '/dashboard') {
        return handleDashboard(env);
      }

      return Response.json(
        {
          service: 'IPTVx',
          routes: ['/', '/health', '/iptv.m3u', '/epg.xml', '/api/stats', '/dashboard'],
        },
        { status: 404 },
      );
    } catch (err) {
      log.error('请求处理失败', { path, error: String(err) });
      return Response.json({ error: 'Internal Server Error' }, { status: 500 });
    }
  },

  async scheduled(event, env, ctx) {
    log.info('Cron 触发', { cron: event.cron });
    ctx.waitUntil(runFullPipeline(env));
  },
};
