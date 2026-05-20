/**
 * 咖啡直播爬虫（改进版）
 * 频道名称格式：赛事类型 主队 vs 客队（主播名）
 * 例如：NBA 骑士 vs 尼克斯（中文解说44）
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const KAFEI_API = 'https://www.kafeizhibo.com/api/v1/archor';
const OUTPUT_FILE = path.join(__dirname, 'kafei_channels.json');

// 分类映射
const CATEGORY_MAP = {
  0: '体育-综合',
  1: '体育-足球',
  2: '体育-篮球',
  3: '体育-综合',
};

/**
 * 提取频道名称，格式：赛事类型 主队 vs 客队（主播名）
 */
function extractChannelName(archor) {
  // title 格式示例：
  // - "NBA 骑士 vs 尼克斯"
  // - "美公开赛 奥兰多城 vs 亚特兰大联"
  // - "CCTV5"（纯频道名）
  const title = (archor.title || '').trim();
  const archorName = (archor.name || '').trim();
  
  // 如果标题是纯频道名（如 CCTV5），直接使用主播名
  if (!title || /^[A-Za-z0-9]+$/.test(title)) {
    return archorName || `主播${archor.room_id}`;
  }
  
  // 如果主播名不是纯数字，附加在括号中
  if (archorName && !/^\d+$/.test(archorName)) {
    return `${title}（${archorName}）`;
  }
  
  // 否则只使用标题
  return title;
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
 * 爬取咖啡直播源
 */
async function crawlKafei() {
  console.log('[咖啡直播] 开始爬取...');
  
  try {
    const res = await fetch(KAFEI_API, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });
    
    if (!res.ok) {
      throw new Error(`API 请求失败: ${res.status} ${res.statusText}`);
    }
    
    const json = await res.json();
    
    if (json.code !== 200) {
      throw new Error(`API 返回错误: ${json.message}`);
    }
    
    const archors = json.data || [];
    console.log(`[咖啡直播] 获取到 ${archors.length} 个主播`);
    
    // 过滤出有直播流的频道
    const channels = archors
      .filter((a) => a.stream_url && (a.status === 'live' || a.status === 'online'))
      .map((a) => {
        const displayName = extractChannelName(a);
        const category = CATEGORY_MAP[a.category] || '体育-综合';
        
        return {
          name: a.name || '',
          displayName,
          url: a.stream_url,
          category,
          logo: a.avatar ? `https://www.kafeizhibo.com${a.avatar}` : '',
          league: a.league_name || '',
          title: a.title || '',
          heat: a.heat || 0,
          homeTeam: a.match_info?.home_team || '',
          awayTeam: a.match_info?.away_team || '',
        };
      });
    
    console.log(`[咖啡直播] 有效频道: ${channels.length} 个`);
    
    // 按热度排序
    channels.sort((a, b) => b.heat - a.heat);
    
    // 输出 JSON
    const output = {
      updated_at: new Date().toISOString(),
      source: 'https://www.kafeizhibo.com/pc/live',
      total: channels.length,
      channels,
    };
    
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), 'utf-8');
    console.log(`[咖啡直播] 已保存到 ${OUTPUT_FILE}`);
    
    // 同时输出 M3U 格式
    const m3uFile = path.join(__dirname, 'kafei_channels.m3u');
    fs.writeFileSync(m3uFile, toM3U(channels), 'utf-8');
    console.log(`[咖啡直播] M3U 已保存到 ${m3uFile}`);
    
    // 打印前 10 个频道
    console.log('\n[咖啡直播] 前 10 个频道:');
    channels.slice(0, 10).forEach((ch, i) => {
      console.log(`  ${i + 1}. [${ch.category}] ${ch.displayName} (${ch.heat}热度)`);
      if (ch.league) console.log(`     联赛: ${ch.league}`);
      console.log(`     URL: ${ch.url}`);
    });
    
    return channels;
  } catch (err) {
    console.error('[咖啡直播] 爬取失败:', err.message);
    throw err;
  }
}

// 主函数
async function main() {
  try {
    const channels = await crawlKafei();
    console.log(`\n[咖啡直播] 完成！共 ${channels.length} 个频道`);
  } catch (err) {
    process.exit(1);
  }
}

main();

export { crawlKafei, CATEGORY_MAP };
