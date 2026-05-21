import { getJSON, setJSON, KV_KEYS } from '../utils/cache.js';
import config from '../../config/config.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('source-manager');

/**
 * 失效源自动剔除 + 源池管理
 * 统计每个源的失败率，连续失败的源自动降级或标记告警
 */

const FAILURE_THRESHOLD = 3; // 连续失败次数阈值
const DEGRADED_THRESHOLD = 0.3; // 成功率低于此值则降级
const SOURCE_TTL_DAYS = 30;

/**
 * 记录源级别的测试结果
 */
export async function recordSourceTest(env, sourceUrl, sourceLabel, success, latency = null) {
  const stats = await getSourceStats(env);
  const key = getSourceKey(sourceUrl);

  if (!stats[key]) {
    stats[key] = {
      url: sourceUrl,
      label: sourceLabel,
      first_seen: Date.now(),
      last_check: Date.now(),
      total_checks: 0,
      success_count: 0,
      fail_count: 0,
      consecutive_failures: 0,
      total_latency: 0,
      latency_count: 0,
      status: 'active',
      last_success: null,
      last_failure: null,
      daily_stats: {},
    };
  }

  const entry = stats[key];
  entry.total_checks += 1;
  entry.last_check = Date.now();

  if (success) {
    entry.success_count += 1;
    entry.consecutive_failures = 0;
    entry.last_success = Date.now();
    if (latency != null) {
      entry.total_latency += latency;
      entry.latency_count += 1;
    }
  } else {
    entry.fail_count += 1;
    entry.consecutive_failures += 1;
    entry.last_failure = Date.now();
  }

  // 更新日级统计
  const today = new Date().toISOString().slice(0, 10);
  if (!entry.daily_stats[today]) {
    entry.daily_stats[today] = { checks: 0, success: 0, fail: 0 };
  }
  entry.daily_stats[today].checks += 1;
  if (success) entry.daily_stats[today].success += 1;
  else entry.daily_stats[today].fail += 1;

  // 清理过期的日级统计
  cleanupDailyStats(entry);

  // 自动降级逻辑
  entry.status = computeSourceStatus(entry);

  await setJSON(env, KV_KEYS.SOURCE_STATS, stats);
  return entry;
}

/**
 * 批量记录源测试结果
 */
export async function batchRecordSourceTests(env, results) {
  const stats = await getSourceStats(env);
  const today = new Date().toISOString().slice(0, 10);

  for (const result of results) {
    const key = getSourceKey(result.url);

    if (!stats[key]) {
      stats[key] = {
        url: result.url,
        label: result.label || result.source || 'unknown',
        first_seen: Date.now(),
        last_check: Date.now(),
        total_checks: 0,
        success_count: 0,
        fail_count: 0,
        consecutive_failures: 0,
        total_latency: 0,
        latency_count: 0,
        status: 'active',
        last_success: null,
        last_failure: null,
        daily_stats: {},
      };
    }

    const entry = stats[key];
    entry.total_checks += 1;
    entry.last_check = Date.now();

    if (result.success) {
      entry.success_count += 1;
      entry.consecutive_failures = 0;
      entry.last_success = Date.now();
      if (result.latency != null) {
        entry.total_latency += result.latency;
        entry.latency_count += 1;
      }
    } else {
      entry.fail_count += 1;
      entry.consecutive_failures += 1;
      entry.last_failure = Date.now();
    }

    if (!entry.daily_stats[today]) {
      entry.daily_stats[today] = { checks: 0, success: 0, fail: 0 };
    }
    entry.daily_stats[today].checks += 1;
    if (result.success) entry.daily_stats[today].success += 1;
    else entry.daily_stats[today].fail += 1;

    cleanupDailyStats(entry);
    entry.status = computeSourceStatus(entry);
  }

  await setJSON(env, KV_KEYS.SOURCE_STATS, stats);
  return stats;
}

/**
 * 获取所有源统计
 */
export async function getSourceStats(env) {
  return (await getJSON(env, KV_KEYS.SOURCE_STATS)) || {};
}

/**
 * 获取单个源的统计
 */
export async function getSingleSourceStats(env, sourceUrl) {
  const stats = await getSourceStats(env);
  return stats[getSourceKey(sourceUrl)] || null;
}

/**
 * 获取活跃的源列表（排除已降级的）
 */
export async function getActiveSources(env) {
  const stats = await getSourceStats(env);
  return Object.values(stats)
    .filter((s) => s.status !== 'disabled')
    .map((s) => ({
      url: s.url,
      label: s.label,
      status: s.status,
      success_rate: s.total_checks > 0 ? s.success_count / s.total_checks : null,
      avg_latency: s.latency_count > 0 ? s.total_latency / s.latency_count : null,
      consecutive_failures: s.consecutive_failures,
    }));
}

/**
 * 检查源是否应该被跳过
 */
export async function shouldSkipSource(env, sourceUrl) {
  const stats = await getSingleSourceStats(env, sourceUrl);
  if (!stats) return false; // 新源，不跳过

  return stats.status === 'disabled' || stats.status === 'degraded';
}

/**
 * 获取源质量报告
 */
export async function getSourceQualityReport(env) {
  const stats = await getSourceStats(env);
  const sources = Object.values(stats);

  const report = {
    total_sources: sources.length,
    active: sources.filter((s) => s.status === 'active').length,
    degraded: sources.filter((s) => s.status === 'degraded').length,
    disabled: sources.filter((s) => s.status === 'disabled').length,
    sources: sources
      .map((s) => ({
        url: s.url,
        label: s.label,
        status: s.status,
        success_rate: s.total_checks > 0 ? (s.success_count / s.total_checks * 100).toFixed(1) + '%' : 'N/A',
        avg_latency: s.latency_count > 0 ? Math.round(s.total_latency / s.latency_count) + 'ms' : 'N/A',
        total_checks: s.total_checks,
        consecutive_failures: s.consecutive_failures,
        last_check: s.last_check ? new Date(s.last_check).toISOString() : 'Never',
      }))
      .sort((a, b) => {
        const statusOrder = { active: 0, degraded: 1, disabled: 2 };
        return (statusOrder[a.status] ?? 3) - (statusOrder[b.status] ?? 3);
      }),
  };

  return report;
}

/**
 * 手动标记源状态
 */
export async function setSourceStatus(env, sourceUrl, status) {
  const stats = await getSourceStats(env);
  const key = getSourceKey(sourceUrl);

  if (stats[key]) {
    stats[key].status = status;
    stats[key].manual_override = true;
    stats[key].manual_override_at = Date.now();
    await setJSON(env, KV_KEYS.SOURCE_STATS, stats);
    return stats[key];
  }

  return null;
}

/**
 * 自动发现并评估新源
 */
export async function discoverAndEvaluateSources(env) {
  const configSources = config.SOURCE_LIST || [];
  const existingStats = await getSourceStats(env);
  const knownUrls = new Set(Object.values(existingStats).map((s) => s.url));

  const newSources = configSources.filter((url) => !knownUrls.has(url));

  if (newSources.length > 0) {
    log.info('发现新源', { count: newSources.length, urls: newSources });
  }

  return {
    known_count: knownUrls.size,
    new_sources: newSources.map((url) => ({
      url,
      label: extractSourceLabel(url),
      status: 'new',
    })),
  };
}

function getSourceKey(url) {
  // 使用 URL 的哈希作为 key，避免特殊字符问题
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    const char = url.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `src_${Math.abs(hash).toString(36)}`;
}

function computeSourceStatus(entry) {
  // 如果手动覆盖了，保持手动状态
  if (entry.manual_override && entry.status !== 'active') {
    return entry.status;
  }

  // 连续失败过多
  if (entry.consecutive_failures >= FAILURE_THRESHOLD) {
    return 'disabled';
  }

  // 成功率过低
  if (entry.total_checks >= 10) {
    const successRate = entry.success_count / entry.total_checks;
    if (successRate < DEGRADED_THRESHOLD) {
      return 'degraded';
    }
  }

  return 'active';
}

function cleanupDailyStats(entry) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - SOURCE_TTL_DAYS);
  const cutoffStr = cutoffDate.toISOString().slice(0, 10);

  for (const date of Object.keys(entry.daily_stats)) {
    if (date < cutoffStr) {
      delete entry.daily_stats[date];
    }
  }
}

function extractSourceLabel(url) {
  if (url.includes('iptv-org')) return 'iptv-org';
  if (url.includes('yang-1989')) return 'yang-1989';
  if (/migu|miguvideo/i.test(url)) return 'migu';
  if (url.includes('Jsnzkpg')) return 'Jsnzkpg';
  if (url.includes('mzky')) return 'mzky';
  if (url.includes('suxuang')) return 'suxuang';
  return 'custom';
}
