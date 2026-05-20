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
  isLowValueChannel,
  channelPriorityScore,
  processChannelsWithAI,
} from '../worker/services/ai.js';

describe('ai', () => {
  it('normalizes CCTV names', () => {
    assert.equal(normalizeChannel('CCTV-1 HD'), 'CCTV1');
    assert.equal(normalizeChannel('央视1套'), 'CCTV1');
    assert.equal(normalizeChannel('劲爆体育 HD'), '劲爆体育');
  });

  it('normalizes all CCTV channels 1-17', () => {
    assert.equal(normalizeChannel('CCTV-1综合'), 'CCTV1');
    assert.equal(normalizeChannel('CCTV-2财经'), 'CCTV2');
    assert.equal(normalizeChannel('CCTV-3综艺'), 'CCTV3');
    assert.equal(normalizeChannel('CCTV-4中文国际'), 'CCTV4');
    assert.equal(normalizeChannel('CCTV-4国际'), 'CCTV4');
    assert.equal(normalizeChannel('CCTV5+体育赛事'), 'CCTV5+');
    assert.equal(normalizeChannel('CCTV-5体育'), 'CCTV5');
    assert.equal(normalizeChannel('CCTV-6电影'), 'CCTV6');
    assert.equal(normalizeChannel('CCTV-7国防军事'), 'CCTV7');
    assert.equal(normalizeChannel('CCTV-7军事'), 'CCTV7');
    assert.equal(normalizeChannel('CCTV-8电视剧'), 'CCTV8');
    assert.equal(normalizeChannel('CCTV-8K超高清'), 'CCTV8');
    assert.equal(normalizeChannel('CCTV-9纪录'), 'CCTV9');
    assert.equal(normalizeChannel('CCTV-10科教'), 'CCTV10');
    assert.equal(normalizeChannel('CCTV-11戏曲'), 'CCTV11');
    assert.equal(normalizeChannel('CCTV-12社会与法'), 'CCTV12');
    assert.equal(normalizeChannel('CCTV-13新闻'), 'CCTV13');
    assert.equal(normalizeChannel('CCTV-14少儿'), 'CCTV14');
    assert.equal(normalizeChannel('CCTV-15音乐'), 'CCTV15');
    assert.equal(normalizeChannel('CCTV-16'), 'CCTV16');
    assert.equal(normalizeChannel('CCTV-17农业农村'), 'CCTV17');
    assert.equal(normalizeChannel('CCTV-17农业'), 'CCTV17');
    assert.equal(normalizeChannel('央视1'), 'CCTV1');
    assert.equal(normalizeChannel('央视5+'), 'CCTV5+');
    assert.equal(normalizeChannel('中央13'), 'CCTV13');
  });

  it('normalizes CGTN channels', () => {
    assert.equal(normalizeChannel('CGTN西班牙语'), 'CGTN西班牙语');
    assert.equal(normalizeChannel('CGTN French'), 'CGTN法语');
    assert.equal(normalizeChannel('CGTN阿拉伯语'), 'CGTN阿拉伯语');
    assert.equal(normalizeChannel('CGTN Russian'), 'CGTN俄语');
    assert.equal(normalizeChannel('CGTN纪录'), 'CGTN纪录');
    assert.equal(normalizeChannel('CGTN Documentary'), 'CGTN纪录');
    assert.equal(normalizeChannel('CGTN'), 'CGTN');
  });

  it('classifies channels', () => {
    assert.equal(classifyChannel('CCTV5 体育'), '央视频道');
    assert.equal(classifyChannel('凤凰卫视'), '港澳台');
    assert.equal(classifyChannel('湖南卫视', '', { source: 'bitly', url: 'https://example.com/hunan.m3u8' }), '卫视频道');
    assert.equal(classifyChannel('广东新闻', '广东', { source: 'bitly', url: 'https://example.com/gdnews.m3u8' }), '地方频道');
    assert.equal(classifyChannel('广东体育', '🔥[三网3]央卫视直播', { source: 'yang-1989', url: 'http://r.jdshipin.com/LiYdg' }), '地方频道');
    assert.equal(
      classifyChannel('咪咕英超', '体育', { source: 'bitly', url: 'https://migu.example/live.m3u8' }),
      '咪咕体育',
    );
  });

  it('classifies satellite TV channels correctly', () => {
    assert.equal(classifyChannel('湖南卫视'), '卫视频道');
    assert.equal(classifyChannel('浙江卫视'), '卫视频道');
    assert.equal(classifyChannel('东方卫视'), '卫视频道');
    assert.equal(classifyChannel('江苏卫视'), '卫视频道');
    assert.equal(classifyChannel('北京卫视'), '卫视频道');
    assert.equal(classifyChannel('广东卫视'), '卫视频道');
    assert.equal(classifyChannel('深圳卫视'), '卫视频道');
    assert.equal(classifyChannel('山东卫视'), '卫视频道');
    assert.equal(classifyChannel('天津卫视'), '卫视频道');
    assert.equal(classifyChannel('湖北卫视'), '卫视频道');
    assert.equal(classifyChannel('安徽卫视'), '卫视频道');
    assert.equal(classifyChannel('重庆卫视'), '卫视频道');
    assert.equal(classifyChannel('广西卫视'), '卫视频道');
    assert.equal(classifyChannel('贵州卫视'), '卫视频道');
    assert.equal(classifyChannel('云南卫视'), '卫视频道');
    assert.equal(classifyChannel('黑龙江卫视'), '卫视频道');
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
    assert.equal(inferPlaylistGroup({ name: '广东新闻', category: '地方频道' }), '地方频道-华南');
    assert.equal(inferPlaylistGroup({ name: '英超直播', category: '体育' }), '体育-足球');
  });

  it('filters low value special streams and prioritizes tv channels', () => {
    assert.equal(isLowValueChannel({ name: '刘德华专场', group: '电影直播' }), true);
    assert.equal(isLowValueChannel({ name: 'CCTV-6电影', group: '央视频道' }), false);
    assert.ok(
      channelPriorityScore({ name: 'CCTV-1综合', normalized_name: 'CCTV1', category: '央视频道', sources: [{}, {}], region: 'CN' }) >
      channelPriorityScore({ name: '刘德华专场', normalized_name: '刘德华专场', category: '影视', sources: [{}], region: 'INTL' }),
    );
    assert.ok(
      channelPriorityScore({ name: '江苏综艺', normalized_name: '江苏综艺', category: '地方频道', sources: [{}, {}], region: 'CN' }) >
      channelPriorityScore({ name: 'NBA 25', normalized_name: 'NBA25', category: '体育', sources: [{}], region: 'INTL' }),
    );
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

  it('reclassifies merged channels using final name and filters blocked sources again', async () => {
    const channels = await processChannelsWithAI([
      {
        name: '北京卫视4K',
        group: '🔥[三网1]央卫视直播',
        url: 'https://cdn.19891230.eu.org/api/bjws/index.m3u8',
        source: 'yang-1989',
        logo: '',
        tvgId: '北京卫视4K',
      },
      {
        name: 'NBA 25',
        group: '🏀NBA直播',
        url: 'http://czstream.com:826/LouCarey/KYsHfE1YLU/119737',
        source: 'bitly',
        logo: '',
        tvgId: '',
      },
    ], { fast: true });

    assert.equal(channels.length, 1);
    assert.equal(channels[0].name, '北京卫视4K');
    assert.equal(channels[0].category, '卫视频道');
    assert.equal(channels[0].playlist_group, '卫视频道');
  });
});
