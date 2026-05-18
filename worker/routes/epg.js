import { generateEPG } from '../services/epg.js';

const EPG_HEADERS = {
  'Content-Type': 'application/xml; charset=utf-8',
  'Cache-Control': 'public, max-age=600',
};

export async function handleEPG(request, env) {
  const epg = await generateEPG(env);
  return new Response(epg || '<?xml version="1.0"?><tv></tv>', { headers: EPG_HEADERS });
}
