/** Per-client token buckets. Everything served is a cached buffer, so this only has to stop floods. */

export class RateLimiter {
  /**
   * @param capacity      requests a client may make in one burst
   * @param refillPerSec  sustained requests per second after the burst
   * @param maxKeys       clients tracked at once; the least recently seen are dropped beyond this
   */
  constructor({ capacity = 90, refillPerSec = 1.5, maxKeys = 100_000, now = Date.now } = {}) {
    this.capacity = capacity;
    this.refillPerSec = refillPerSec;
    this.maxKeys = maxKeys;
    this.now = now;
    this.buckets = new Map();
  }

  /** True if the client may proceed. */
  take(key) {
    const now = this.now();
    let bucket = this.buckets.get(key);
    if (bucket) {
      bucket.tokens = Math.min(this.capacity, bucket.tokens + ((now - bucket.at) / 1000) * this.refillPerSec);
      this.buckets.delete(key); // re-insert below: Map order then doubles as least-recently-seen order
    } else {
      bucket = { tokens: this.capacity, at: now };
      if (this.buckets.size >= this.maxKeys) this.buckets.delete(this.buckets.keys().next().value);
    }
    bucket.at = now;
    this.buckets.set(key, bucket);
    if (bucket.tokens < 1) return false;
    bucket.tokens -= 1;
    return true;
  }

  /** Seconds until the client has a token again. */
  retryAfter(key) {
    const bucket = this.buckets.get(key);
    return bucket ? Math.max(1, Math.ceil((1 - bucket.tokens) / this.refillPerSec)) : 1;
  }

  /** Forget clients whose bucket has refilled; call now and then to keep the map small. */
  prune() {
    const now = this.now();
    const idle = (this.capacity / this.refillPerSec) * 1000;
    for (const [key, bucket] of this.buckets) {
      if (now - bucket.at < idle) break; // the rest were seen more recently
      this.buckets.delete(key);
    }
  }
}

/** One bucket per IPv4 address or per IPv6 /64, since a single host controls a whole /64. */
export function bucketKey(ip) {
  const address = String(ip || '').trim().replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/i, '');
  if (!address.includes(':')) return address || 'unknown';
  const [head, tail = ''] = address.toLowerCase().split('::');
  const groups = head ? head.split(':') : [];
  if (address.includes('::')) {
    const rest = tail ? tail.split(':') : [];
    while (groups.length + rest.length < 8) groups.push('0');
    groups.push(...rest);
  }
  return groups.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, '')).join(':');
}

/**
 * The address to rate limit by. Behind a proxy the socket address is the proxy's, so the
 * address comes from a header: by default the last entry of X-Forwarded-For, which is the
 * one our own proxy appended and a client cannot forge.
 */
export function clientIp(req, header = 'x-forwarded-for') {
  const value = req.headers[header];
  const raw = Array.isArray(value) ? value[value.length - 1] : value;
  if (raw) {
    const last = String(raw).split(',').pop().trim();
    if (last) return last;
  }
  return req.socket?.remoteAddress || '';
}

export const isLoopback = (ip) => ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
