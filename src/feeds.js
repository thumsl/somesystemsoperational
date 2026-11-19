import { BRAND, PUBLIC_URL, TAGLINE } from './config.js';
import { impactfulIncidents } from './history.js';
import { clip } from './normalize.js';
import { CATEGORIES } from './providers.js';
import { esc } from './render.js';

const CATEGORY_NAME = new Map(CATEGORIES);
const touched = (i) => i.updatedAt || i.resolvedAt || i.startedAt;

export function sitemap(summary) {
  const today = new Date(summary.now).toISOString().slice(0, 10);
  const pages = [['/', today], ['/about'], ['/api'], ...summary.categories.map((c) => [`/status/${c.slug}`, today])];
  for (const c of summary.categories) {
    for (const { state } of c.rows) {
      const latest = impactfulIncidents(state).map(touched).sort().pop();
      pages.push([`/${state.provider.slug}`, latest?.slice(0, 10)]);
    }
  }
  const urls = pages.map(([path, day]) => `<url><loc>${esc(PUBLIC_URL + path)}</loc>${day ? `<lastmod>${day}</lastmod>` : ''}</url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}

export function feed(states, now) {
  const entries = states
    .flatMap((state) => impactfulIncidents(state).map((incident) => ({ state, incident })))
    .sort((a, b) => b.incident.startedAt.localeCompare(a.incident.startedAt))
    .slice(0, 50);
  const updated = entries.map((e) => touched(e.incident)).sort().pop() ?? new Date(now).toISOString();

  const items = entries.map(({ state, incident }) => {
    const { provider } = state;
    const page = `${PUBLIC_URL}/${provider.slug}`;
    const text = incident.updates[0]?.body || `${incident.status || 'Reported'} on the ${provider.name} status page.`;
    return `<entry>
<title>${esc(`${provider.name}: ${incident.name}`)}</title>
<id>${esc(`${page}#${encodeURIComponent(incident.id)}`)}</id>
<link href="${esc(page)}"/>
${incident.url ? `<link rel="related" href="${esc(incident.url)}"/>` : ''}
<published>${incident.startedAt}</published>
<updated>${touched(incident)}</updated>
<author><name>${esc(provider.name)}</name></author>
<category term="${esc(CATEGORY_NAME.get(provider.category) ?? provider.category)}"/>
<summary>${esc(clip(text, 500))}</summary>
</entry>`;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
<title>${esc(BRAND)}: incidents</title>
<subtitle>${esc(TAGLINE)}. Every incident reported by ${states.length} major services.</subtitle>
<id>${esc(PUBLIC_URL)}/</id>
<link href="${esc(PUBLIC_URL)}/"/>
<link rel="self" href="${esc(PUBLIC_URL)}/feed.xml"/>
<updated>${updated}</updated>
${items.join('\n')}
</feed>
`;
}

export function llms(summary) {
  const groups = summary.categories.map(
    (c) => `## ${c.name}\n\n${c.rows.map(({ state }) => `- [${state.provider.name}](${PUBLIC_URL}/${state.provider.slug}): live status, open incidents and outage history`).join('\n')}`,
  );
  return `# ${BRAND}

> ${TAGLINE}. One page that reads the official status pages of ${summary.total} major internet services every two minutes and shows which ones are down.

Every status is what the provider itself reports. Each service has its own page at ${PUBLIC_URL}/<service>, answering "is <service> down?".

- [About, and how the data is collected](${PUBLIC_URL}/about)
- [API documentation](${PUBLIC_URL}/api)
- [Current status of everything, as JSON](${PUBLIC_URL}/api/v2/summary.json): open API, no key, CORS enabled
- [Overall status, as JSON](${PUBLIC_URL}/api/v2/status.json)
- [Incident feed (Atom)](${PUBLIC_URL}/feed.xml)

${groups.join('\n\n')}
`;
}
