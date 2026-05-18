import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseM3U, filterInvalidEntries, buildM3U } from '../worker/utils/parser.js';

describe('parser', () => {
  const sample = `#EXTM3U
#EXTINF:-1 tvg-name="CCTV1" group-title="央视",CCTV-1 综合
http://example.com/cctv1.m3u8
#EXTINF:-1 group-title="测试",UDP Channel
udp://239.0.0.1:1234
#EXTINF:-1,Empty URL Channel

`;

  it('parses EXTINF entries', () => {
    const entries = parseM3U(sample, 'test');
    assert.equal(entries.length, 2);
    assert.equal(entries[0].name, 'CCTV1');
    assert.equal(entries[0].url, 'http://example.com/cctv1.m3u8');
  });

  it('filters udp and empty urls', () => {
    const entries = filterInvalidEntries(parseM3U(sample, 'test'));
    assert.equal(entries.length, 1);
    assert.ok(entries[0].url.startsWith('http'));
  });

  it('builds m3u output', () => {
    const m3u = buildM3U(
      [
        {
          name: 'CCTV1',
          normalized_name: 'CCTV1',
          group: '央视',
          category: '新闻',
          sources: [{ url: 'http://a.com/1.m3u8' }],
        },
      ],
      (ch) => ch.sources[0].url,
    );
    assert.match(m3u, /#EXTM3U/);
    assert.match(m3u, /http:\/\/a\.com\/1\.m3u8/);
  });
});
