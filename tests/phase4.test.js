import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { rankSources, pickBestSource } from '../worker/services/router.js';
import { channelId, recommendChannels } from '../worker/services/recommend.js';
import { detectAdvancedViolations, generateAiEpgTags } from '../worker/services/aiAdvanced.js';
import { randomApiKey, sha256Hex } from '../worker/utils/crypto.js';
import { shouldBootstrap } from '../worker/services/bootstrap.js';

describe('phase4', () => {
  const channel = {
    name: 'CCTV1',
    normalized_name: 'CCTV1',
    region: 'CN',
    quality: 'HD',
    category: '新闻',
    sources: [
      { url: 'http://cn.example/1.m3u8', source: 'judy-gotv', status: 'healthy', latency: 80, success_rate: 1 },
      { url: 'http://intl.example/1.m3u8', source: 'iptv-org', status: 'healthy', latency: 200, success_rate: 0.9 },
    ],
  };

  const request = {
    cf: { country: 'CN', colo: 'HKG', asOrganization: 'China Telecom' },
  };

  it('ranks sources by region and ISP', () => {
    const ranked = rankSources(channel, request);
    assert.equal(ranked[0].source, 'judy-gotv');
  });

  it('pickBestSource returns top ranked url', () => {
    const url = pickBestSource(channel, request);
    assert.ok(url.includes('cn.example'));
  });

  it('channelId encodes normalized name', () => {
    assert.equal(channelId(channel), encodeURIComponent('CCTV1'));
  });

  it('detects violations', () => {
    const r = detectAdvancedViolations({ name: '成人频道', sources: [] });
    assert.equal(r.blocked, true);
  });

  it('generates ai epg tags', () => {
    const tags = generateAiEpgTags(channel);
    assert.ok(tags.tags.some((t) => t.startsWith('ai:')));
  });

  it('crypto helpers work', async () => {
    const hash = await sha256Hex('test');
    assert.equal(hash.length, 64);
    assert.ok(randomApiKey().startsWith('iptvx_'));
  });

  it('requests bootstrap when schema version is missing', async () => {
    const env = {
      IPTV_KV: {
        async get(key) {
          if (key === 'channels') return JSON.stringify([{ name: 'CCTV1' }]);
          if (key === 'health') return JSON.stringify({ schema_version: 3 });
          return null;
        },
      },
    };
    assert.equal(await shouldBootstrap(env), true);
  });
});
