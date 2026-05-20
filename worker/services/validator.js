import config from '../../config/config.js';
import { fetchWithTimeout } from '../utils/fetch.js';

/**
 * 测速单条源：GET 测首包时间（HLS/m3u8 不支持 HEAD）
 * 对 m3u8 流，只请求前 1KB 数据来验证可用性
 */
export async function validateSource(url, options = {}) {
  const timeout = options.timeout ?? config.VALIDATE_TIMEOUT_MS;
  const start = Date.now();

  try {
    // HLS/m3u8 流通常不支持 HEAD，直接用 GET 测首包
    const res = await fetch(url, {
      method: 'GET',
      signal: AbortSignal.timeout(timeout),
      redirect: 'follow',
      cf: {
        cacheTtl: 0, // 不缓存测速请求
        // 尽量使用 Cloudflare 的优化路由
        fetcher: 'default',
      },
    });
    const latency = Date.now() - start;

    // 宽松策略：只要不是明确错误状态就算可用
    // 很多 HLS 源返回 200/206，有些代理源返回 302/301 重定向
    if (res.status >= 400) {
      return { url, status: 'dead', latency, success_rate: 0 };
    }

    // 不再检查 Content-Type，因为很多可用源返回的 Content-Type 不符合预期
    // 只要 HTTP 状态码 OK 就认为可用
    return scoreLatency(latency);
  } catch (err) {
    // 超时或网络错误标记为 dead
    const latency = Date.now() - start;
    return { url, status: 'dead', latency, success_rate: 0 };
  }
}

function scoreLatency(latency) {
  if (latency >= config.UNSTABLE_LATENCY_MS) {
    return { status: 'unstable', latency, success_rate: 0.6 };
  }
  return { status: 'healthy', latency, success_rate: 1 };
}

/** 健康状态机：healthy / unstable / dead */
export function transitionHealth(previous, result) {
  const prev = previous || {
    status: 'unknown',
    failures: 0,
    success_rate: 1,
    latency: null,
  };

  const failures =
    result.status === 'dead' ? (prev.failures || 0) + 1 : Math.max(0, (prev.failures || 0) - 1);

  let status = result.status;
  if (failures >= config.MAX_FAILURES) {
    status = 'dead';
  } else if (failures > 0 && status === 'healthy') {
    status = 'unstable';
  }

  const success_rate = Math.min(
    1,
    Math.max(0, (prev.success_rate ?? 1) * 0.7 + (result.success_rate ?? 0) * 0.3),
  );

  return {
    status,
    latency: result.latency ?? prev.latency,
    success_rate,
    failures,
    last_check: Date.now(),
  };
}

export async function validateChannelSources(channel, options = {}) {
  const limit = options.concurrency ?? config.VALIDATE_CONCURRENCY;
  const sources = [...(channel.sources || [])];
  const validated = [];

  for (let i = 0; i < sources.length; i += limit) {
    const batch = sources.slice(i, i + limit);
    const results = await Promise.all(
      batch.map(async (src) => {
        const result = await validateSource(src.url, options);
        const health = transitionHealth(src, result);
        return { ...src, ...health };
      }),
    );
    validated.push(...results);
  }

  validated.sort((a, b) => {
    const order = { healthy: 0, unstable: 1, unknown: 2, dead: 3 };
    const diff = (order[a.status] ?? 9) - (order[b.status] ?? 9);
    if (diff !== 0) return diff;
    return (a.latency ?? 99999) - (b.latency ?? 99999);
  });

  return {
    ...channel,
    sources: validated.slice(0, config.MAX_SOURCES_PER_CHANNEL),
  };
}

/** 单频道测速：找到第一个可用源即停止（节省 CPU/时间） */
export async function validateChannelEarlyExit(channel, options = {}) {
  const timeout = options.timeout ?? 2500;
  const sources = [...(channel.sources || [])];
  const validated = [];
  const maxProbe = options.maxProbe ?? config.PIPELINE?.liteValidateProbePerChannel ?? 2;

  for (const src of sources) {
    const result = await validateSource(src.url, { timeout });
    const health = transitionHealth(src, result);
    validated.push({ ...src, ...health });
    const playableCount = validated.filter((s) => s.status === 'healthy' || s.status === 'unstable').length;
    if (playableCount >= maxProbe) {
      break;
    }
    if (validated.length >= maxProbe && playableCount > 0) break;
  }

  validated.sort((a, b) => {
    const order = { healthy: 0, unstable: 1, unknown: 2, dead: 3 };
    const diff = (order[a.status] ?? 9) - (order[b.status] ?? 9);
    if (diff !== 0) return diff;
    return (a.latency ?? 99999) - (b.latency ?? 99999);
  });

  return { ...channel, sources: validated };
}

/**
 * 轻量批量测速：小批次并发 + 早停，适合 fast 流水线
 */
export async function validateChannelsLite(channels, options = {}) {
  const cfg = options.pipeline ?? {};
  const maxCh = options.maxChannels ?? cfg.liteValidateMaxChannels ?? 600;
  const batchSize = options.batchSize ?? cfg.liteValidateBatchSize ?? 15;
  const timeout = options.timeout ?? cfg.liteValidateTimeoutMs ?? 2500;
  const earlyExit = options.earlyExit ?? cfg.liteValidateEarlyExit ?? true;

  const toValidate = channels.slice(0, maxCh);
  const output = [];

  for (let i = 0; i < toValidate.length; i += batchSize) {
    const batch = toValidate.slice(i, i + batchSize);
    const done = await Promise.all(
      batch.map((ch) =>
        earlyExit
          ? validateChannelEarlyExit(ch, {
              timeout,
              maxProbe: cfg.liteValidateProbePerChannel ?? 2,
            })
          : validateChannelSources(ch, { timeout, concurrency: 2 }),
      ),
    );
    output.push(...done);
  }

  return output;
}

/** 仅保留至少有一条可播放源的频道 */
export function filterPlayableChannels(channels) {
  return channels.filter((ch) =>
    (ch.sources || []).some((s) => s.status === 'healthy' || s.status === 'unstable'),
  );
}

export async function validateAllChannels(channels, options = {}) {
  const batchSize = options.batchSize ?? config.CRON_BATCH_SIZE;
  const output = [];

  for (let i = 0; i < channels.length; i += batchSize) {
    const slice = channels.slice(i, i + batchSize);
    const done = await Promise.all(slice.map((ch) => validateChannelSources(ch, options)));
    output.push(...done);
  }
  return output;
}

export function summarizeHealth(channels) {
  let healthy = 0;
  let unstable = 0;
  let dead = 0;
  let unknown = 0;

  for (const ch of channels) {
    for (const s of ch.sources || []) {
      if (s.status === 'healthy') healthy++;
      else if (s.status === 'unstable') unstable++;
      else if (s.status === 'dead') dead++;
      else unknown++;
    }
  }

  return {
    healthy,
    unstable,
    dead,
    unknown,
    channels: channels.length,
    updated_at: new Date().toISOString(),
  };
}
