import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseM3U, filterInvalidEntries, buildM3U, isBroadcastEntry, isNonChineseEntry } from '../worker/utils/parser.js';

describe('parser', () => {
  const sample = `#EXTM3U
#EXTINF:-1 tvg-name="CCTV1" group-title="央视",CCTV-1 综合
http://example.com/cctv1.m3u8
#EXTINF:-1 group-title="测试",UDP Channel
udp://239.0.0.1:1234
#EXTINF:-1 group-title="广播",中国之声 FM
http://example.com/radio.mp3
#EXTINF:-1,Empty URL Channel

`;

  it('parses EXTINF entries', () => {
    const entries = parseM3U(sample, 'test');
    assert.equal(entries.length, 3);
    assert.equal(entries[0].name, 'CCTV1');
    assert.equal(entries[0].url, 'http://example.com/cctv1.m3u8');
  });

  it('filters udp and empty urls', () => {
    const entries = filterInvalidEntries(parseM3U(sample, 'test'));
    assert.equal(entries.length, 1);
    assert.ok(entries[0].url.startsWith('http'));
  });

  it('detects broadcast entries by metadata', () => {
    assert.equal(
      isBroadcastEntry({
        name: '中国之声 FM',
        group: '广播',
        url: 'http://example.com/live.mp3',
      }),
      true,
    );
    assert.equal(
      isBroadcastEntry({
        name: 'CCTV1',
        group: '央视',
        url: 'http://example.com/cctv1.m3u8',
      }),
      false,
    );
  });

  it('filters non chinese channels for chinese-focused usage', () => {
    assert.equal(
      isNonChineseEntry({
        name: 'CNN International',
        group: 'International',
        url: 'http://example.com/cnn.m3u8',
      }),
      true,
    );
    assert.equal(
      isNonChineseEntry({
        name: 'CCTV NEWS',
        group: '央视',
        url: 'http://example.com/cctv-news.m3u8',
      }),
      false,
    );
  });

  it('builds m3u output', () => {
    const m3u = buildM3U(
      [
        {
          name: 'CCTV1',
          normalized_name: 'CCTV1',
          group: '央视',
          category: '新闻',
          playlist_group: '新闻-央视频道',
          sources: [{ url: 'http://a.com/1.m3u8' }],
        },
      ],
      (ch) => ch.sources[0].url,
    );
    assert.match(m3u, /#EXTM3U/);
    assert.match(m3u, /http:\/\/a\.com\/1\.m3u8/);
    assert.match(m3u, /group-title="新闻-央视频道"/);
  });
});
