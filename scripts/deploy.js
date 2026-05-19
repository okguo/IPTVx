import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: true,
    });
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`));
    });
  });
}

async function triggerBootstrap() {
  const wranglerVars = await readWranglerVars();
  const baseUrl = process.env.IPTVX_BASE_URL || wranglerVars.IPTVX_BASE_URL;
  const apiKey = process.env.ADMIN_API_KEY || wranglerVars.ADMIN_API_KEY;

  if (!baseUrl || !apiKey) {
    console.log('[deploy] 未提供 IPTVX_BASE_URL 或 ADMIN_API_KEY，跳过显式 Cron 触发。');
    console.log('[deploy] 首次访问 /health 或 /iptv.m3u 时，Worker 仍会自动后台预热数据。');
    return;
  }

  const url = `${baseUrl.replace(/\/+$/, '')}/api/admin/cron/trigger?sync=1`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'X-API-Key': apiKey },
  });

  if (!response.ok) {
    throw new Error(`bootstrap trigger failed: HTTP ${response.status}`);
  }

  console.log(`[deploy] 已触发后台采集: ${url}`);
}

async function readWranglerVars() {
  try {
    const text = await readFile(new URL('../wrangler.toml', import.meta.url), 'utf8');
    const match = text.match(/\[vars\]([\s\S]*?)(?:\n\[|$)/);
    if (!match) return {};

    const vars = {};
    for (const line of match[1].split(/\r?\n/)) {
      const kv = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"([^"]*)"\s*$/);
      if (kv) vars[kv[1]] = kv[2];
    }
    return vars;
  } catch {
    return {};
  }
}

await run('npx', ['wrangler', 'deploy']);
await triggerBootstrap();
