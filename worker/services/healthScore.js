import config from '../../config/config.js';

/**
 * 频道健康评分体系
 * 综合历史成功率、平均延迟、源数量等维度给出 0-100 的健康分
 */

/**
 * 计算单个频道的健康评分 (0-100)
 */
export function computeChannelHealthScore(channel) {
  if (!channel || !channel.sources || channel.sources.length === 0) {
    return 0;
  }

  const sources = channel.sources;
  let score = 0;

  // 1. 源数量得分 (0-20)
  const sourceCount = sources.length;
  const sourceScore = Math.min(20, sourceCount * 5);
  score += sourceScore;

  // 2. 健康源比例得分 (0-30)
  const healthyCount = sources.filter((s) => s.status === 'healthy').length;
  const unstableCount = sources.filter((s) => s.status === 'unstable').length;
  const healthyRatio = sourceCount > 0 ? (healthyCount + unstableCount * 0.5) / sourceCount : 0;
  score += Math.round(healthyRatio * 30);

  // 3. 延迟得分 (0-20)
  const validLatencies = sources
    .filter((s) => s.latency != null && s.status !== 'dead')
    .map((s) => s.latency);

  if (validLatencies.length > 0) {
    const avgLatency = validLatencies.reduce((a, b) => a + b, 0) / validLatencies.length;
    const minLatency = Math.min(...validLatencies);
    // 使用最佳延迟来评分（因为用户会选择最佳源）
    const latencyScore = Math.max(0, 20 - Math.floor(minLatency / 200));
    score += latencyScore;
  } else {
    // 没有延迟数据，给中等分数
    score += 10;
  }

  // 4. 成功率得分 (0-20)
  const avgSuccessRate = sources.reduce((sum, s) => sum + (s.success_rate ?? 0), 0) / sourceCount;
  score += Math.round(avgSuccessRate * 20);

  // 5. 最近更新得分 (0-10)
  const recentChecks = sources.filter((s) => s.last_check != null);
  if (recentChecks.length > 0) {
    const lastCheck = Math.max(...recentChecks.map((s) => s.last_check));
    const hoursSinceCheck = (Date.now() - lastCheck) / (1000 * 60 * 60);
    if (hoursSinceCheck < 1) score += 10;
    else if (hoursSinceCheck < 6) score += 8;
    else if (hoursSinceCheck < 24) score += 5;
    else if (hoursSinceCheck < 72) score += 2;
  }

  return Math.min(100, Math.max(0, score));
}

/**
 * 计算源级别的健康评分
 */
export function computeSourceHealthScore(source) {
  if (!source) return 0;

  let score = 0;

  // 状态得分 (0-40)
  const statusScores = { healthy: 40, unstable: 20, unknown: 10, dead: 0 };
  score += statusScores[source.status] ?? 10;

  // 成功率得分 (0-30)
  score += Math.round((source.success_rate ?? 0) * 30);

  // 延迟得分 (0-20)
  if (source.latency != null) {
    score += Math.max(0, 20 - Math.floor(source.latency / 200));
  } else {
    score += 10;
  }

  // 最近更新得分 (0-10)
  if (source.last_check != null) {
    const hoursSinceCheck = (Date.now() - source.last_check) / (1000 * 60 * 60);
    if (hoursSinceCheck < 1) score += 10;
    else if (hoursSinceCheck < 6) score += 8;
    else if (hoursSinceCheck < 24) score += 5;
    else score += 2;
  }

  return Math.min(100, Math.max(0, score));
}

/**
 * 获取健康等级标签
 */
export function getHealthLevel(score) {
  if (score >= 80) return { level: 'excellent', label: '优秀', color: '#22c55e' };
  if (score >= 60) return { level: 'good', label: '良好', color: '#84cc16' };
  if (score >= 40) return { level: 'fair', label: '一般', color: '#eab308' };
  if (score >= 20) return { level: 'poor', label: '较差', color: '#f97316' };
  return { level: 'critical', label: '不可用', color: '#ef4444' };
}

/**
 * 批量计算频道健康评分
 */
export function computeBatchHealthScores(channels) {
  return channels.map((ch) => ({
    ...ch,
    health_score: computeChannelHealthScore(ch),
    health_level: getHealthLevel(computeChannelHealthScore(ch)),
  }));
}

/**
 * 获取健康评分分布统计
 */
export function getHealthScoreDistribution(channels) {
  const scores = channels.map((ch) => computeChannelHealthScore(ch));

  const distribution = {
    excellent: scores.filter((s) => s >= 80).length,
    good: scores.filter((s) => s >= 60 && s < 80).length,
    fair: scores.filter((s) => s >= 40 && s < 60).length,
    poor: scores.filter((s) => s >= 20 && s < 40).length,
    critical: scores.filter((s) => s < 20).length,
  };

  const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;

  return {
    distribution,
    avg_score: avgScore,
    total_channels: scores.length,
  };
}
