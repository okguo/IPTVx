/**
 * GeoIP + ASN 智能路由映射表
 * Phase 1: 静态配置（省+ASN→源偏好）
 * Phase 2: 动态热力图（历史延迟聚合）
 *
 * 键格式: "CN-省份代码-ASN号" 或 "CN-*-ASN号"（全国兜底）
 * 省份代码使用 ISO 3166-2:CN（如 Guangdong, Beijing, Shanghai）
 */

// 中国主要省份代码
const PROVINCES = {
  'Guangdong': 'GD', 'Beijing': 'BJ', 'Shanghai': 'SH', 'Tianjin': 'TJ',
  'Hebei': 'HE', 'Shanxi': 'SX', 'Neimenggu': 'NM', 'Liaoning': 'LN',
  'Jilin': 'JL', 'Heilongjiang': 'HL', 'Jiangsu': 'JS', 'Zhejiang': 'ZJ',
  'Anhui': 'AH', 'Fujian': 'FJ', 'Jiangxi': 'JX', 'Shandong': 'SD',
  'Henan': 'HA', 'Hubei': 'HB', 'Hunan': 'HN', 'Guangxi': 'GX',
  'Hainan': 'HI', 'Chongqing': 'CQ', 'Sichuan': 'SC', 'Guizhou': 'GZ',
  'Yunnan': 'YN', 'Xizang': 'XZ', 'Shaanxi': 'SN', 'Gansu': 'GS',
  'Qinghai': 'QH', 'Ningxia': 'NX', 'Xinjiang': 'XJ',
};

// 中国主要运营商 ASN 号
const ASN_TELECOM = [4134, 4812, 4809, 133638];  // 电信
const ASN_UNICOM = [4837, 4808, 17621, 17622];   // 联通
const ASN_MOBILE = [9808, 56040, 56041, 56042];   // 移动
const ASN_CERNET = [4538, 7497];                  // 教育网
const ASN_CSTNET = [7497];                        // 科技网

// 源标签到源 URL 的映射
const SOURCE_LABELS = {
  'judy': 'Jsnzkpg',
  'kimentanm': 'Kimentanm',
  'yang': 'YanG',
  'mzky': 'mzky',
  'suxuang': 'suxuang',
  'migu': '咪咕',
};

/**
 * GeoIP+ASN → 源偏好映射表
 * 每个条目包含：优先源列表（按顺序）+ 权重
 */
export const GEO_ASN_SOURCE_PREFERENCE = {
  // ========== 广东省（电信/联通/移动用户量大，源质量高） ==========
  'CN-GD-4134': { priority: ['judy', 'mzky', 'suxuang'], weight: 100, region: '华南' },
  'CN-GD-4837': { priority: ['judy', 'mzky', 'suxuang'], weight: 100, region: '华南' },
  'CN-GD-9808': { priority: ['judy', 'mzky', 'migu'], weight: 100, region: '华南' },

  // ========== 北京（首都，源质量好） ==========
  'CN-BJ-4134': { priority: ['judy', 'kimentanm', 'mzky'], weight: 100, region: '华北' },
  'CN-BJ-4837': { priority: ['judy', 'kimentanm', 'mzky'], weight: 100, region: '华北' },
  'CN-BJ-9808': { priority: ['judy', 'mzky', 'migu'], weight: 100, region: '华北' },

  // ========== 上海 ==========
  'CN-SH-4134': { priority: ['judy', 'suxuang', 'mzky'], weight: 100, region: '华东' },
  'CN-SH-4837': { priority: ['judy', 'suxuang', 'mzky'], weight: 100, region: '华东' },
  'CN-SH-9808': { priority: ['judy', 'migu', 'suxuang'], weight: 100, region: '华东' },

  // ========== 江苏/浙江/华东地区 ==========
  'CN-JS-4134': { priority: ['judy', 'suxuang', 'mzky'], weight: 95, region: '华东' },
  'CN-JS-4837': { priority: ['judy', 'suxuang', 'mzky'], weight: 95, region: '华东' },
  'CN-JS-9808': { priority: ['judy', 'mzky', 'suxuang'], weight: 95, region: '华东' },
  'CN-ZJ-4134': { priority: ['judy', 'suxuang', 'mzky'], weight: 95, region: '华东' },
  'CN-ZJ-4837': { priority: ['judy', 'suxuang', 'mzky'], weight: 95, region: '华东' },
  'CN-ZJ-9808': { priority: ['judy', 'mzky', 'suxuang'], weight: 95, region: '华东' },
  'CN-AH-4134': { priority: ['judy', 'mzky', 'suxuang'], weight: 90, region: '华东' },
  'CN-AH-4837': { priority: ['judy', 'mzky', 'suxuang'], weight: 90, region: '华东' },
  'CN-AH-9808': { priority: ['judy', 'mzky', 'suxuang'], weight: 90, region: '华东' },
  'CN-FJ-4134': { priority: ['judy', 'mzky', 'suxuang'], weight: 90, region: '华东' },
  'CN-FJ-4837': { priority: ['judy', 'mzky', 'suxuang'], weight: 90, region: '华东' },
  'CN-FJ-9808': { priority: ['judy', 'mzky', 'suxuang'], weight: 90, region: '华东' },
  'CN-SD-4134': { priority: ['judy', 'mzky', 'suxuang'], weight: 90, region: '华东' },
  'CN-SD-4837': { priority: ['judy', 'mzky', 'suxuang'], weight: 90, region: '华东' },
  'CN-SD-9808': { priority: ['judy', 'mzky', 'suxuang'], weight: 90, region: '华东' },

  // ========== 华南其他省份 ==========
  'CN-GX-4134': { priority: ['judy', 'mzky', 'suxuang'], weight: 85, region: '华南' },
  'CN-GX-4837': { priority: ['judy', 'mzky', 'suxuang'], weight: 85, region: '华南' },
  'CN-GX-9808': { priority: ['judy', 'mzky', 'migu'], weight: 85, region: '华南' },
  'CN-HI-4134': { priority: ['judy', 'mzky', 'suxuang'], weight: 85, region: '华南' },
  'CN-HI-4837': { priority: ['judy', 'mzky', 'suxuang'], weight: 85, region: '华南' },
  'CN-HI-9808': { priority: ['judy', 'mzky', 'migu'], weight: 85, region: '华南' },

  // ========== 华中地区 ==========
  'CN-HB-4134': { priority: ['judy', 'mzky', 'suxuang'], weight: 85, region: '华中' },
  'CN-HB-4837': { priority: ['judy', 'mzky', 'suxuang'], weight: 85, region: '华中' },
  'CN-HB-9808': { priority: ['judy', 'mzky', 'migu'], weight: 85, region: '华中' },
  'CN-HN-4134': { priority: ['judy', 'mzky', 'suxuang'], weight: 85, region: '华中' },
  'CN-HN-4837': { priority: ['judy', 'mzky', 'suxuang'], weight: 85, region: '华中' },
  'CN-HN-9808': { priority: ['judy', 'mzky', 'migu'], weight: 85, region: '华中' },
  'CN-HA-4134': { priority: ['judy', 'mzky', 'suxuang'], weight: 85, region: '华中' },
  'CN-HA-4837': { priority: ['judy', 'mzky', 'suxuang'], weight: 85, region: '华中' },
  'CN-HA-9808': { priority: ['judy', 'mzky', 'migu'], weight: 85, region: '华中' },

  // ========== 西南地区 ==========
  'CN-SC-4134': { priority: ['judy', 'mzky', 'suxuang'], weight: 80, region: '西南' },
  'CN-SC-4837': { priority: ['judy', 'mzky', 'suxuang'], weight: 80, region: '西南' },
  'CN-SC-9808': { priority: ['judy', 'mzky', 'migu'], weight: 80, region: '西南' },
  'CN-CQ-4134': { priority: ['judy', 'mzky', 'suxuang'], weight: 80, region: '西南' },
  'CN-CQ-4837': { priority: ['judy', 'mzky', 'suxuang'], weight: 80, region: '西南' },
  'CN-CQ-9808': { priority: ['judy', 'mzky', 'migu'], weight: 80, region: '西南' },
  'CN-GZ-4134': { priority: ['judy', 'mzky', 'suxuang'], weight: 75, region: '西南' },
  'CN-GZ-4837': { priority: ['judy', 'mzky', 'suxuang'], weight: 75, region: '西南' },
  'CN-GZ-9808': { priority: ['judy', 'mzky', 'migu'], weight: 75, region: '西南' },
  'CN-YN-4134': { priority: ['judy', 'mzky', 'suxuang'], weight: 75, region: '西南' },
  'CN-YN-4837': { priority: ['judy', 'mzky', 'suxuang'], weight: 75, region: '西南' },
  'CN-YN-9808': { priority: ['judy', 'mzky', 'migu'], weight: 75, region: '西南' },

  // ========== 华北其他省份 ==========
  'CN-TJ-4134': { priority: ['judy', 'kimentanm', 'mzky'], weight: 90, region: '华北' },
  'CN-TJ-4837': { priority: ['judy', 'kimentanm', 'mzky'], weight: 90, region: '华北' },
  'CN-TJ-9808': { priority: ['judy', 'mzky', 'migu'], weight: 90, region: '华北' },
  'CN-HE-4134': { priority: ['judy', 'kimentanm', 'mzky'], weight: 85, region: '华北' },
  'CN-HE-4837': { priority: ['judy', 'kimentanm', 'mzky'], weight: 85, region: '华北' },
  'CN-HE-9808': { priority: ['judy', 'mzky', 'migu'], weight: 85, region: '华北' },
  'CN-SX-4134': { priority: ['judy', 'kimentanm', 'mzky'], weight: 80, region: '华北' },
  'CN-SX-4837': { priority: ['judy', 'kimentanm', 'mzky'], weight: 80, region: '华北' },
  'CN-SX-9808': { priority: ['judy', 'mzky', 'migu'], weight: 80, region: '华北' },
  'CN-NM-4134': { priority: ['judy', 'mzky', 'suxuang'], weight: 75, region: '华北' },
  'CN-NM-4837': { priority: ['judy', 'mzky', 'suxuang'], weight: 75, region: '华北' },
  'CN-NM-9808': { priority: ['judy', 'mzky', 'migu'], weight: 75, region: '华北' },

  // ========== 东北地区 ==========
  'CN-LN-4134': { priority: ['judy', 'mzky', 'suxuang'], weight: 80, region: '东北' },
  'CN-LN-4837': { priority: ['judy', 'mzky', 'suxuang'], weight: 80, region: '东北' },
  'CN-LN-9808': { priority: ['judy', 'mzky', 'migu'], weight: 80, region: '东北' },
  'CN-JL-4134': { priority: ['judy', 'mzky', 'suxuang'], weight: 75, region: '东北' },
  'CN-JL-4837': { priority: ['judy', 'mzky', 'suxuang'], weight: 75, region: '东北' },
  'CN-JL-9808': { priority: ['judy', 'mzky', 'migu'], weight: 75, region: '东北' },
  'CN-HL-4134': { priority: ['judy', 'mzky', 'suxuang'], weight: 70, region: '东北' },
  'CN-HL-4837': { priority: ['judy', 'mzky', 'suxuang'], weight: 70, region: '东北' },
  'CN-HL-9808': { priority: ['judy', 'mzky', 'migu'], weight: 70, region: '东北' },

  // ========== 西北地区 ==========
  'CN-SN-4134': { priority: ['judy', 'mzky', 'suxuang'], weight: 70, region: '西北' },
  'CN-SN-4837': { priority: ['judy', 'mzky', 'suxuang'], weight: 70, region: '西北' },
  'CN-SN-9808': { priority: ['judy', 'mzky', 'migu'], weight: 70, region: '西北' },
  'CN-GS-4134': { priority: ['judy', 'mzky', 'suxuang'], weight: 65, region: '西北' },
  'CN-GS-4837': { priority: ['judy', 'mzky', 'suxuang'], weight: 65, region: '西北' },
  'CN-GS-9808': { priority: ['judy', 'mzky', 'migu'], weight: 65, region: '西北' },
  'CN-QH-4134': { priority: ['judy', 'mzky', 'suxuang'], weight: 60, region: '西北' },
  'CN-QH-4837': { priority: ['judy', 'mzky', 'suxuang'], weight: 60, region: '西北' },
  'CN-QH-9808': { priority: ['judy', 'mzky', 'migu'], weight: 60, region: '西北' },
  'CN-NX-4134': { priority: ['judy', 'mzky', 'suxuang'], weight: 60, region: '西北' },
  'CN-NX-4837': { priority: ['judy', 'mzky', 'suxuang'], weight: 60, region: '西北' },
  'CN-NX-9808': { priority: ['judy', 'mzky', 'migu'], weight: 60, region: '西北' },
  'CN-XJ-4134': { priority: ['judy', 'mzky', 'suxuang'], weight: 55, region: '西北' },
  'CN-XJ-4837': { priority: ['judy', 'mzky', 'suxuang'], weight: 55, region: '西北' },
  'CN-XJ-9808': { priority: ['judy', 'mzky', 'migu'], weight: 55, region: '西北' },

  // ========== 全国兜底（按运营商） ==========
  'CN-*-4134': { priority: ['judy', 'mzky', 'suxuang', 'kimentanm'], weight: 70, region: '全国' },
  'CN-*-4837': { priority: ['judy', 'mzky', 'suxuang', 'kimentanm'], weight: 70, region: '全国' },
  'CN-*-9808': { priority: ['judy', 'mzky', 'migu', 'suxuang'], weight: 70, region: '全国' },

  // ========== 港澳台 ==========
  'CN-HK-*': { priority: ['judy', 'kimentanm', 'suxuang'], weight: 80, region: '港澳台' },
  'CN-MO-*': { priority: ['judy', 'kimentanm', 'suxuang'], weight: 80, region: '港澳台' },
  'CN-TW-*': { priority: ['judy', 'kimentanm', 'suxuang'], weight: 75, region: '港澳台' },

  // ========== 海外 ==========
  'XX-*-': { priority: ['judy', 'kimentanm', 'yang', 'suxuang'], weight: 50, region: '海外' },
};

/**
 * 获取用户的 GeoIP+ASN 键
 */
export function getGeoASNKey(cf) {
  const country = cf?.country || 'XX';
  const region = cf?.region || '*';
  const asn = cf?.asn || '*';
  return `${country}-${region}-${asn}`;
}

/**
 * 查找用户的 GeoIP+ASN 偏好
 */
export function getGeoASNPreference(cf) {
  const key = getGeoASNKey(cf);

  // 精确匹配：CN-Province-ASN
  if (GEO_ASN_SOURCE_PREFERENCE[key]) {
    return GEO_ASN_SOURCE_PREFERENCE[key];
  }

  // 省份兜底：CN-Province-*（无 ASN 信息）
  const provinceKey = `${cf?.country || 'XX'}-${cf?.region || '*'}-*`;
  if (GEO_ASN_SOURCE_PREFERENCE[provinceKey]) {
    return GEO_ASN_SOURCE_PREFERENCE[provinceKey];
  }

  // ASN 兜底：CN-*-ASN（全国同运营商）
  const asnKey = `CN-*-${cf?.asn || '*'}`;
  if (GEO_ASN_SOURCE_PREFERENCE[asnKey]) {
    return GEO_ASN_SOURCE_PREFERENCE[asnKey];
  }

  // 默认兜底
  return GEO_ASN_SOURCE_PREFERENCE['XX-*-'] || { priority: ['judy', 'kimentanm'], weight: 50, region: '默认' };
}

/**
 * 判断源是否匹配用户的 GeoIP+ASN 偏好
 */
export function sourceMatchesPreference(sourceUrl, sourceLabel, preference) {
  if (!preference?.priority) return false;

  const url = (sourceUrl || '').toLowerCase();
  const label = (sourceLabel || '').toLowerCase();

  for (const pref of preference.priority) {
    if (url.includes(pref) || label.includes(pref)) {
      return true;
    }
  }
  return false;
}

/**
 * 获取源在偏好列表中的排名（越小越优先）
 */
export function getSourcePreferenceRank(sourceUrl, sourceLabel, preference) {
  if (!preference?.priority) return 999;

  const url = (sourceUrl || '').toLowerCase();
  const label = (sourceLabel || '').toLowerCase();

  for (let i = 0; i < preference.priority.length; i++) {
    if (url.includes(preference.priority[i]) || label.includes(preference.priority[i])) {
      return i;
    }
  }
  return 999;
}

/**
 * 获取用户所在地区（中文）
 */
export function getUserRegion(cf) {
  const pref = getGeoASNPreference(cf);
  const country = cf?.country || 'XX';
  const region = cf?.region || 'Unknown';
  const asn = cf?.asn;

  const regionName = PROVINCES[region] || region;
  let ispName = '未知运营商';
  if (ASN_TELECOM.includes(asn)) ispName = '电信';
  else if (ASN_UNICOM.includes(asn)) ispName = '联通';
  else if (ASN_MOBILE.includes(asn)) ispName = '移动';
  else if (ASN_CERNET.includes(asn)) ispName = '教育网';

  return {
    country,
    region: regionName,
    province: region,
    asn,
    isp: ispName,
    fullRegion: pref.region || '未知',
  };
}
