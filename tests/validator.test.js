import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { transitionHealth, summarizeHealth } from '../worker/services/validator.js';

describe('validator', () => {
  it('transitions to dead after max failures', () => {
    let state = { failures: 0, success_rate: 1, status: 'healthy' };
    for (let i = 0; i < 3; i++) {
      state = transitionHealth(state, { status: 'dead', latency: 0, success_rate: 0 });
    }
    assert.equal(state.status, 'dead');
    assert.ok(state.failures >= 3);
  });

  it('recovers from unstable to healthy', () => {
    const state = transitionHealth(
      { failures: 1, success_rate: 0.5, status: 'unstable' },
      { status: 'healthy', latency: 100, success_rate: 1 },
    );
    assert.equal(state.status, 'healthy');
  });

  it('summarizes health counts', () => {
    const summary = summarizeHealth([
      {
        sources: [
          { status: 'healthy' },
          { status: 'dead' },
        ],
      },
    ]);
    assert.equal(summary.healthy, 1);
    assert.equal(summary.dead, 1);
    assert.equal(summary.channels, 1);
  });
});
