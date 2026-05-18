import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { filterPlayableChannels } from '../worker/services/validator.js';

describe('validator lite', () => {
  it('filterPlayableChannels keeps only playable', () => {
    const channels = [
      { name: 'A', sources: [{ url: 'http://a', status: 'dead' }] },
      { name: 'B', sources: [{ url: 'http://b', status: 'healthy' }] },
      { name: 'C', sources: [{ url: 'http://c', status: 'unknown' }] },
    ];
    const out = filterPlayableChannels(channels);
    assert.equal(out.length, 1);
    assert.equal(out[0].name, 'B');
  });
});
