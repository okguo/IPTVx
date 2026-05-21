import config from '../../config/config.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('ai-llm');

/**
 * AI LLM 模式接入
 * 使用 Cloudflare Workers AI 或外部 LLM API 进行智能频道分类和名称标准化
 */

/**
 * 使用 LLM 进行频道名称标准化
 */
export async function normalizeChannelWithLLM(channelName, options = {}) {
  const aiMode = config.AI?.mode || 'rule';

  if (aiMode !== 'llm') {
    return null; // 非 LLM 模式，返回 null 让调用方回退到规则引擎
  }

  const endpoint = options.endpoint || config.AI.llmEndpoint;
  if (!endpoint) {
    log.warn('LLM endpoint 未配置');
    return null;
  }

  const prompt = `You are an IPTV channel name normalizer. Normalize the following channel name to its standard form.

Rules:
- CCTV channels should be normalized to format: CCTV1, CCTV2, ..., CCTV17, CCTV5+
- Satellite TV channels should keep their full name: 湖南卫视, 浙江卫视, etc.
- CGTN channels: CGTN, CGTN法语, CGTN俄语, CGTN西班牙语, CGTN阿拉伯语, CGTN纪录
- HK/Macau/TW channels: 凤凰中文, TVB翡翠台, TVB明珠台, etc.
- Remove quality suffixes (HD, FHD, 4K, UHD, 高清, etc.)
- Remove extra spaces and special characters

Channel name: "${channelName}"

Return ONLY the normalized name, nothing else.`;

  try {
    const response = await callLLM(endpoint, prompt, {
      max_tokens: 50,
      temperature: 0.1,
    });

    const normalized = response?.trim()?.toUpperCase() || null;
    if (normalized && normalized !== 'UNKNOWN') {
      return normalized;
    }
  } catch (err) {
    log.warn('LLM 标准化失败', { error: String(err), channelName });
  }

  return null;
}

/**
 * 使用 LLM 进行频道分类
 */
export async function classifyChannelWithLLM(channelName, channelGroup = '', source = '') {
  const aiMode = config.AI?.mode || 'rule';

  if (aiMode !== 'llm') {
    return null;
  }

  const endpoint = config.AI.llmEndpoint;
  if (!endpoint) {
    return null;
  }

  const categories = [
    '央视频道', '卫视频道', '港澳台', '地方频道', '体育', '影视',
    '新闻', '少儿动漫', '纪实人文', '综艺娱乐', '其他',
  ];

  const prompt = `You are an IPTV channel classifier. Classify the following channel into one of these categories:

Categories: ${categories.join(', ')}

Channel name: "${channelName}"
Group: "${channelGroup}"
Source: "${source}"

Return ONLY the category name, nothing else.`;

  try {
    const response = await callLLM(endpoint, prompt, {
      max_tokens: 20,
      temperature: 0.1,
    });

    const category = response?.trim();
    if (categories.includes(category)) {
      return category;
    }
  } catch (err) {
    log.warn('LLM 分类失败', { error: String(err), channelName });
  }

  return null;
}

/**
 * 使用 Cloudflare Workers AI 进行分类（本地模型）
 */
export async function classifyChannelWithWorkersAI(env, channelName, channelGroup = '') {
  if (!env.AI) {
    return null;
  }

  try {
    // 使用轻量级文本分类模型
    const response = await env.AI.run('@cf/huggingface/distilbert-base-uncased-finetuned-sst-2-english', {
      text: `${channelName} ${channelGroup}`,
    });

    // 这里只是示例，实际需要根据模型输出映射到分类
    return null;
  } catch (err) {
    log.warn('Workers AI 分类失败', { error: String(err), channelName });
    return null;
  }
}

/**
 * 批量处理频道（使用 LLM 增强）
 */
export async function batchProcessWithLLM(env, channels, options = {}) {
  const batchSize = options.batchSize || 5;
  const processed = [];

  for (let i = 0; i < channels.length; i += batchSize) {
    const batch = channels.slice(i, i + batchSize);

    const results = await Promise.all(
      batch.map(async (ch) => {
        const llmName = await normalizeChannelWithLLM(ch.name);
        const llmCategory = await classifyChannelWithLLM(ch.name, ch.group, ch.source);

        return {
          ...ch,
          llm_normalized_name: llmName || ch.normalized_name,
          llm_category: llmCategory || ch.category,
          llm_confidence: llmName || llmCategory ? 0.85 : 0,
        };
      }),
    );

    processed.push(...results);

    // 避免速率限制
    if (i + batchSize < channels.length) {
      await sleep(1000);
    }
  }

  return processed;
}

/**
 * 调用 LLM API
 */
async function callLLM(endpoint, prompt, options = {}) {
  const body = {
    messages: [
      { role: 'system', content: 'You are a helpful IPTV channel assistant.' },
      { role: 'user', content: prompt },
    ],
    max_tokens: options.max_tokens || 100,
    temperature: options.temperature ?? 0.1,
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.AI.llmApiKey || ''}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(`LLM API error: ${response.status}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 混合模式：先尝试 LLM，失败时回退到规则引擎
 */
export async function hybridNormalizeChannel(channelName, aiModule) {
  // 先尝试 LLM
  const llmResult = await normalizeChannelWithLLM(channelName);
  if (llmResult) {
    return { name: llmResult, method: 'llm', confidence: 0.9 };
  }

  // 回退到规则引擎
  const ruleResult = aiModule.normalizeChannel(channelName);
  return { name: ruleResult, method: 'rule', confidence: 0.7 };
}

export async function hybridClassifyChannel(channelName, group, source, aiModule) {
  const llmResult = await classifyChannelWithLLM(channelName, group, source);
  if (llmResult) {
    return { category: llmResult, method: 'llm', confidence: 0.85 };
  }

  const ruleResult = aiModule.classifyChannel(channelName, group, { source, url: '' });
  return { category: ruleResult, method: 'rule', confidence: 0.7 };
}
