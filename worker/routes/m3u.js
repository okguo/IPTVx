import { getKV, KV_KEYS } from '../utils/cache.js';
import { buildRoutedPlaylist } from './api.js';

const M3U_HEADERS = {
  'Content-Type': 'application/vnd.apple.mpegurl',
  'Cache-Control': 'public, max-age=300',
};

export async function handleM3U(request, env, ctx = {}) {
  const url = new URL(request.url);
  const useProxy = url.searchParams.get('proxy') === '1';
  const userPrefs = ctx.auth?.user?.preferences || null;

  let playlist = await buildRoutedPlaylist(env, request, { useProxy, userPrefs });

  if (!playlist) {
    playlist = await getKV(env, KV_KEYS.PLAYLIST);
  }

  if (!playlist) {
    return Response.json(
      {
        error: 'playlist_not_ready',
        message: '播放列表尚未生成。请 POST /api/admin/cron/trigger 触发采集，或等待每小时 Cron。',
        hint: 'curl -X POST -H "X-API-Key: YOUR_ADMIN_KEY" https://your-domain/api/admin/cron/trigger',
      },
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    );
  }

  return new Response(playlist, { headers: M3U_HEADERS });
}
