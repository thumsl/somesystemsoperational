import { BRAND, DONATE, GOOGLE_SITE_VERIFICATION, HISTORY_DAYS, POLL_INTERVAL_MS, PUBLIC_URL, SOURCE_URL, TAGLINE, UMAMI_SCRIPT, UMAMI_WEBSITE_ID } from './config.js';
import { DAY, historyWindow, impactfulIncidents, providerDays } from './history.js';
import { clip } from './normalize.js';

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

const STATUS_LABEL = {
  operational: 'Operational',
  degraded: 'Degraded',
  partial_outage: 'Partial outage',
  major_outage: 'Major outage',
  maintenance: 'Maintenance',
  unknown: 'Unreachable',
  pending: 'Checking',
};
const IMPACT_LABEL = { none: 'Notice', minor: 'Minor', major: 'Major', critical: 'Critical', maintenance: 'Maintenance' };
const BANNER_LEVEL = { operational: 'ok', maintenance: 'maint', degraded: 'warn', partial_outage: 'partial', major_outage: 'bad', unknown: 'pending', pending: 'pending' };

const plural = (n, one, many = `${one}s`) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;
const and = new Intl.ListFormat('en', { type: 'conjunction' });
const or = new Intl.ListFormat('en', { type: 'disjunction' });
const absolute = (path) => PUBLIC_URL + path;
const isCalm = (status) => status === 'operational' || status === 'maintenance' || status === 'pending';

function fmtUtc(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const sameYear = d.getUTCFullYear() === new Date().getUTCFullYear();
  return `${d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: sameYear ? undefined : 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' })} UTC`;
}

export function duration(ms) {
  const m = Math.round(ms / 60_000);
  if (m < 1) return 'under a minute';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return m % 60 ? `${h}h ${m % 60}m` : `${h}h`;
  const d = Math.floor(h / 24);
  return h % 24 ? `${d}d ${h % 24}h` : `${d}d`;
}

const time = (iso, mode = 'rel') => (iso ? `<time datetime="${esc(iso)}" data-${mode}>${esc(fmtUtc(iso))}</time>` : '');

const TRIANGLE = '<path d="M12 4l9 16H3z"/><path d="M12 10v4.5M12 17.5v.5"/>';
const ICON = {
  ok: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  warn: TRIANGLE,
  partial: TRIANGLE,
  bad: '<circle cx="12" cy="12" r="9"/><path d="M8.5 8.5l7 7M15.5 8.5l-7 7"/>',
  maint: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  pending: '<circle cx="12" cy="12" r="9"/><path d="M8 12h.01M12 12h.01M16 12h.01"/>',
};
const icon = (level) =>
  `<svg class="banner-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[level] ?? ICON.pending}</svg>`;

const LOGO =
  '<svg class="logo" viewBox="0 0 26 22" aria-hidden="true"><rect class="l0" x="0" y="0" width="5" height="22" rx="1.5"/><rect class="l0" x="7" y="0" width="5" height="22" rx="1.5"/><rect class="l1" x="14" y="0" width="5" height="22" rx="1.5"/><rect class="l3" x="21" y="0" width="5" height="22" rx="1.5"/></svg>';

function bar(levels, win, data, label) {
  let paths = '';
  for (let i = 0; i < levels.length; ) {
    let j = i;
    while (j + 1 < levels.length && levels[j + 1] === levels[i]) j++;
    paths += `<path class="l${levels[i] < 0 ? 'x' : levels[i]}" d="M${i * 5} 5H${(j + 1) * 5}"/>`;
    i = j + 1;
  }
  const attrs = Object.entries(data)
    .map(([k, v]) => ` data-${k}="${v.map((n) => n || '').join(',')}"`)
    .join('');
  const end = new Date(win.end - DAY).toISOString().slice(0, 10);
  return `<svg class="bar" viewBox="0 0 ${levels.length * 5 - 1} 10" preserveAspectRatio="none" role="img" aria-label="${esc(label)}" data-l="${levels.map((l) => (l < 0 ? '-' : l)).join('')}" data-end="${end}"${attrs}>${paths}</svg>`;
}

function tracker() {
  if (!UMAMI_SCRIPT || !UMAMI_WEBSITE_ID) return '';
  const domain = PUBLIC_URL ? ` data-domains="${esc(new URL(PUBLIC_URL).hostname)}"` : '';
  return `<script src="${esc(UMAMI_SCRIPT)}" data-website-id="${esc(UMAMI_WEBSITE_ID)}"${domain} defer></script>`;
}

function donate() {
  const coins = Object.entries(DONATE).filter(([, address]) => address);
  if (!coins.length) return '';
  const items = coins.map(
    ([coin, address]) =>
      `<li><b>${esc(coin)}</b> <code>${esc(address)}</code> <button type="button" class="copy" data-copy="${esc(address)}" data-umami-event="Copy address" data-umami-event-coin="${esc(coin)}">Copy</button></li>`,
  );
  return `<div class="donate"><p>Donations keep some systems operational:</p><ul>${items.join('')}</ul></div>`;
}

function jsonLd(items) {
  return items
    .map((item) => `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', ...item }).replace(/</g, '\\u003c')}</script>`)
    .join('\n');
}

export const crumbs = (...steps) => ({
  '@type': 'BreadcrumbList',
  itemListElement: steps.map(([name, path], i) => ({ '@type': 'ListItem', position: i + 1, name, item: absolute(path) })),
});

export function layout({ title, description, path, body, level, summary, data = [], index = true }) {
  const own = summary.self;
  const canonical = PUBLIC_URL && index ? `<link rel="canonical" href="${esc(absolute(path))}">\n<meta property="og:url" content="${esc(absolute(path))}">` : '';
  const verify = GOOGLE_SITE_VERIFICATION ? `<meta name="google-site-verification" content="${esc(GOOGLE_SITE_VERIFICATION)}">` : '';
  const browse = summary.categories.map((c) => `<a href="/status/${c.slug}">${esc(c.name)}</a>`).join(' · ');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(BRAND)}">
<meta property="og:image" content="${esc(absolute('/og.png'))}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="color-scheme" content="light dark">
${index ? canonical : '<meta name="robots" content="noindex">'}
${verify}
<link rel="alternate" type="application/atom+xml" title="${esc(BRAND)}: incidents" href="/feed.xml">
<link rel="icon" type="image/svg+xml" href="/favicon-${esc(level)}.svg">
<link rel="preload" href="/assets/${ASSET_VERSION}/instrument-sans.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/${ASSET_VERSION}/style.css">
<script src="/assets/${ASSET_VERSION}/app.js" defer></script>
${tracker()}
${jsonLd(data)}
</head>
<body>
<div class="wrap">
<header class="top">
  <a class="brand" href="/">${LOGO}<span>${esc(BRAND)}</span></a>
  <div class="subscribe">
    <button type="button" class="btn" id="subscribe" aria-expanded="false" aria-controls="subscribe-pop">Subscribe<span class="wide"> to updates</span></button>
    <div class="pop" id="subscribe-pop" hidden>${subscribeText(summary)}</div>
  </div>
</header>
${body}
<footer class="foot">
  <p>${esc(BRAND)} is an unofficial aggregate of public status pages. Every status shown is reported by the provider itself, so the real situation may be worse. Not affiliated with any of the services listed.</p>
  <p>${browse}</p>
  <p><a href="/">All services</a> · <a href="/about">About</a> · <a href="/api">API</a> · <a href="/feed.xml">Feed</a> · ${SOURCE_URL ? `<a href="${esc(SOURCE_URL)}" rel="noopener" data-umami-event="Source">Source</a> · ` : ''}Status of this page: <span id="live-self" data-live>${own ? `<a class="status s-${own.status}" href="/${esc(own.provider.slug)}">${STATUS_LABEL[own.status]}</a>` : 'unknown'}</span></p>
  ${donate()}
</footer>
</div>
<div class="tip" id="tip" hidden></div>
</body>
</html>`;
}

let ASSET_VERSION = 'dev';
export const setAssetVersion = (v) => (ASSET_VERSION = v);

function subscribeText(summary) {
  const perDay = Math.round(summary.perDay);
  const rate = perDay > 0 ? `At the current rate you would receive about <strong>${plural(perDay, 'notification')} a day</strong>.` : 'There is not enough history yet to say how many notifications you would get.';
  return `<div id="live-subscribe" data-live><p><strong>Subscriptions are paused.</strong></p><p>${rate}</p></div>`;
}

const incidentLink = (i) => (i.url ? `<a href="${esc(i.url)}" target="_blank" rel="noopener nofollow">${esc(i.name)}</a>` : esc(i.name));

function incidentCard({ state, incident }) {
  const latest = incident.updates[0];
  return `<article class="incident i-${incident.impact}">
  <div class="incident-meta"><a class="svc" href="/${esc(state.provider.slug)}">${esc(state.provider.name)}</a><span class="chip c-${incident.impact}">${IMPACT_LABEL[incident.impact]}</span><span class="muted">${incident.status ? `${esc(incident.status)} · ` : ''}started ${time(incident.startedAt)}</span></div>
  <h3>${incidentLink(incident)}</h3>
  ${latest?.body ? `<p class="update">${esc(clip(latest.body, 280))}</p>` : ''}
</article>`;
}

function serviceRow({ state, days }, win) {
  const { provider, status } = state;
  const label = state.history ? `${provider.name}: incident history for the last ${win.days} days` : `${provider.name}: no incident history published`;
  const names = [provider.name, ...(provider.aka ?? [])].join(' ').toLowerCase();
  return `<a class="row" href="/${esc(provider.slug)}" data-name="${esc(names)}" data-ok="${isCalm(status) ? 1 : 0}">
  <span class="name"><span class="dot s-${status}"></span>${esc(provider.name)}</span>
  ${bar(days.levels, win, { c: days.counts }, label)}
  <span class="status s-${status}">${STATUS_LABEL[status]}</span>
</a>`;
}

export function renderHome(summary) {
  const { counts, total, headline, win } = summary;
  const parts = [
    summary.affected && plural(summary.affected, 'service') + ' with issues',
    counts.maintenance && `${counts.maintenance} in maintenance`,
    counts.unknown && `${counts.unknown} unreachable`,
  ].filter(Boolean);

  const sub =
    headline.level === 'pending'
      ? `Reading ${total} status pages. This takes about a minute.`
      : `${counts.operational} of ${total} services report normal operation.${summary.tier1Major.length ? ` Major outage reported by ${summary.tier1Major.join(', ')}.` : ''}`;

  const quietPct = `${(summary.quiet.fraction * 100).toFixed(2)}%`;
  const stats = [
    [`${counts.operational}<small> / ${total}</small>`, 'Services operational', parts.join(' · ') || 'Nothing to report'],
    [summary.incidents.length, 'Active incidents', summary.incidents.length ? `across ${plural(summary.servicesWithIncidents, 'service')}` : 'Enjoy it while it lasts'],
    [summary.last24h, 'New incidents, last 24 hours', `${summary.last30d.toLocaleString('en-US')} in the last 30 days`],
    [quietPct, `Time with no open incident, ${win.days} days`, summary.quiet.longestMs >= 60_000 ? `Longest quiet stretch: ${duration(summary.quiet.longestMs)}` : 'No quiet stretch on record'],
  ]
    .map(([value, label, note]) => `<div class="stat"><div class="stat-value">${value}</div><div class="stat-label">${esc(label)}</div><div class="stat-note">${esc(note)}</div></div>`)
    .join('');

  const first = summary.incidents.slice(0, 6).map(incidentCard).join('');
  const rest = summary.incidents.slice(6).map(incidentCard).join('');
  const incidents = summary.incidents.length
    ? `${first}${rest ? `<details class="more" data-keep="incidents"><summary>Show ${summary.incidents.length - 6} more</summary>${rest}</details>` : ''}`
    : `<p class="empty">No active incidents on any tracked status page.</p>`;

  const categories = summary.categories
    .map(
      (c) => `<details class="group" open data-keep="${c.key}" data-group>
  <summary><span class="group-name">${esc(c.name)}</span><span class="group-count${c.affected ? ' has-issues' : ''}">${c.affected ? `${plural(c.affected, 'issue')} · ` : ''}${c.operational} / ${c.rows.length} operational</span></summary>
  ${c.rows.map((r) => serviceRow(r, win)).join('\n')}
</details>`,
    )
    .join('\n');

  const body = `<main>
<section id="live-hero" data-live>
  <div class="banner b-${headline.level}">${icon(headline.level)}<div><h1>${esc(headline.title)}</h1><p>${esc(sub)}</p></div></div>
  <p class="meta">${esc(TAGLINE)}${summary.checkedAt ? ` · last checked ${time(new Date(summary.checkedAt).toISOString())}` : ''} · refreshes automatically</p>
  <div class="stats">${stats}</div>
  <div class="panel">
    <div class="panel-head"><strong>The Internet</strong><span class="muted">${total} services, by their own account</span></div>
    ${bar(summary.internet.levels, win, { c: summary.internet.incidents, a: summary.internet.affected, v: summary.internet.covered }, `Incidents across all services for the last ${win.days} days`)}
    <div class="axis"><span>${win.days} days ago</span><i></i><span>${quietPct} uptime</span><i></i><span>Today</span></div>
  </div>
</section>
<section class="block">
  <h2>Active incidents <span class="count" id="live-incident-count" data-live>${summary.incidents.length}</span></h2>
  <div id="live-incidents" data-live>${incidents}</div>
</section>
<section class="block">
  <div class="toolbar">
    <h2>Services</h2>
    <input type="search" id="q" placeholder="Filter ${total} services" aria-label="Filter services" autocomplete="off" spellcheck="false">
    <label class="check"><input type="checkbox" id="only"> Issues only</label>
  </div>
  <div id="live-services" data-live>${categories}</div>
  <p class="empty" id="no-match" hidden>No services match. They are probably down.</p>
</section>
</main>`;

  const description = `${counts.operational} of ${total} major internet services are operational right now, with ${plural(summary.incidents.length, 'active incident')}. One status page for the whole internet.`;
  return layout({
    title: `Is the internet down? Live status of ${total} services — ${BRAND}`,
    description,
    path: '/',
    level: headline.level,
    body,
    summary,
    data: [{ '@type': 'WebSite', name: BRAND, alternateName: TAGLINE, url: absolute('/'), description }],
  });
}

export function renderCategory(category, summary) {
  const { name, rows, headline } = category;
  const { win } = summary;
  const names = rows.map((r) => r.state.provider.name);
  const troubled = rows.filter((r) => !isCalm(r.state.status)).map((r) => r.state.provider.name);
  const incidents = summary.incidents.filter((i) => i.state.provider.category === category.key);

  const body = `<main>
<a class="back" href="/">← All services</a>
<div class="detail-head"><div><h1>${esc(name)} status</h1><p class="muted">${plural(rows.length, 'service')}, by their own account</p></div></div>
<div id="live-category" data-live>
<div class="banner b-${headline.level}">${icon(headline.level)}<div><h2>${esc(headline.title)}</h2><p>${category.operational} of ${rows.length} report normal operation.${troubled.length ? ` Trouble at ${esc(and.format(troubled.slice(0, 5)))}${troubled.length > 5 ? ' and others' : ''}.` : ''}</p></div></div>
${summary.checkedAt ? `<p class="meta">Last checked ${time(new Date(summary.checkedAt).toISOString())} · refreshes automatically</p>` : ''}
${incidents.length ? `<section class="block"><h2>Active incidents <span class="count">${incidents.length}</span></h2>${incidents.map(incidentCard).join('')}</section>` : ''}
<section class="block">
  <h2>Services</h2>
  <div class="group">${rows.map((r) => serviceRow(r, win)).join('\n')}</div>
</section>
</div>
</main>`;

  return layout({
    title: `${name} status: is ${or.format(names.slice(0, 3))} down? — ${BRAND}`,
    description: `${category.operational} of ${rows.length} ${name} services are operational right now. Live status and outage history for ${rows.length > 6 ? `${names.slice(0, 6).join(', ')} and ${rows.length - 6} more` : and.format(names)}.`,
    path: `/status/${category.slug}`,
    level: headline.level,
    body,
    summary,
    data: [
      crumbs([BRAND, '/'], [name, `/status/${category.slug}`]),
      { '@type': 'ItemList', name: `${name} status`, itemListElement: rows.map((r, i) => ({ '@type': 'ListItem', position: i + 1, name: r.state.provider.name, url: absolute(`/${r.state.provider.slug}`) })) },
    ],
  });
}

const VERDICT = {
  operational: (n) => ['No', `${n} reports that everything is working`],
  degraded: (n) => ['Somewhat', `${n} reports degraded service`],
  partial_outage: (n) => ['Partly', `${n} reports a partial outage`],
  major_outage: (n) => ['Yes', `${n} reports a major outage`],
  maintenance: (n) => ['Not quite', `${n} is under planned maintenance`],
  unknown: (n) => ['Hard to say', `The ${n} status page itself is not answering, which is rarely a good sign`],
  pending: (n) => ['Checking', `The first read of the ${n} status page is still in progress`],
};

function questions(state, host, last) {
  const { provider, status } = state;
  const name = provider.name;
  const aka = provider.aka ?? [];
  const [word, detail] = VERDICT[status](name);
  const open = state.incidents.find((i) => i.impact !== 'maintenance');
  const cause = open && status !== 'operational' ? `: "${open.name}"` : '';
  const doubt = status === 'operational' ? ` If it is broken for you anyway, ${name} has not admitted it yet.` : '';
  const list = [[`Is ${name} down right now?`, `${word}. ${detail}${cause}.${doubt}`]];

  if (state.history) {
    const ended = last?.resolvedAt ? `lasted ${duration(Math.max(0, Date.parse(last.resolvedAt) - Date.parse(last.startedAt)))}` : 'is still open';
    list.push([
      `When was the last ${name} outage?`,
      last ? `The latest incident on the ${name} status page is "${last.name}". It started ${fmtUtc(last.startedAt)} and ${ended}.` : `There is no incident in the history ${name} publishes.`,
    ]);
  }
  if (aka.length) {
    list.push([`Does this cover ${or.format(aka)}?`, `Yes. ${and.format(aka)} ${aka.length > 1 ? 'are' : 'is'} reported on the ${name} status page, so an outage there shows up here.`]);
  }
  list.push([
    'Where does this come from?',
    `From the official ${name} status page at ${host}, read every ${plural(Math.round(POLL_INTERVAL_MS / 60_000), 'minute')}. Nothing here is crowd-sourced: it shows what ${name} itself has confirmed, no more.`,
  ]);
  return list;
}

function updatesList(incident) {
  if (!incident.updates.length) return '';
  return `<ol class="updates">${incident.updates
    .map((u) => `<li>${u.status ? `<strong>${esc(u.status)}</strong> ` : ''}<span class="muted">${time(u.at, 'abs')}</span><p>${esc(u.body)}</p></li>`)
    .join('')}</ol>`;
}

function componentList(state) {
  if (!state.componentCount) return '';
  const groups = new Map();
  for (const c of state.components) {
    const key = c.group || '';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(c);
  }
  const rows = [...groups.entries()]
    .map(
      ([group, list]) =>
        `${group ? `<div class="comp-group">${esc(group)}</div>` : ''}${list
          .map((c) => `<div class="comp"><span>${esc(c.name)}</span><span class="status s-${c.status}">${STATUS_LABEL[c.status]}</span></div>`)
          .join('')}`,
    )
    .join('');
  const others = state.componentCount - state.componentIssues;
  const note = state.componentsTruncated
    ? `<div class="comp note">${state.componentIssues ? `The other ${plural(others, 'component')} are operational.` : `All ${plural(state.componentCount, 'component')} are operational.`}</div>`
    : '';
  return `<section class="block"><h2>Components <span class="count">${state.componentCount}</span></h2><div class="panel flush">${rows}${note}</div></section>`;
}

export function renderDetail(state, summary) {
  const { provider, status } = state;
  const now = summary.now;
  const win = historyWindow(now, HISTORY_DAYS);
  const days = providerDays(state, win, now);
  const level = BANNER_LEVEL[status];
  const host = provider.self ? 'this server, checking itself' : new URL(provider.page).host;

  const fallback = {
    operational: 'No issues reported.',
    degraded: 'The provider reports degraded service.',
    partial_outage: 'The provider reports a partial outage.',
    major_outage: 'The provider reports a major outage.',
    maintenance: 'Maintenance in progress.',
    unknown: `We could not read this status page${state.error ? ` (${state.error})` : ''}. Yes, the status page.`,
    pending: 'First check in progress.',
  }[status];

  const active = state.incidents.length
    ? `<section class="block"><h2>Active incidents <span class="count">${state.incidents.length}</span></h2>${state.incidents
        .map(
          (i) => `<article class="incident i-${i.impact}">
  <div class="incident-meta"><span class="chip c-${i.impact}">${IMPACT_LABEL[i.impact]}</span><span class="muted">${i.status ? `${esc(i.status)} · ` : ''}started ${time(i.startedAt)}</span></div>
  <h3>${incidentLink(i)}</h3>
  ${updatesList(i)}
</article>`,
        )
        .join('')}</section>`
    : '';

  const all = impactfulIncidents(state).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const past = all.filter((i) => i.resolvedAt && Date.parse(i.resolvedAt) >= win.start);
  const inWindow = all.filter((i) => (i.resolvedAt ? Date.parse(i.resolvedAt) : now) >= win.start).length;
  const partial = state.coverageStart && Date.parse(state.coverageStart) > win.start;

  const history = state.history
    ? `<div class="panel">
    <div class="panel-head"><strong>${plural(inWindow, 'incident')}</strong><span class="muted">${partial ? `since ${esc(fmtUtc(state.coverageStart).replace(/,? \d\d:\d\d UTC$/, ''))}, ${provider.self ? 'when this site started keeping its own record' : "as far back as this provider's feed goes"}` : `in the last ${win.days} days`}</span></div>
    ${bar(days.levels, win, { c: days.counts }, `${provider.name}: incident history for the last ${win.days} days`)}
    <div class="axis"><span>${win.days} days ago</span><i></i><span>Today</span></div>
  </div>`
    : `<p class="empty">${esc(provider.name)} does not publish its incident history in a form we can read, so only current status is shown.</p>`;
  const selfNote = provider.self
    ? `<p class="note">This is the one status on the site we measure ourselves: whether the server can read the other ${summary.total - 1} status pages, how fresh that data is, how quickly it answers and how much traffic it is turning away. Incidents here open and close automatically.</p>`
    : '';

  const pastList = past.length
    ? `<section class="block"><h2>Past incidents <span class="count">${past.length}</span></h2><div class="panel flush">${past
        .slice(0, 60)
        .map(
          (i) =>
            `<div class="past"><span class="dot i-dot-${i.impact}"></span><div><div class="past-name">${incidentLink(i)}</div><div class="muted">${time(i.startedAt, 'abs')} · lasted ${esc(duration(Math.max(0, Date.parse(i.resolvedAt) - Date.parse(i.startedAt))))}</div></div><span class="chip c-${i.impact}">${IMPACT_LABEL[i.impact]}</span></div>`,
        )
        .join('')}</div></section>`
    : '';

  const category = summary.categories.find((c) => c.key === provider.category);
  const siblings = (category?.rows ?? []).filter((r) => r.state !== state).slice(0, 12);
  const related = siblings.length
    ? `<p class="related">More in ${esc(category.name)}: ${siblings.map((r) => `<a href="/${esc(r.state.provider.slug)}">${esc(r.state.provider.name)}</a>`).join(', ')}${category.rows.length - 1 > siblings.length ? `, <a href="/status/${category.slug}">all ${category.rows.length}</a>` : ''}</p>`
    : '';
  const qa = provider.self ? [] : questions(state, host, all[0]);
  const faq = qa.length
    ? `<section class="block faq"><h2>Is ${esc(provider.name)} down?</h2>${qa.map(([q, a], i) => `${i ? `<h3>${esc(q)}</h3>` : ''}<p>${esc(a)}</p>`).join('')}${related}</section>`
    : '';
  const alias = provider.aka?.find((a) => !a.includes(provider.name));
  const label = alias ? `${provider.name} (${alias})` : provider.name;
  const [word, detail] = VERDICT[status](provider.name);

  const body = `<main>
<a class="back" href="/">← All services</a>
<div class="detail-head">
  <div><h1>${esc(provider.name)}</h1><p class="muted">${category ? `<a href="/status/${category.slug}">${esc(category.name)}</a>` : ''}</p></div>
  ${provider.self ? '<span class="btn is-static">You are looking at it</span>' : `<a class="btn" href="${esc(provider.page)}" target="_blank" rel="noopener">Official status page ↗</a>`}
</div>
<div id="live-detail" data-live>
<div class="banner b-${level}">${icon(level)}<div><h2>${STATUS_LABEL[status]}</h2><p>${esc(state.description && state.description.toLowerCase() !== STATUS_LABEL[status].toLowerCase() ? state.description : fallback)}</p></div></div>
${selfNote}
<p class="meta">Source: ${esc(host)}${state.okAt ? ` · last checked ${time(new Date(state.okAt).toISOString())}` : ''}</p>
${active}
<section class="block"><h2>History</h2>${history}</section>
${componentList(state)}
${pastList}
${faq}
</div>
</main>`;

  const steps = [[BRAND, '/'], category && [category.name, `/status/${category.slug}`], [provider.name, `/${provider.slug}`]].filter(Boolean);
  return layout({
    title: provider.self ? `${provider.name} status — ${BRAND}` : `Is ${label} down? Live status and outage history — ${BRAND}`,
    description: provider.self
      ? `${provider.name} is currently: ${STATUS_LABEL[status]}. Live status, active incidents and ${win.days}-day history, measured by the site itself.`
      : `${word}. ${detail}. Live ${provider.name} status, open incidents and ${win.days}-day outage history, straight from ${host}.`,
    path: `/${provider.slug}`,
    level,
    body,
    summary,
    data: [
      crumbs(...steps),
      qa.length && { '@type': 'FAQPage', mainEntity: qa.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) },
    ].filter(Boolean),
  });
}

export function renderNotFound(summary) {
  const body = `<main><div class="banner b-pending">${icon('bad')}<div><h1>404 — Page Not Found</h1><p>For once, this outage is ours. There is no such page.</p></div></div><p class="meta"><a href="/">← Back to the internet</a></p></main>`;
  return layout({ title: `Not found — ${BRAND}`, description: 'Page not found.', path: '/', level: 'pending', body, summary, index: false });
}

const FAVICON_COLOR = { ok: '#2a9456', warn: '#eeb024', partial: '#e0672b', bad: '#cf3b34', maint: '#6a55c9', pending: '#98a096' };
export const renderFavicon = (level) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect x="4" y="4" width="24" height="24" rx="7" fill="${FAVICON_COLOR[level] ?? FAVICON_COLOR.pending}"/></svg>`;
