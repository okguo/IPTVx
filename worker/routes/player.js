/** Web 播放端：HLS.js / DPlayer / ArtPlayer */
export async function handlePlayerPage(request) {
  const url = new URL(request.url);
  const channel = url.searchParams.get('channel') || '';
  const player = url.searchParams.get('player') || 'artplayer';

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>IPTVx Player</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/dplayer@1.27.1/dist/DPlayer.min.css" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #0f172a; color: #e2e8f0; font-family: system-ui, sans-serif; }
    header { padding: 16px 24px; background: #1e293b; display: flex; gap: 12px; flex-wrap: wrap; align-items: center; }
    header h1 { font-size: 1.2rem; color: #38bdf8; margin-right: auto; }
    input, select, button {
      background: #334155; border: 1px solid #475569; color: #e2e8f0;
      padding: 8px 12px; border-radius: 6px; font-size: 14px;
    }
    button { background: #38bdf8; color: #0f172a; border: none; cursor: pointer; font-weight: 600; }
    button:hover { background: #7dd3fc; }
    #player-wrap { width: 100%; max-width: 1200px; margin: 24px auto; aspect-ratio: 16/9; background: #000; }
    #dplayer, #artplayer { width: 100%; height: 100%; min-height: 400px; }
    #status { padding: 12px 24px; font-size: 13px; color: #94a3b8; }
    .error { color: #f87171; }
  </style>
</head>
<body>
  <header>
    <h1>IPTVx Player</h1>
    <input id="channel" placeholder="频道 ID (如 CCTV1)" value="${escapeAttr(channel)}" />
    <select id="playerType">
      <option value="artplayer" ${player === 'artplayer' ? 'selected' : ''}>ArtPlayer</option>
      <option value="dplayer" ${player === 'dplayer' ? 'selected' : ''}>DPlayer</option>
      <option value="hlsjs" ${player === 'hlsjs' ? 'selected' : ''}>HLS.js</option>
    </select>
    <input id="apiKey" placeholder="API Key (可选)" />
    <button id="playBtn">播放</button>
    <button id="fallbackBtn">切换备用源</button>
  </header>
  <div id="status">就绪 — 输入频道 ID 后点击播放</div>
  <div id="player-wrap">
    <div id="dplayer" style="display:none"></div>
    <video id="hls-video" controls style="display:none;width:100%;height:100%"></video>
    <div id="artplayer" style="display:none"></div>
  </div>

  <script src="https://cdn.jsdelivr.net/npm/hls.js@1.5.7/dist/hls.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/dplayer@1.27.1/dist/DPlayer.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/artplayer@5.1.7/dist/artplayer.js"></script>
  <script>
    let fallbackIndex = 0;
    let currentChannel = '';
    let dp = null, art = null, hls = null;

    const status = document.getElementById('status');
    const setStatus = (msg, err) => {
      status.textContent = msg;
      status.className = err ? 'error' : '';
    };

    function headers() {
      const key = document.getElementById('apiKey').value;
      return key ? { 'X-API-Key': key } : {};
    }

    async function resolveStream(ch, fb = 0) {
      const r = await fetch(
        '/api/stream/' + encodeURIComponent(ch) + '?format=json&fallback=' + fb,
        { headers: headers() }
      );
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    }

    function destroyPlayers() {
      if (dp) { dp.destroy(); dp = null; }
      if (art) { art.destroy(); art = null; }
      if (hls) { hls.destroy(); hls = null; }
      document.getElementById('dplayer').style.display = 'none';
      document.getElementById('hls-video').style.display = 'none';
      document.getElementById('artplayer').style.display = 'none';
    }

    async function play(fb = 0) {
      const ch = document.getElementById('channel').value.trim();
      const type = document.getElementById('playerType').value;
      if (!ch) { setStatus('请输入频道 ID', true); return; }

      currentChannel = ch;
      fallbackIndex = fb;
      setStatus('正在解析流地址…');
      destroyPlayers();

      try {
        const data = await resolveStream(ch, fb);
        const streamUrl = data.url;
        setStatus('播放: ' + data.channel + ' | 源 #' + data.index + ' | ' + (data.status || ''));

        if (type === 'dplayer') {
          document.getElementById('dplayer').style.display = 'block';
          dp = new DPlayer({
            container: document.getElementById('dplayer'),
            video: { url: streamUrl, type: 'auto' },
          });
          dp.on('error', () => tryFallback());
        } else if (type === 'hlsjs') {
          const video = document.getElementById('hls-video');
          video.style.display = 'block';
          if (Hls.isSupported()) {
            hls = new Hls();
            hls.loadSource(streamUrl);
            hls.attachMedia(video);
            hls.on(Hls.Events.ERROR, () => tryFallback());
          } else {
            video.src = streamUrl;
          }
          video.play();
        } else {
          document.getElementById('artplayer').style.display = 'block';
          art = new Artplayer({
            container: '#artplayer',
            url: streamUrl,
            autoplay: true,
            fullscreen: true,
            setting: true,
          });
        }
      } catch (e) {
        setStatus('播放失败: ' + e.message, true);
      }
    }

    async function tryFallback() {
      fallbackIndex++;
      setStatus('主源失败，尝试备用源 #' + fallbackIndex + '…');
      await play(fallbackIndex);
    }

    document.getElementById('playBtn').onclick = () => play(0);
    document.getElementById('fallbackBtn').onclick = () => tryFallback();

    if ('${escapeAttr(channel)}') play(0);
  </script>
</body>
</html>`;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

function escapeAttr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
