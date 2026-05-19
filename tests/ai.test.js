import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeChannel,
  classifyChannel,
  dedupeChannels,
  dedupeChannelsFast,
  cosineSimilarity,
  detectSuspiciousChannel,
  inferPlaylistGroup,
} from '../worker/services/ai.js';

describe('ai', () => {
  it('normalizes CCTV names', () => {
    assert.equal(normalizeChannel('CCTV-1 HD'), 'CCTV1');
    assert.equal(normalizeChannel('央视1套'), 'CCTV1');
    assert.equal(normalizeChannel('劲爆体育 HD'), '劲爆体育');
  });

  it('classifies channels', () => {
    assert.equal(classifyChannel('CCTV5 体育'), '央视频道');
    assert.equal(classifyChannel('凤凰卫视'), '港澳台');
    assert.equal(
      classifyChannel('咪咕英超', '体育', { source: 'bitly', url: 'https://migu.example/live.m3u8' }),
      '咪咕体育',
    );
  });

  it('preserves migu sports playlist subgroup', () => {
    const channels = dedupeChannelsFast([
      {
        name: '咪咕英超',
        group: '咪咕体育-足球',
        playlist_group: '咪咕体育-足球',
        url: 'https://migu.example/football.m3u8',
        source: 'migu',
        logo: '',
        tvgId: '',
      },
    ]);
    assert.equal(channels[0].category, '咪咕体育');
    assert.equal(channels[0].playlist_group, '咪咕体育-足球');
  });

  it('derives chinese-friendly playlist groups', () => {
    assert.equal(inferPlaylistGroup({ name: 'CCTV1', category: '央视频道' }), '央视频道');
    assert.equal(inferPlaylistGroup({ name: '湖南卫视', category: '卫视频道' }), '卫视频道');
    assert.equal(inferPlaylistGroup({ name: '广东新闻', category: '地方频道' }), '地方频道');
    assert.equal(inferPlaylistGroup({ name: '英超直播', category: '体育' }), '体育-足球');
  });

  it('fast dedupe merges by normalized name', () => {
    const entries = Array.from({ length: 100 }, (_, i) => ({
      name: i % 10 === 0 ? 'CCTV-1 HD' : `CH${i}`,
      group: '测试',
      url: `http://x/${i}`,
      source: 't',
      logo: '',
      tvgId: '',
    }));
    const channels = dedupeChannelsFast(entries);
    assert.ok(channels.length < entries.length);
  });

  it('fast dedupe merges same channel across different groups', () => {
    const channels = dedupeChannelsFast([
      { name: 'CCTV-1 HD', group: '央视频道', url: 'http://a/1', source: 'a', logo: '', tvgId: '' },
      { name: 'CCTV1综合', group: '新闻', url: 'http://b/1', source: 'b', logo: '', tvgId: '' },
    ]);
    assert.equal(channels.length, 1);
    assert.equal(channels[0].sources.length, 2);
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
