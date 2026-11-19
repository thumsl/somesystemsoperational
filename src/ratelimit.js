export class RateLimiter {
  constructor({ capacity = 90, refillPerSec = 1.5, maxKeys = 100_000, now = Date.now } = {}) {
    this.capacity = capacity;
    this.refillPerSec = refillPerSec;
    this.maxKeys = maxKeys;
    this.now = now;
    this.buckets = new Map();
  }

  take(key) {
    const now = this.now();
    let bucket = this.buckets.get(key);
    if (bucket) {
      bucket.tokens = Math.min(this.capacity, bucket.tokens + ((now - bucket.at) / 1000) * this.refillPerSec);
      this.buckets.delete(key);
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

  retryAfter(key) {
    const bucket = this.buckets.get(key);
    return bucket ? Math.max(1, Math.ceil((1 - bucket.tokens) / this.refillPerSec)) : 1;
  }

  prune() {
    const now = this.now();
    const idle = (this.capacity / this.refillPerSec) * 1000;
    for (const [key, bucket] of this.buckets) {
      if (now - bucket.at < idle) break;
      this.buckets.delete(key);
    }
  }
}

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
