import config from '../../config/config.js';
import { getJSON, KV_KEYS } from '../utils/cache.js';
import { rankSources } from './router.js';
import { channelId } from './recommend.js';
import { validateSource } from './validator.js';
import { computeSourceHealthScore, getHealthLevel } from './healthScore.js';

/**
 * 高级多源 fallback：主源失败自动切换备用源
 */
export async function resolveStreamWithFallback(env, request, channelKey, fallbackIndex = 0, userPrefs = null) {
  const channels = (await getJSON(env, KV_KEYS.CHANNELS)) || [];
  const channel = channels.find(
    (c) => channelId(c) === channelKey || decodeURIComponent(channelKey) === c.normalized_name,
  );

  if (!channel) return { error: 'channel_not_found', status: 404 };

  const ranked = rankSources(channel, request, userPrefs);
  const maxAttempts = config.STREAM.maxFallbackAttempts;
  const startIdx = Math.min(fallbackIndex, ranked.length - 1);

  for (let i = startIdx; i < Math.min(startIdx + maxAttempts, ranked.length); i++) {
    const source = ranked[i];
    if (!source?.url) continue;

    // 快速探测当前源是否可用
    const check = await validateSource(source.url, { timeout: 3000 });
    if (check.status !== 'dead') {
      return {
        url: source.url,
        index: i,
        total: ranked.length,
        status: check.status,
        latency: check.latency,
        channel: channel.normalized_name,
        fallbacks: ranked.slice(i + 1, i + maxAttempts).map((s) => s.url),
      };
    }
  }

  // 全部失败时仍返回排序第一的 URL（由播放器重试）
  const fallback = ranked[0];
  return {
    url: fallback?.url,
    index: 0,
    total: ranked.length,
    status: 'unstable',
    channel: channel.normalized_name,
    exhausted: true,
  };
}

/** 生成带 fallback 代理地址的 M3U URL */
export function proxyStreamUrl(request, channel, baseUrl) {
  const id = channelId(channel);
  return `${baseUrl}${config.STREAM.proxyPath}/${id}`;
}

export function getBaseUrl(request) {
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

/**
 * HLS 代理中转：代理 M3U8 播放列表内容
 * 当直连失败时自动走 Cloudflare 代理，提升可播放率
 */
export async function proxyHlsStream(request, streamUrl, options = {}) {
  const maxRedirects = options.maxRedirects ?? 5;
  const timeout = options.timeout ?? 10000;

  try {
    const response = await fetch(streamUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'IPTVx-Player/1.0',
        'Referer': new URL(streamUrl).origin,
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(timeout),
      cf: {
        cacheTtl: 0,
        cacheEverything: false,
      },
    });

    if (!response.ok) {
      return {
        error: 'stream_unavailable',
        status: response.status,
        url: streamUrl,
      };
    }

    const contentType = response.headers.get('Content-Type') || '';
    const body = await response.arrayBuffer();

    // 如果是 M3U8 文件，重写其中的相对路径
    if (contentType.includes('vnd.apple.mpegurl') || contentType.includes('x-mpegurl') || streamUrl.includes('.m3u8')) {
      const text = new TextDecoder().decode(body);
      const rewritten = rewriteM3u8Urls(text, streamUrl);
      return new Response(rewritten, {
        headers: {
          'Content-Type': 'application/vnd.apple.mpegurl',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-cache',
        },
      });
    }

    // 其他内容类型直接返回
    return new Response(body, {
      headers: {
        'Content-Type': contentType || 'application/octet-stream',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache',
      },
    });
  } catch (err) {
    return {
      error: 'proxy_failed',
      message: String(err),
      url: streamUrl,
    };
  }
}

/**
 * 重写 M3U8 中的相对路径为代理 URL
 */
function rewriteM3u8Urls(m3u8Content, baseUrl) {
  const base = new URL(baseUrl);
  const baseUrlObj = `${base.protocol}//${base.host}`;

  return m3u8Content.split('\n').map((line) => {
    // 跳过注释和 EXTINF 行
    if (line.startsWith('#')) return line;
    if (!line.trim()) return line;

    // 如果是相对路径，转换为绝对路径
    if (line.startsWith('./') || line.startsWith('../') || !line.startsWith('http')) {
      try {
        const absolute = new URL(line, baseUrl).toString();
        return absolute;
      } catch {
        return line;
      }
    }

    return line;
  }).join('\n');
}

/**
 * 获取源的代理 URL
 */
export function buildProxyUrl(request, channel, sourceUrl) {
  const baseUrl = getBaseUrl(request);
  const channelId = encodeURIComponent(channel.normalized_name || channel.name);
  const encodedUrl = encodeURIComponent(sourceUrl);
  return `${baseUrl}${config.STREAM.proxyPath}/${channelId}?url=${encodedUrl}`;
}

