import config from '../../config/config.js';

export async function fetchWithTimeout(url, options = {}) {
  const timeout = options.timeout ?? config.FETCH_TIMEOUT_MS;
  const retries = options.retries ?? config.FETCH_RETRIES;
  const init = { ...options.init, signal: AbortSignal.timeout(timeout) };
  delete options.timeout;
  delete options.retries;
  delete options.init;

  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, init);
      return res;
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 200 * (attempt + 1)));
      }
    }
  }
  throw lastError;
}

export async function fetchText(url, options = {}) {
  const res = await fetchWithTimeout(url, options);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  return res.text();
}
