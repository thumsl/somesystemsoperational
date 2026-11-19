(() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  function ago(ms) {
    const s = Math.max(0, Math.round(ms / 1000));
    if (s < 45) return 'just now';
    const m = Math.round(s / 60);
    if (m < 60) return `${m} min ago`;
    const h = Math.round(m / 60);
    if (h < 48) return `${h}h ago`;
    return `${Math.round(h / 24)} days ago`;
  }
  const absolute = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  function refreshTimes() {
    const now = Date.now();
    for (const el of $$('time[datetime]')) {
      const t = Date.parse(el.dateTime);
      if (Number.isNaN(t)) continue;
      if (el.hasAttribute('data-rel')) {
        el.textContent = ago(now - t);
        el.title = absolute.format(t);
      } else if (el.hasAttribute('data-abs')) {
        el.textContent = absolute.format(t);
      }
    }
  }

  const q = $('#q');
  const only = $('#only');

  function applyFilter() {
    if (!q) return;
    const term = q.value.trim().toLowerCase();
    document.body.classList.toggle('only-issues', only.checked);
    let visible = 0;
    for (const group of $$('[data-group]')) {
      let shown = 0;
      for (const row of $$('.row', group)) {
        const match = !term || row.dataset.name.includes(term);
        row.classList.toggle('no-match', !match);
        if (match && !(only.checked && row.dataset.ok === '1')) shown++;
      }
      group.classList.toggle('is-empty', shown === 0);
      if (term && shown) group.open = true;
      visible += shown;
    }
    $('#no-match').hidden = visible > 0;
  }
  q?.addEventListener('input', applyFilter);
  only?.addEventListener('change', applyFilter);

  const tip = $('#tip');
  const LEVEL = { '-': 'No data', 0: 'No incidents reported', 1: 'Minor incident', 2: 'Major incident', 3: 'Critical incident' };
  const dayFormat = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
  const list = (bar, key) => (bar.dataset[key] || '').split(',');
  const count = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

  function showTip(event) {
    const bar = event.target.closest?.('.bar');
    if (!bar) return hideTip();
    const levels = bar.dataset.l;
    const box = bar.getBoundingClientRect();
    const i = Math.min(levels.length - 1, Math.max(0, Math.floor(((event.clientX - box.left) / box.width) * levels.length)));
    const date = new Date(Date.parse(`${bar.dataset.end}T00:00:00Z`) - (levels.length - 1 - i) * 86400000);
    const incidents = Number(list(bar, 'c')[i] || 0);
    let line;
    if (bar.dataset.a !== undefined) {
      const affected = Number(list(bar, 'a')[i] || 0);
      const covered = Number(list(bar, 'v')[i] || 0);
      line = levels[i] === '-' ? 'No data' : affected ? `${count(incidents, 'incident')} at ${affected} of ${covered} services` : 'No incidents reported. Suspicious.';
    } else {
      line = incidents ? `${count(incidents, 'incident')} · worst: ${LEVEL[levels[i]].split(' ')[0].toLowerCase()}` : LEVEL[levels[i]];
    }
    tip.replaceChildren(Object.assign(document.createElement('b'), { textContent: dayFormat.format(date) }), line);
    tip.hidden = false;
    const w = tip.offsetWidth;
    tip.style.left = `${Math.min(window.innerWidth - w - 8, Math.max(8, event.clientX - w / 2))}px`;
    tip.style.top = `${box.top - tip.offsetHeight - 8 < 0 ? box.bottom + 8 : box.top - tip.offsetHeight - 8}px`;
  }
  const hideTip = () => (tip.hidden = true);
  document.addEventListener('pointermove', showTip);
  document.addEventListener('pointerleave', hideTip);
  document.addEventListener('scroll', hideTip, { passive: true });
  document.addEventListener('click', (event) => {
    if (event.pointerType === 'touch' && event.target.closest('.bar')) {
      event.preventDefault();
      showTip(event);
    }
  });

  const subscribe = $('#subscribe');
  const pop = $('#subscribe-pop');
  subscribe?.addEventListener('click', (event) => {
    event.stopPropagation();
    pop.hidden = !pop.hidden;
    subscribe.setAttribute('aria-expanded', String(!pop.hidden));
  });
  document.addEventListener('click', (event) => {
    if (pop && !pop.hidden && !pop.contains(event.target)) {
      pop.hidden = true;
      subscribe.setAttribute('aria-expanded', 'false');
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && pop) pop.hidden = true;
  });

  document.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-copy]');
    if (!button) return;
    try {
      await navigator.clipboard.writeText(button.dataset.copy);
      button.textContent = 'Copied';
    } catch {
      button.textContent = 'Clipboard said no';
    }
    setTimeout(() => (button.textContent = 'Copy'), 1500);
  });

  const closed = new Set();
  const opened = new Set();
  document.addEventListener(
    'toggle',
    (event) => {
      const key = event.target.dataset?.keep;
      if (!key) return;
      (event.target.open ? opened : closed).add(key);
      (event.target.open ? closed : opened).delete(key);
    },
    true,
  );

  async function refresh() {
    if (document.hidden) return;
    try {
      const res = await fetch(location.href, { headers: { accept: 'text/html' }, cache: 'no-store' });
      if (!res.ok) return;
      const next = new DOMParser().parseFromString(await res.text(), 'text/html');
      for (const el of $$('[data-live]')) {
        const fresh = next.getElementById(el.id);
        if (fresh && fresh.innerHTML !== el.innerHTML) el.innerHTML = fresh.innerHTML;
      }
      for (const el of $$('details[data-keep]')) {
        if (closed.has(el.dataset.keep)) el.open = false;
        if (opened.has(el.dataset.keep)) el.open = true;
      }
      document.title = next.title;
      const icon = $('link[rel="icon"]');
      const freshIcon = $('link[rel="icon"]', next);
      if (icon && freshIcon && icon.getAttribute('href') !== freshIcon.getAttribute('href')) icon.href = freshIcon.getAttribute('href');
      refreshTimes();
      applyFilter();
    } catch {}
  }

  refreshTimes();
  applyFilter();
  setInterval(refreshTimes, 20_000);
  setInterval(refresh, 60_000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refresh();
  });
})();
