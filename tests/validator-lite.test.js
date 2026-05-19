import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import config from '../config/config.js';
import { filterPlayableChannels } from '../worker/services/validator.js';
import { applyLiteValidation } from '../worker/services/collector.js';

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

  it('keeps channels skipped by lite validation cap', async () => {
    const originalCap = config.PIPELINE.liteValidateMaxChannels;
    const originalTimeout = config.PIPELINE.liteValidateTimeoutMs;
    const originalFetch = globalThis.fetch;

    try {
      config.PIPELINE.liteValidateMaxChannels = 1;
      config.PIPELINE.liteValidateTimeoutMs = 10;

      globalThis.fetch = async (url) => {
        if (String(url).includes('good.example')) {
          return new Response(null, { status: 200 });
        }
        return new Response(null, { status: 503 });
      };

      const channels = [
        {
          name: 'Validated',
          sources: [{ url: 'http://good.example/live.m3u8', status: 'unknown' }],
        },
        {
          name: 'Skipped',
          sources: [{ url: 'http://skipped.example/live.m3u8', status: 'unknown' }],
        },
      ];

      const result = await applyLiteValidation(channels);
      assert.equal(result.channels.length, 2);
      assert.equal(result.meta.validated, 1);
      assert.equal(result.meta.skipped_validation, 1);
      assert.equal(result.meta.failed_validation, 0);
      assert.equal(result.channels[0].name, 'Validated');
      assert.equal(result.channels[1].name, 'Skipped');
    } finally {
      config.PIPELINE.liteValidateMaxChannels = originalCap;
      config.PIPELINE.liteValidateTimeoutMs = originalTimeout;
      globalThis.fetch = originalFetch;
    }
  });
});
