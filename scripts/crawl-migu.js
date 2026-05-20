/**
 * 咪咕体育爬虫
 * 爬取 https://www.miguvideo.com/p/schedule/ 的直播内容
 * 频道名称格式：赛事类型 主队 vs 客队
 * 
 * 使用方式：
 *   node scripts/crawl-migu.js
 * 
 * 输出：scripts/migu_channels.json / scripts/migu_channels.m3u
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OUTPUT_FILE = path.join(__dirname, 'migu_channels.json');

// 咪咕赛事 ID 映射（从 JS 代码中提取）
const COMPETITION_IDS = [
  { name: 'CBA', id: 2221401 },
  { name: '中超', id: 1 },
  { name: '亚冠', id: 3 },
  { name: '西甲', id: 4 },
  { name: '英超', id: 5 },
  { name: '德甲', id: 6 },
  { name: '意甲', id: 7 },
  { name: '欧冠', id: 8 },
  { name: '法甲', id: 9 },
  { name: '欧联', id: 11 },
];

// 咪咕 API 基础 URL（从 JS 代码分析得出）
const MIGU_API_BASE = 'https://webapi.miguvideo.com/gateway/web-sports-client/sports/pc';

/**
 * 获取日期字符串（YYYY-MM-DD）
 */
function getDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 构建频道名称：赛事类型 主队 vs 客队
 */
function buildChannelName(match) {
  const league = match.competitionName || match.leagueName || '';
  const home = match.homeTeamName || match.homeTeam || '';
  const away = match.awayTeamName || match.awayTeam || '';
  
  if (home && away) {
    return `${league} ${home} vs ${away}`;
  }
  return match.title || match.name || '未知赛事';
}

/**
 * 爬取咪咕赛程 API
 */
async function fetchMiguSchedule(competitionId, date) {
  // 尝试多个可能的 API 端点
  const urls = [
    `${MIGU_API_BASE}/schedule/live/list?competitionId=${competitionId}&date=${date}`,
    `${MIGU_API_BASE}/schedule/list?competitionId=${competitionId}&date=${date}&pageNo=1&pageSize=50`,
    `https://api.miguvideo.com/mgs/liveinfo/v3/live/list?competitionId=${competitionId}&date=${date}`,
  ];
  
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://www.miguvideo.com/',
          'Origin': 'https://www.miguvideo.com',
        },
      });
      
      if (res.ok) {
        const json = await res.json();
        if (json && (json.data || json.body)) {
          return json.data || json.body;
        }
      }
    } catch (e) {
      // 继续尝试下一个 URL
    }
  }
  
  return null;
}

/**
 * 生成 M3U 格式
 */
function toM3U(channels) {
  let m3u = '#EXTM3U\n';
  channels.forEach((ch) => {
    const logo = ch.logo ? ` tvg-logo="${ch.logo}"` : '';
    m3u += `#EXTINF:-1${logo} group-title="${ch.category}",${ch.displayName}\n`;
    m3u += `${ch.url}\n`;
  });
  return m3u;
}

/**
 * 爬取咪咕体育源
 */
async function crawlMigu() {
  console.log('[咪咕体育] 开始爬取...');
  
  const channels = [];
  const today = getDateString();
  const tomorrow = getDateString(new Date(Date.now() + 86400000));
  const dates = [today, tomorrow];
  
  // 遍历所有赛事
  for (const comp of COMPETITION_IDS) {
    console.log(`[咪咕体育] 正在爬取 ${comp.name}...`);
    
    for (const date of dates) {
      try {
        const data = await fetchMiguSchedule(comp.id, date);
        
        if (!data) continue;
        
        // 尝试从不同数据结构中提取比赛列表
        let matches = [];
        if (Array.isArray(data)) {
          matches = data;
        } else if (data.matchList) {
          matches = data.matchList;
        } else if (data.matches) {
          matches = data.matches;
        } else if (data.items) {
          matches = data.items;
        }
        
        for (const match of matches) {
          // 只保留有直播流的比赛
          if (!match.streamUrl && !match.playUrl && !match.videoUrl) continue;
          
          const displayName = buildChannelName(match);
          const streamUrl = match.streamUrl || match.playUrl || match.videoUrl || '';
          
          channels.push({
            name: match.title || match.name || '',
            displayName,
            url: streamUrl,
            category: `咪咕体育-${comp.name}`,
            logo: match.logo || match.cover || '',
            league: comp.name,
            homeTeam: match.homeTeamName || match.homeTeam || '',
            awayTeam: match.awayTeamName || match.awayTeam || '',
            matchTime: match.startTime || match.matchTime || '',
          });
        }
      } catch (e) {
        console.log(`[咪咕体育] ${comp.name} (${date}) 爬取失败: ${e.message}`);
      }
    }
  }
  
  console.log(`[咪咕体育] 有效频道: ${channels.length} 个`);
  
  if (channels.length === 0) {
    console.log('[咪咕体育] 未找到有效直播源，可能需要登录或 API 已变更');
    console.log('[咪咕体育] 提示：咪咕视频的 API 可能需要认证，建议手动提供源');
    return [];
  }
  
  // 输出 JSON
  const output = {
    updated_at: new Date().toISOString(),
    source: 'https://www.miguvideo.com/p/schedule/',
    total: channels.length,
    channels,
  };
  
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), 'utf-8');
  console.log(`[咪咕体育] 已保存到 ${OUTPUT_FILE}`);
  
  // 同时输出 M3U 格式
  const m3uFile = path.join(__dirname, 'migu_channels.m3u');
  fs.writeFileSync(m3uFile, toM3U(channels), 'utf-8');
  console.log(`[咪咕体育] M3U 已保存到 ${m3uFile}`);
  
  // 打印前 10 个频道
  console.log('\n[咪咕体育] 前 10 个频道:');
  channels.slice(0, 10).forEach((ch, i) => {
    console.log(`  ${i + 1}. [${ch.category}] ${ch.displayName}`);
    if (ch.matchTime) console.log(`     时间: ${ch.matchTime}`);
    console.log(`     URL: ${ch.url.slice(0, 80)}...`);
  });
  
  return channels;
}

// 主函数
async function main() {
  try {
    const channels = await crawlMigu();
    console.log(`\n[咪咕体育] 完成！共 ${channels.length} 个频道`);
  } catch (err) {
    process.exit(1);
  }
}

main();

export { crawlMigu, COMPETITION_IDS };
