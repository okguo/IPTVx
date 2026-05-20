/**
 * 咖啡直播定时爬虫
 * 每 30 分钟爬取一次，更新体育直播源
 * 
 * 使用方式：
 *   node scripts/crawl-kafei-cron.js
 * 
 * 或在 package.json 中添加：
 *   "crawl:kafei": "node scripts/crawl-kafei-cron.js"
 */

import { crawlKafei } from './crawl-kafei.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LOCK_FILE = path.join(__dirname, '.kafei-crawl.lock');
const INTERVAL_MS = 30 * 60 * 1000; // 30 分钟

// 防止重复执行
if (fs.existsSync(LOCK_FILE)) {
  const lockTime = parseInt(fs.readFileSync(LOCK_FILE, 'utf-8'), 10);
  const now = Date.now();
  if (now - lockTime < INTERVAL_MS) {
    console.log('[咖啡直播 Cron] 距离上次爬取时间不足 30 分钟，跳过');
    process.exit(0);
  }
}

// 写入锁
fs.writeFileSync(LOCK_FILE, Date.now().toString(), 'utf-8');

async function main() {
  try {
    console.log(`[咖啡直播 Cron] 开始爬取 (${new Date().toISOString()})`);
    const channels = await crawlKafei();
    console.log(`[咖啡直播 Cron] 完成！共 ${channels.length} 个频道`);
  } catch (err) {
    console.error('[咖啡直播 Cron] 失败:', err.message);
    process.exit(1);
  } finally {
    // 清理锁
    try {
      fs.unlinkSync(LOCK_FILE);
    } catch {}
  }
}

main();
