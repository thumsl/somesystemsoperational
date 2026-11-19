import { INDEXNOW_KEY, PUBLIC_URL, USER_AGENT } from './config.js';

const queue = new Set();
let timer = null;

async function flush() {
  timer = null;
  const urlList = [...queue];
  queue.clear();
  try {
    const res = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8', 'user-agent': USER_AGENT },
      body: JSON.stringify({ host: new URL(PUBLIC_URL).host, key: INDEXNOW_KEY, urlList }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) console.warn(`[indexnow] HTTP ${res.status} for ${urlList.length} urls`);
  } catch (err) {
    console.warn(`[indexnow] ${err?.message || err}`);
  }
}

export function changed(...paths) {
  if (!INDEXNOW_KEY || !PUBLIC_URL) return;
  for (const path of paths) queue.add(PUBLIC_URL + path);
  timer ??= setTimeout(flush, 10 * 60_000).unref();
}
