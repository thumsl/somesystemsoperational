import { ADAPTERS } from './adapters/index.js';
import { CONCURRENCY, HISTORY_INTERVAL_MS, MAX_FAILURES, POLL_INTERVAL_MS } from './config.js';
import * as fetcher from './fetcher.js';

const blank = (provider) => ({
  provider,
  status: 'pending',
  description: '',
  incidents: [],
  components: [],
  componentCount: 0,
  componentIssues: 0,
  componentsTruncated: false,
  /** Past incidents, or null when the provider publishes none. */
  history: null,
  /** ISO time from which `history` is complete; null means the whole window. */
  coverageStart: null,
  checkedAt: null,
  okAt: null,
  failures: 0,
  error: null,
});

async function pool(items, limit, worker) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) await worker(items[next++]);
    }),
  );
}

/** Polls every provider on a loop and keeps the latest normalized state in memory. */
export class Monitor {
  constructor(providers, { ctx = { ...fetcher, now: () => Date.now() }, log = console, onCycle = null } = {}) {
    this.providers = providers;
    this.onCycle = onCycle;
    this.ctx = ctx;
    this.log = log;
    this.states = new Map(providers.map((p) => [p.slug, blank(p)]));
    this.slowDue = new Map();
    this.version = 0;
    this.startedAt = ctx.now();
    this.cycles = 0;
    this.timer = null;
  }

  get(slug) {
    return this.states.get(slug);
  }

  all() {
    return [...this.states.values()];
  }

  /** Replace part of a provider's state right away, for state that is measured rather than polled. */
  apply(slug, result) {
    const state = this.states.get(slug);
    if (!state) return;
    const now = this.ctx.now();
    Object.assign(state, result, { checkedAt: now, okAt: now, failures: 0, error: null });
    this.version++;
  }

  /** True once every provider has been tried at least once. */
  get warm() {
    return this.cycles > 0;
  }

  async pollCurrent(provider) {
    const state = this.states.get(provider.slug);
    const adapter = ADAPTERS[provider.type];
    const now = this.ctx.now();
    try {
      const result = await adapter.current(provider, this.ctx);
      Object.assign(state, result, { checkedAt: now, okAt: now, failures: 0, error: null });
    } catch (err) {
      state.checkedAt = now;
      state.failures += 1;
      state.error = String(err?.message || err).slice(0, 200);
      // Keep showing the last known status through a blip; give up after a few failures.
      if (state.status === 'pending' || state.failures >= MAX_FAILURES) {
        Object.assign(state, { status: 'unknown', description: '', incidents: [] });
      }
    }
    this.version++;
  }

  async pollSlow(provider) {
    const adapter = ADAPTERS[provider.type];
    if (!adapter.slow) return;
    const state = this.states.get(provider.slug);
    try {
      Object.assign(state, await adapter.slow(provider, this.ctx));
      this.version++;
    } catch (err) {
      this.log.warn(`[history] ${provider.slug}: ${err?.message || err}`);
    }
  }

  async cycle() {
    const started = this.ctx.now();
    await pool(this.providers, CONCURRENCY, (p) => this.pollCurrent(p));
    this.cycles++;
    this.onCycle?.({
      total: this.providers.filter((p) => !p.self).length,
      failed: this.all().filter((s) => s.failures > 0 && !s.provider.self).map((s) => s.provider.name),
      durationMs: this.ctx.now() - started,
    });

    const due = this.providers.filter((p) => ADAPTERS[p.type].slow && (this.slowDue.get(p.slug) ?? 0) <= started);
    for (const p of due) {
      // Spread later refreshes out so they do not all land in the same cycle.
      this.slowDue.set(p.slug, started + HISTORY_INTERVAL_MS * (0.75 + Math.random() * 0.5));
    }
    await pool(due, CONCURRENCY, (p) => this.pollSlow(p));

    const states = this.all();
    const failed = states.filter((s) => s.failures > 0).length;
    this.log.info(`[poll] cycle ${this.cycles}: ${states.length - failed}/${states.length} ok, ${due.length} history refreshes, ${Math.round((this.ctx.now() - started) / 1000)}s`);
  }

  start() {
    const loop = async () => {
      const started = this.ctx.now();
      try {
        await this.cycle();
      } catch (err) {
        this.log.error('[poll] cycle failed', err);
      }
      const wait = Math.max(5_000, POLL_INTERVAL_MS - (this.ctx.now() - started));
      this.timer = setTimeout(loop, wait);
    };
    loop();
  }

  stop() {
    clearTimeout(this.timer);
  }
}
