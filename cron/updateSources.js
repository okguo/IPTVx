import { runFullPipeline } from '../worker/services/collector.js';
import { createLogger } from '../worker/utils/logger.js';

const log = createLogger('cron');

/**
 * Cron 定时任务：采集 → AI 标准化 → 测速 → 更新 KV（playlist / channels / health / epg）
 */
export async function updateAllSources(env) {
  log.info('开始定时更新');
  const result = await runFullPipeline(env);
  log.info('定时更新完成', result.health);
  return result;
}
