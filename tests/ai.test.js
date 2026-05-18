import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeChannel,
  classifyChannel,
  dedupeChannels,
  cosineSimilarity,
  detectSuspiciousChannel,
} from '../worker/services/ai.js';

describe('ai', () => {
  it('normalizes CCTV names', () => {
    assert.equal(normalizeChannel('CCTV-1 HD'), 'CCTV1');
    assert.equal(normalizeChannel('央视1套'), 'CCTV1');
  });

  it('classifies channels', () => {
    assert.equal(classifyChannel('CCTV5 体育'), '体育');
    assert.equal(classifyChannel('凤凰卫视'), '港澳');
  });

  it('dedupes similar channels', () => {
    const entries = [
      { name: 'CCTV-1 HD', group: '央视', url: 'http://a/1', source: 'a', logo: '', tvgId: '' },
      { name: 'CCTV1综合', group: '央视', url: 'http://b/1', source: 'b', logo: '', tvgId: '' },
    ];
    const channels = dedupeChannels(entries);
    assert.equal(channels.length, 1);
    assert.equal(channels[0].sources.length, 2);
  });

  it('detects suspicious ad channels', () => {
    const result = detectSuspiciousChannel({ name: '购物广告台 24h', sources: [] });
    assert.equal(result.suspicious, true);
  });

  it('computes cosine similarity', () => {
    const sim = cosineSimilarity([1, 0], [1, 0]);
    assert.equal(sim, 1);
  });
});
