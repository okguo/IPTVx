import { resolveStreamWithFallback, proxyHlsStream } from '../services/fallback.js';

export async function handleStream(request, env, ctx) {
  const url = new URL(request.url);
  const parts = url.pathname.split('/').filter(Boolean);
  const channelKey = parts[parts.length - 1];
  const fallbackIndex = Number(url.searchParams.get('fallback') || 0);
  const format = url.searchParams.get('format') || 'redirect';

  // 检查是否使用代理模式
  const proxyMode = url.searchParams.get('proxy') === '1';
  const directUrl = url.searchParams.get('url');

  // 直接代理模式：给定 URL 直接代理
  if (proxyMode && directUrl) {
    const result = await proxyHlsStream(request, decodeURIComponent(directUrl));
    if (result.error) {
      return Response.json(result, { status: result.status || 502 });
    }
    return result;
  }

  const userPrefs = ctx.auth?.user?.preferences || null;
  const result = await resolveStreamWithFallback(env, request, channelKey, fallbackIndex, userPrefs);

  if (result.error) {
    return Response.json(result, { status: result.status || 404 });
  }

  // 如果请求代理，返回代理响应而不是重定向
  if (proxyMode) {
    const proxyResult = await proxyHlsStream(request, result.url);
    if (proxyResult.error) {
      return Response.json(proxyResult, { status: 502 });
    }
    return proxyResult;
  }

  if (format === 'json') {
    return Response.json(result);
  }

  // 302 重定向到实际流地址（主源失败时 ?fallback=1）
  return Response.redirect(result.url, 302);
}

export async function handleStreamPlaylist(request, env, ctx) {
  const url = new URL(request.url);
  const channelKey = url.searchParams.get('channel');
  if (!channelKey) {
    return Response.json({ error: 'channel required' }, { status: 400 });
  }

  const userPrefs = ctx.auth?.user?.preferences || null;
  const result = await resolveStreamWithFallback(env, request, channelKey, 0, userPrefs);

  const lines = [
    '#EXTM3U',
    `#EXTINF:-1,${result.channel}`,
    result.url,
  ];
  for (const fb of result.fallbacks || []) {
    lines.push(`#EXTINF:-1,${result.channel} (fallback)`);
    lines.push(fb);
  }

  return new Response(lines.join('\n') + '\n', {
    headers: { 'Content-Type': 'application/vnd.apple.mpegurl' },
  });
}
