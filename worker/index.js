import { handleM3U } from './routes/m3u.js';
import { handleEPG } from './routes/epg.js';
import { Router } from 'hono';

const app = new Router();

app.get('/', (c) => c.text('IPTV Worker Running'));
app.get('/iptv.m3u', handleM3U);
app.get('/epg.xml', handleEPG);

export default {
    async fetch(request, env, ctx) {
        return app.fetch(request, env, ctx);
    },
    async scheduled(event, env, ctx) {
        // Cron定时任务
        const { updateAllSources } = await import('./cron/updateSources.js');
        ctx.waitUntil(updateAllSources(env));
    }
};