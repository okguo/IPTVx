import { getJSON, setJSON, KV_KEYS } from '../utils/cache.js';
import config from '../../config/config.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('logo');

/**
 * 频道 Logo 自动补全服务
 * 接入 iptv-org logos 自动补全缺失的频道图标
 */

const LOGO_BASE_URL = 'https://iptv-org.github.io/logos';
const LOGO_CACHE_TTL = 86400 * 7; // 7 天

// 频道名称到 iptv-org logo 文件名的映射
const LOGO_NAME_MAP = {
  // CCTV
  'CCTV1': 'cctv1.png',
  'CCTV2': 'cctv2.png',
  'CCTV3': 'cctv3.png',
  'CCTV4': 'cctv4.png',
  'CCTV5': 'cctv5.png',
  'CCTV5+': 'cctv5plus.png',
  'CCTV6': 'cctv6.png',
  'CCTV7': 'cctv7.png',
  'CCTV8': 'cctv8.png',
  'CCTV9': 'cctv9.png',
  'CCTV10': 'cctv10.png',
  'CCTV11': 'cctv11.png',
  'CCTV12': 'cctv12.png',
  'CCTV13': 'cctv13.png',
  'CCTV14': 'cctv14.png',
  'CCTV15': 'cctv15.png',
  'CCTV16': 'cctv16.png',
  'CCTV17': 'cctv17.png',
  // CGTN
  'CGTN': 'cgtn.png',
  'CGTN法语': 'cgtn-francais.png',
  'CGTN俄语': 'cgtn-russian.png',
  'CGTN西班牙语': 'cgtn-espanol.png',
  'CGTN阿拉伯语': 'cgtn-arabic.png',
  'CGTN纪录': 'cgtn-documentary.png',
  // 卫视
  '湖南卫视': 'hunan.png',
  '浙江卫视': 'zhejiang.png',
  '东方卫视': 'dragon-tv.png',
  '江苏卫视': 'jiangsu.png',
  '北京卫视': 'beijing-tv.png',
  '广东卫视': 'guangdong.png',
  '深圳卫视': 'shenzhen.png',
  '山东卫视': 'shandong.png',
  '天津卫视': 'tianjin.png',
  '湖北卫视': 'hubei.png',
  '安徽卫视': 'anhui.png',
  '重庆卫视': 'chongqing.png',
  '东南卫视': 'southeast.png',
  '广西卫视': 'guangxi.png',
  '贵州卫视': 'guizhou.png',
  '云南卫视': 'yunnan.png',
  '黑龙江卫视': 'heilongjiang.png',
  '吉林卫视': 'jilin.png',
  '辽宁卫视': 'liaoning.png',
  '河北卫视': 'hebei.png',
  '河南卫视': 'henan.png',
  '江西卫视': 'jiangxi.png',
  '陕西卫视': 'shaanxi.png',
  '四川卫视': 'sichuan.png',
  '海南卫视': 'hainan.png',
  '内蒙古卫视': 'neimenggu.png',
  '宁夏卫视': 'ningxia.png',
  '新疆卫视': 'xinjiang.png',
  '西藏卫视': 'xizang.png',
  '青海卫视': 'qinghai.png',
  '甘肃卫视': 'gansu.png',
  '山西卫视': 'shanxi.png',
  // 港澳台
  '凤凰中文': 'phoenixchinese.png',
  '凤凰资讯': 'phoenixinfo.png',
  'TVB翡翠台': 'tvbjade.png',
  'TVB明珠台': 'tvbpearl.png',
  '翡翠台': 'tvbjade.png',
  '明珠台': 'tvbpearl.png',
  'HOY': 'hoy.png',
  'ViuTV': 'viutv.png',
  // 其他
  'CHC家庭影院': 'chc.png',
  '金鹰卡通': 'golden-cartoon.png',
  '卡酷少儿': 'kaku.png',
  '优漫卡通': 'umanimation.png',
  'CN卡通': 'cn-cartoon.png',
};

/**
 * 获取缓存的 Logo 映射
 */
export async function getCachedLogoMap(env) {
  return (await getJSON(env, KV_KEYS.LOGO_CACHE)) || {};
}

/**
 * 查找频道的 Logo
 */
export async function findChannelLogo(channelName, normalized_name = null, env = null) {
  // 优先使用缓存
  if (env) {
    const cache = await getCachedLogoMap(env);
    const lookupName = normalized_name || channelName;
    if (cache[lookupName]) {
      return cache[lookupName];
    }
  }

  // 尝试标准化名称匹配
  const name = normalized_name || normalizeForLogoLookup(channelName);

  // 直接匹配
  if (LOGO_NAME_MAP[name]) {
    return `${LOGO_BASE_URL}/${LOGO_NAME_MAP[name]}`;
  }

  // 模糊匹配
  for (const [key, logo] of Object.entries(LOGO_NAME_MAP)) {
    if (name.includes(key) || key.includes(name)) {
      return `${LOGO_BASE_URL}/${logo}`;
    }
  }

  return null;
}

/**
 * 批量补全频道 Logo
 */
export async function enrichChannelLogos(channels, env = null) {
  const cache = env ? await getCachedLogoMap(env) : {};
  const updates = {};
  let enriched = 0;

  const enrichedChannels = channels.map((ch) => {
    if (ch.logo && !isPlaceholderLogo(ch.logo)) {
      return ch; // 已有有效 logo，跳过
    }

    const lookupName = ch.normalized_name || ch.name;

    // 检查缓存
    if (cache[lookupName]) {
      return { ...ch, logo: cache[lookupName] };
    }

    // 查找 logo
    const logoUrl = LOGO_NAME_MAP[lookupName]
      ? `${LOGO_BASE_URL}/${LOGO_NAME_MAP[lookupName]}`
      : findLogoByFuzzyMatch(lookupName, ch.category);

    if (logoUrl) {
      enriched += 1;
      updates[lookupName] = logoUrl;
      return { ...ch, logo: logoUrl };
    }

    return ch;
  });

  // 更新缓存
  if (env && Object.keys(updates).length > 0) {
    const merged = { ...cache, ...updates };
    await setJSON(env, KV_KEYS.LOGO_CACHE, merged);
    log.info('Logo 缓存已更新', { added: Object.keys(updates).length, total: Object.keys(merged).length });
  }

  return { channels: enrichedChannels, enriched_count: enriched };
}

/**
 * 验证 Logo URL 是否有效（非占位图）
 */
export function isPlaceholderLogo(logoUrl) {
  if (!logoUrl) return true;

  const placeholderPatterns = [
    /placeholder/i,
    /default\.png/i,
    /1x1\.png/i,
    /blank/i,
    /no-logo/i,
    /missing/i,
  ];

  return placeholderPatterns.some((p) => p.test(logoUrl));
}

/**
 * 模糊匹配 Logo
 */
function findLogoByFuzzyMatch(name, category = '') {
  const text = `${name} ${category}`.toLowerCase();

  // CCTV 系列
  const cctvMatch = text.match(/cctv\s*(\d{1,2})\+?/i);
  if (cctvMatch) {
    const num = cctvMatch[1];
    const logoFile = num.length <= 2 ? `cctv${num}.png` : null;
    if (logoFile) return `${LOGO_BASE_URL}/${logoFile}`;
  }

  // CGTN 系列
  if (text.includes('cgtn')) {
    if (text.includes('francais') || text.includes('法语')) return `${LOGO_BASE_URL}/cgtn-francais.png`;
    if (text.includes('russian') || text.includes('俄语')) return `${LOGO_BASE_URL}/cgtn-russian.png`;
    if (text.includes('espanol') || text.includes('西班牙')) return `${LOGO_BASE_URL}/cgtn-espanol.png`;
    if (text.includes('arabic') || text.includes('阿拉伯')) return `${LOGO_BASE_URL}/cgtn-arabic.png`;
    return `${LOGO_BASE_URL}/cgtn.png`;
  }

  // 凤凰卫视
  if (text.includes('凤凰') && text.includes('中文')) return `${LOGO_BASE_URL}/phoenixchinese.png`;
  if (text.includes('凤凰') && text.includes('资讯')) return `${LOGO_BASE_URL}/phoenixinfo.png`;
  if (text.includes('凤凰')) return `${LOGO_BASE_URL}/phoenixchinese.png`;

  // TVB
  if (text.includes('翡翠')) return `${LOGO_BASE_URL}/tvbjade.png`;
  if (text.includes('明珠')) return `${LOGO_BASE_URL}/tvbpearl.png`;

  return null;
}

/**
 * 标准化频道名称用于 Logo 查找
 */
function normalizeForLogoLookup(name) {
  return name
    .replace(/\s*(HD|FHD|4K|UHD|标清|高清|超清)\s*/gi, '')
    .replace(/[^\u4e00-\u9fa5a-zA-Z0-9+]/g, '')
    .trim();
}
