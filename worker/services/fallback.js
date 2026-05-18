import config from '../../config/config.js';
import { getJSON, KV_KEYS } from '../utils/cache.js';
import { rankSources } from './router.js';
import { channelId } from './recommend.js';
import { validateSource } from './validator.js';

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
