import { recordMetric } from '../services/metrics.js';
import { resolveAuth } from '../services/auth.js';

export async function withRequestContext(request, env, handler, executionCtx = null) {
  const start = Date.now();
  const url = new URL(request.url);
  let error = false;

  let auth = null;
  try {
    auth = await resolveAuth(request, env);
  } catch {
    /* ignore */
  }

  try {
    const response = await handler(request, env, { auth, start, executionCtx });
    return response;
  } catch (err) {
    error = true;
    throw err;
  } finally {
    const latencyMs = Date.now() - start;
    await recordMetric(env, {
      path: url.pathname,
      country: request.cf?.country,
      latencyMs,
      error,
    });
  }
}
