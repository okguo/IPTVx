import { getJSON, setJSON, KV_KEYS } from '../utils/cache.js';
import config from '../../config/config.js';

/**
 * 频道测速结果持久化 + 历史趋势
 * 记录每个频道的历史测速数据（成功率、延迟趋势），支持智能源选择
 */

const MAX_HISTORY_DAYS = config.METRICS?.retentionDays || 30;
const MAX_ENTRIES_PER_CHANNEL = 100;

/**
 * 获取测速历史记录
 */
export async function getValidationHistory(env, normalized_name = null) {
  const history = (await getJSON(env, KV_KEYS.VALIDATION_HISTORY)) || {};

  if (normalized_name) {
    return history[normalized_name] || [];
  }

  return history;
}

/**
 * 记录单次测速结果到历史
 */
export async function recordValidationResult(env, channel, sources, timestamp = Date.now()) {
  const history = (await getJSON(env, KV_KEYS.VALIDATION_HISTORY)) || {};
  const key = channel.normalized_name || channel.name;

  if (!history[key]) {
    history[key] = [];
  }

  const entry = {
    timestamp,
    date: new Date(timestamp).toISOString().slice(0, 10),
    sources: sources.map((s) => ({
      url: s.url,
      source: s.source,
      status: s.status,
      latency: s.latency,
      success_rate: s.success_rate,
    })),
    healthy_count: sources.filter((s) => s.status === 'healthy').length,
    unstable_count: sources.filter((s) => s.status === 'unstable').length,
    dead_count: sources.filter((s) => s.status === 'dead').length,
    avg_latency: computeAvgLatency(sources),
  };

  history[key].push(entry);

  // 限制每个频道的历史条目数
  if (history[key].length > MAX_ENTRIES_PER_CHANNEL) {
    history[key] = history[key].slice(-MAX_ENTRIES_PER_CHANNEL);
  }

  // 清理过期的历史记录
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - MAX_HISTORY_DAYS);
  const cutoffStr = cutoffDate.toISOString().slice(0, 10);

  history[key] = history[key].filter((e) => e.date >= cutoffStr);

  await setJSON(env, KV_KEYS.VALIDATION_HISTORY, history);

  return entry;
}

/**
 * 批量记录测速结果
 */
export async function batchRecordValidationResults(env, channels, timestamp = Date.now()) {
  const history = (await getJSON(env, KV_KEYS.VALIDATION_HISTORY)) || {};
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - MAX_HISTORY_DAYS);
  const cutoffStr = cutoffDate.toISOString().slice(0, 10);

  for (const ch of channels) {
    const key = ch.normalized_name || ch.name;
    if (!history[key]) {
      history[key] = [];
    }

    const sources = ch.sources || [];
    const entry = {
      timestamp,
      date: new Date(timestamp).toISOString().slice(0, 10),
      sources: sources.map((s) => ({
        url: s.url,
        source: s.source,
        status: s.status,
        latency: s.latency,
        success_rate: s.success_rate,
      })),
      healthy_count: sources.filter((s) => s.status === 'healthy').length,
      unstable_count: sources.filter((s) => s.status === 'unstable').length,
      dead_count: sources.filter((s) => s.status === 'dead').length,
      avg_latency: computeAvgLatency(sources),
    };

    history[key].push(entry);

    // 限制条目数并清理过期数据
    if (history[key].length > MAX_ENTRIES_PER_CHANNEL) {
      history[key] = history[key].slice(-MAX_ENTRIES_PER_CHANNEL);
    }
    history[key] = history[key].filter((e) => e.date >= cutoffStr);
  }

  await setJSON(env, KV_KEYS.VALIDATION_HISTORY, history);
}

/**
 * 获取频道的历史趋势（成功率、延迟）
 */
export async function getChannelTrend(env, normalized_name, days = 7) {
  const history = await getValidationHistory(env, normalized_name);
  if (!history || history.length === 0) {
    return { trend: [], summary: null };
  }

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  const cutoffTs = cutoffDate.getTime();

  const recent = history.filter((e) => e.timestamp >= cutoffTs);

  if (recent.length === 0) {
    return { trend: [], summary: null };
  }

  // 按日期聚合
  const dailyMap = new Map();
  for (const entry of recent) {
    if (!dailyMap.has(entry.date)) {
      dailyMap.set(entry.date, {
        date: entry.date,
        healthy_rate: 0,
        avg_latency: 0,
        checks: 0,
      });
    }
    const day = dailyMap.get(entry.date);
    const total = entry.healthy_count + entry.unstable_count + entry.dead_count;
    const healthyRate = total > 0 ? (entry.healthy_count / total) * 100 : 0;

    day.healthy_rate = (day.healthy_rate * day.checks + healthyRate) / (day.checks + 1);
    day.avg_latency = (day.avg_latency * day.checks + (entry.avg_latency || 0)) / (day.checks + 1);
    day.checks += 1;
  }

  const trend = [...dailyMap.values()].sort((a, b) => a.date.localeCompare(b.date));

  // 计算摘要
  const summary = {
    avg_healthy_rate: trend.reduce((sum, d) => sum + d.healthy_rate, 0) / trend.length,
    avg_latency: trend.reduce((sum, d) => sum + d.avg_latency, 0) / trend.length,
    total_checks: recent.length,
    trend_direction: computeTrendDirection(trend),
  };

  return { trend, summary };
}

/**
 * 获取源级别的历史成功率
 */
export async function getSourceHistoryScore(env, url, days = 14) {
  const history = (await getJSON(env, KV_KEYS.VALIDATION_HISTORY)) || {};
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  const cutoffTs = cutoffDate.getTime();

  let totalChecks = 0;
  let successChecks = 0;
  let totalLatency = 0;

  for (const entries of Object.values(history)) {
    for (const entry of entries) {
      if (entry.timestamp < cutoffTs) continue;
      for (const src of entry.sources) {
        if (src.url === url) {
          totalChecks += 1;
          if (src.status === 'healthy' || src.status === 'unstable') {
            successChecks += 1;
          }
          if (src.latency != null) {
            totalLatency += src.latency;
          }
        }
      }
    }
  }

  if (totalChecks === 0) return null;

  return {
    success_rate: successChecks / totalChecks,
    avg_latency: totalLatency / totalChecks,
    total_checks: totalChecks,
  };
}

/**
 * 获取全局源统计（哪些源整体表现好）
 */
export async function getGlobalSourceStats(env, days = 14) {
  const history = (await getJSON(env, KV_KEYS.VALIDATION_HISTORY)) || {};
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  const cutoffTs = cutoffDate.getTime();

  const sourceMap = new Map();

  for (const entries of Object.values(history)) {
    for (const entry of entries) {
      if (entry.timestamp < cutoffTs) continue;
      for (const src of entry.sources) {
        if (!sourceMap.has(src.source)) {
          sourceMap.set(src.source, {
            source: src.source,
            total_checks: 0,
            healthy: 0,
            unstable: 0,
            dead: 0,
            total_latency: 0,
            latency_count: 0,
          });
        }
        const stat = sourceMap.get(src.source);
        stat.total_checks += 1;
        if (src.status === 'healthy') stat.healthy += 1;
        else if (src.status === 'unstable') stat.unstable += 1;
        else if (src.status === 'dead') stat.dead += 1;
        if (src.latency != null) {
          stat.total_latency += src.latency;
          stat.latency_count += 1;
        }
      }
    }
  }

  const stats = [...sourceMap.values()].map((s) => ({
    ...s,
    success_rate: s.total_checks > 0 ? (s.healthy + s.unstable) / s.total_checks : 0,
    avg_latency: s.latency_count > 0 ? s.total_latency / s.latency_count : null,
  }));

  stats.sort((a, b) => b.success_rate - a.success_rate);
  return stats;
}

function computeAvgLatency(sources) {
  const valid = sources.filter((s) => s.latency != null);
  if (valid.length === 0) return null;
  return valid.reduce((sum, s) => sum + s.latency, 0) / valid.length;
}

function computeTrendDirection(trend) {
  if (trend.length < 2) return 'stable';
  const recent = trend.slice(-3);
  const older = trend.slice(0, Math.max(1, trend.length - 3));

  const recentAvg = recent.reduce((sum, d) => sum + d.healthy_rate, 0) / recent.length;
  const olderAvg = older.reduce((sum, d) => sum + d.healthy_rate, 0) / older.length;

  const diff = recentAvg - olderAvg;
  if (diff > 5) return 'improving';
  if (diff < -5) return 'declining';
  return 'stable';
}
