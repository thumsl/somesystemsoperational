import { FETCH_TIMEOUT_MS, MAX_BODY_BYTES, USER_AGENT } from './config.js';

/** GET a URL as text, with a timeout and a size cap. Throws on anything but a 2xx. */
export async function getText(url, { encoding = 'utf-8', accept = '*/*' } = {}) {
  const res = await fetch(url, {
    headers: { 'user-agent': USER_AGENT, accept },
    redirect: 'follow',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    await res.body?.cancel().catch(() => {});
    throw new Error(`HTTP ${res.status}`);
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of res.body) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new Error('response too large');
    chunks.push(chunk);
  }
  const bytes = Buffer.concat(chunks);
  if (encoding === 'utf-16') {
    const bigEndian = bytes[0] === 0xfe && bytes[1] === 0xff;
    return new TextDecoder(bigEndian ? 'utf-16be' : 'utf-16le').decode(bytes);
  }
  return new TextDecoder('utf-8').decode(bytes);
}

export async function getJson(url, options) {
  // Some status pages serve HTML from the API path unless JSON is the only thing asked for.
  const text = await getText(url, { accept: 'application/json', ...options });
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('response is not JSON');
  }
}
