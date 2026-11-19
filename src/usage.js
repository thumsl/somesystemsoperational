import { createHash, randomBytes } from 'node:crypto';
import { PUBLIC_URL, UMAMI_API_WEBSITE_ID, UMAMI_SCRIPT } from './config.js';

const BROWSER = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36';
const PER_MINUTE = 120;
const enabled = Boolean(UMAMI_SCRIPT && UMAMI_API_WEBSITE_ID && PUBLIC_URL);
const endpoint = enabled ? new URL('/api/send', UMAMI_SCRIPT).href : '';
const hostname = enabled ? new URL(PUBLIC_URL).host : '';
const salt = randomBytes(16);
let sent = 0;
if (enabled) setInterval(() => (sent = 0), 60_000).unref();

export function client(agent) {
  if (agent.startsWith('Mozilla/')) return { userAgent: agent };
  return { browser: agent.split('/', 1)[0].trim().toLowerCase().slice(0, 30) || 'unknown', os: '', device: '' };
}

export function apiHit(req, path, ip) {
  if (!enabled || sent++ >= PER_MINUTE) return;
  const payload = {
    website: UMAMI_API_WEBSITE_ID,
    hostname,
    url: path,
    referrer: req.headers.referer,
    id: createHash('sha256').update(salt).update(String(ip)).digest('hex').slice(0, 32),
    ...client(String(req.headers['user-agent'] || '')),
  };
  fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': BROWSER },
    body: JSON.stringify({ type: 'event', payload }),
    signal: AbortSignal.timeout(5_000),
  }).then((res) => res.body?.cancel(), () => {});
}
