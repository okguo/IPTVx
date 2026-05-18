import config from '../../config/config.js';
import { classifyChannel, normalizeChannel, buildChannelTags } from './ai.js';

const LOGO_AD_HINTS = [/ad[_-]?logo/i, /placeholder/i, /default\.png/i, /1x1/i, /blank/i];
const VIOLATION_PATTERNS = [
  /色情|成人|AV\b/i,
  /赌博|博彩/i,
  /法轮|邪教/i,
  /违规|illegal/i,
];

/**
 * OCR Logo 识别（Workers 环境：基于 logo URL 元数据 + 可选 Workers AI）
 * 真实 OCR 需绑定 Cloudflare Workers AI；此处提供启发式 + AI 接口预留
 */
export async function analyzeLogo(env, channel) {
  const logo = channel.logo || '';
  const result = {
    has_logo: Boolean(logo),
    ocr_text: null,
    is_placeholder: false,
    confidence: 0,
  };

  if (!logo) {
    result.is_placeholder = true;
    result.confidence = 0.9;
    return result;
  }

  for (const p of LOGO_AD_HINTS) {
    if (p.test(logo)) {
      result.is_placeholder = true;
      result.confidence = 0.85;
      break;
    }
  }

  // 从 URL 路径推断台标文字（轻量 OCR 替代）
  const pathMatch = logo.match(/\/([^/]+)\.(png|jpg|jpeg|webp)/i);
  if (pathMatch) {
    result.ocr_text = decodeURIComponent(pathMatch[1]).replace(/[-_]/g, ' ');
    result.confidence = 0.6;
  }

  if (env.AI && typeof env.AI.run === 'function') {
    try {
      const response = await env.AI.run('@cf/meta/resnet-50', { image: logo });
      result.ai_analysis = response;
    } catch {
      /* Workers AI 未绑定时忽略 */
    }
  }

  return result;
}

/** 广告台 / 违规源综合检测 */
export function detectAdvancedViolations(channel) {
  const text = `${channel.name} ${channel.group || ''} ${(channel.sources || []).map((s) => s.url).join(' ')}`;
  const flags = [];

  for (const p of config.AD_PATTERNS) {
    if (p.test(text)) flags.push('ad_pattern');
  }
  for (const p of VIOLATION_PATTERNS) {
    if (p.test(text)) flags.push('violation_pattern');
  }

  if ((channel.sources || []).length === 0) flags.push('no_sources');
  if (channel.name?.length > 100) flags.push('abnormal_name');

  return {
    blocked: flags.includes('violation_pattern'),
    suspicious: flags.length > 0,
    flags,
  };
}

/** AI 生成 EPG 分类标签 */
export function generateAiEpgTags(channel) {
  const normalized = normalizeChannel(channel.name);
  const category = classifyChannel(channel.name, channel.group);
  const tags = buildChannelTags({ ...channel, category });

  return {
    normalized_name: normalized,
    category,
    tags: [...tags, `ai:genre:${category}`, `ai:quality:${channel.quality || 'SD'}`],
    epg_id: channel.tvgId || normalized.toLowerCase(),
    generated_at: new Date().toISOString(),
  };
}

/** 批量高级 AI 处理 */
export async function processChannelsAdvanced(env, channels) {
  const output = [];

  for (const ch of channels) {
    const logoAnalysis = await analyzeLogo(env, ch);
    const violation = detectAdvancedViolations(ch);
    const epgTags = generateAiEpgTags(ch);

    let sources = ch.sources || [];
    if (violation.blocked || (violation.suspicious && logoAnalysis.is_placeholder)) {
      sources = sources.map((s) => ({ ...s, status: 'dead', ai_flag: violation.flags.join(',') }));
    }

    output.push({
      ...ch,
      sources: sources.filter((s) => s.status !== 'dead'),
      ai_meta: { logoAnalysis, violation, epgTags },
      tags: [...new Set([...(ch.tags || []), ...epgTags.tags])],
    });
  }

  return output.filter((ch) => ch.sources?.length > 0);
}
