import config from '../../config/config.js';
import { getJSON, setJSON, KV_KEYS } from '../utils/cache.js';
import { parseM3U, filterInvalidEntries } from '../utils/parser.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('source-discovery');

/**
 * 新增直播源自动发现
 * 定期扫描 GitHub 上的 IPTV 仓库，自动发现新源并评估质量
 */

// 已知的高质量 IPTV GitHub 仓库
const KNOWN_REPOSITORIES = [
  {
    owner: 'iptv-org',
    repo: 'iptv',
    branches: ['master'],
    paths: ['streams/cn.m3u', 'streams/hk.m3u', 'streams/tw.m3u'],
  },
  {
    owner: 'YanG-1989',
    repo: 'm3u',
    branches: ['main'],
    paths: ['ATV.m3u', 'Gather.m3u'],
  },
  {
    owner: 'suxuang',
    repo: 'myIPTV',
    branches: ['main'],
    paths: ['ipv4.m3u', 'ipv6.m3u'],
  },
  {
    owner: 'kimwang1978',
    repo: 'collect-tv-txt',
    branches: ['main'],
    paths: ['merged.m3u', 'output.m3u'],
  },
  {
    owner: 'fw172',
    repo: 'm3u',
    branches: ['master'],
    paths: ['cctv.m3u', 'weishi.m3u'],
  },
];

// GitHub API 基础 URL
const GITHUB_API_BASE = 'https://api.github.com';
const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com';

/**
 * 扫描已知仓库发现新源
 */
export async function discoverSources(env) {
  const existingSources = new Set(config.SOURCE_LIST || []);
  const discovered = [];

  for (const repo of KNOWN_REPOSITORIES) {
    try {
      const sources = await scanRepository(repo);
      for (const source of sources) {
        if (!existingSources.has(source.url) && !isDuplicate(discovered, source.url)) {
          discovered.push({
            ...source,
            discovered_at: Date.now(),
            repository: `${repo.owner}/${repo.repo}`,
          });
        }
      }
    } catch (err) {
      log.warn(`仓库扫描失败: ${repo.owner}/${repo.repo}`, { error: String(err) });
    }
  }

  // 保存发现结果
  const history = (await getJSON(env, KV_KEYS.SOURCE_DISCOVERY)) || { sources: [], scans: [] };
  history.sources = [...(history.sources || []), ...discovered].slice(-100); // 保留最近 100 条
  history.scans = [
    ...(history.scans || []).filter((s) => s.scanned_at > Date.now() - 7 * 24 * 60 * 60 * 1000),
    {
      scanned_at: Date.now(),
      discovered_count: discovered.length,
      repositories_scanned: KNOWN_REPOSITORIES.length,
    },
  ].slice(-50);

  await setJSON(env, KV_KEYS.SOURCE_DISCOVERY, history);

  return {
    discovered,
    total_known: existingSources.size,
    repositories_scanned: KNOWN_REPOSITORIES.length,
  };
}

/**
 * 评估新发现源的质量
 */
export async function evaluateNewSource(env, sourceUrl) {
  const start = Date.now();

  try {
    const response = await fetch(sourceUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'IPTVx-SourceDiscovery/1.0',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return {
        url: sourceUrl,
        reachable: false,
        status_code: response.status,
        score: 0,
        evaluated_at: Date.now(),
      };
    }

    const content = await response.text();
    const fetchTime = Date.now() - start;

    // 解析 M3U 内容
    const entries = parseM3U(content, 'discovery');
    const validEntries = filterInvalidEntries(entries);

    // 计算质量分数
    let score = 0;

    // 可达性 (0-30)
    score += 30;

    // 响应时间 (0-20)
    score += Math.max(0, 20 - Math.floor(fetchTime / 100));

    // 有效频道数量 (0-30)
    const channelCount = validEntries.length;
    if (channelCount > 50) score += 30;
    else if (channelCount > 20) score += 25;
    else if (channelCount > 10) score += 20;
    else if (channelCount > 5) score += 10;
    else score += 5;

    // 内容新鲜度 (0-20) - 检查是否有 #EXTM3U 头
    if (content.includes('#EXTM3U')) score += 10;
    if (content.includes('tvg-')) score += 10;

    return {
      url: sourceUrl,
      reachable: true,
      status_code: response.status,
      content_size: content.length,
      channel_count: channelCount,
      valid_channel_count: validEntries.length,
      fetch_time_ms: fetchTime,
      score,
      evaluated_at: Date.now(),
    };
  } catch (err) {
    return {
      url: sourceUrl,
      reachable: false,
      error: String(err),
      score: 0,
      evaluated_at: Date.now(),
    };
  }
}

/**
 * 获取源发现历史
 */
export async function getSourceDiscoveryHistory(env) {
  return (await getJSON(env, KV_KEYS.SOURCE_DISCOVERY)) || { sources: [], scans: [] };
}

/**
 * 批量评估新发现的源
 */
export async function batchEvaluateSources(env) {
  const history = await getSourceDiscoveryHistory(env);
  const unevaluated = (history.sources || []).filter(
    (s) => !s.evaluated_at || s.evaluated_at < Date.now() - 24 * 60 * 60 * 1000,
  );

  const results = [];
  for (const source of unevaluated.slice(0, 10)) { // 每次最多评估 10 个
    const result = await evaluateNewSource(env, source.url);
    results.push(result);
  }

  return results;
}

/**
 * 扫描单个 GitHub 仓库
 */
async function scanRepository(repo) {
  const sources = [];

  for (const branch of repo.branches) {
    for (const filePath of repo.paths) {
      const url = `${GITHUB_RAW_BASE}/${repo.owner}/${repo.repo}/${branch}/${filePath}`;
      sources.push({
        url,
        path: filePath,
        branch,
      });
    }
  }

  return sources;
}

function isDuplicate(sources, url) {
  return sources.some((s) => s.url === url);
}
