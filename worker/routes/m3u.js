import { getKV, KV_KEYS } from '../utils/cache.js';
import { runFullPipeline } from '../services/collector.js';
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
    const result = await runFullPipeline(env);
    playlist =
      (await buildRoutedPlaylist(env, request, { useProxy, userPrefs })) ||
      result.playlist ||
      (await getKV(env, KV_KEYS.PLAYLIST));
  }

  if (!playlist) {
    return new Response('#EXTM3U\n', { status: 503, headers: M3U_HEADERS });
  }

  return new Response(playlist, { headers: M3U_HEADERS });
}
