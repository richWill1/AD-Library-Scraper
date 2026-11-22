// Editorial helper for AdSnoop Insights. Nothing here publishes anything.
//
//   npm run insights:news                 List new Meta updates not yet covered
//   npm run insights:news -- --draft 3    Create an unpublished draft from item 3
//   npm run insights:new -- "Title here"  Create an empty draft from the template
//
// Updates come from AdSnoop's existing /api/meta-updates feed (public RSS from
// Meta Newsroom, Meta for Developers and trusted industry publications, cached
// server-side), so sources are not fetched again from here. Only the headline,
// link, date and the feed's own short summary are used; no article is copied.
// Items already cited in an article, or already turned into a draft, are skipped.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ARTICLES = path.join(ROOT, 'content/insights/articles');
const FEED = process.env.INSIGHTS_FEED_URL || 'https://adsnoop.co.uk/api/meta-updates';
const TAG_TO_CATEGORY = {
  'Measurement': 'measurement-profitability',
  'Formats & placements': 'creative-intelligence',
  'AI & automation': 'strategy-optimisation',
  'Ads & campaigns': 'meta-updates',
  'Policy & privacy': 'meta-updates',
  'Business tools': 'meta-updates',
};

const today = new Date().toISOString().slice(0, 10);
const slugify = s => s.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 70).replace(/-[^-]*$/, m => (m.length < 4 ? '' : m));
const norm = u => u.replace(/[?#].*$/, '').replace(/\/$/, '');

function existing() {
  const covered = new Set();
  for (const f of fs.readdirSync(ARTICLES).filter(f => f.endsWith('.md'))) {
    const fm = fs.readFileSync(path.join(ARTICLES, f), 'utf8').match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!fm) continue;
    const meta = YAML.parse(fm[1]) || {};
    for (const s of meta.sources || []) if (s.url) covered.add(norm(s.url));
    if (meta.origin?.url) covered.add(norm(meta.origin.url));
  }
  return covered;
}

function draftFile({ title, category, origin }) {
  const slug = slugify(title) || `draft-${Date.now()}`;
  const file = path.join(ARTICLES, `${slug}.md`);
  if (fs.existsSync(file)) throw new Error(`${path.relative(ROOT, file)} already exists`);
  const fm = {
    title, description: 'TODO: 120–160 characters summarising what changed and why it matters.',
    category, status: 'draft', publishedAt: today, author: 'AdSnoop Editorial', art: 'rings', artAlt: '',
    keywords: [], related: [],
    ...(origin ? { origin } : {}),
    sources: origin ? [{ title: origin.title, url: origin.url, publisher: origin.source }] : [],
  };
  const body = `${origin ? `<!-- Source: ${origin.source}, ${origin.date || 'date unknown'}: ${origin.url}
Feed summary (do not publish as-is): ${origin.summary || 'none'} -->

` : ''}TODO: Two or three sentences. What changed, who it affects, and the one thing to do about it.

## What Meta announced

<span class="ins-label">Verified</span> State only what the official source confirms, with dates. Link to it.

## What it means in practice

Explain mechanics and who is affected. Label anything that is interpretation or prediction as such.

:::impact
### Who this affects

### What changes

### Recommended action

### When no action is needed
:::
`;
  fs.writeFileSync(file, `---\n${YAML.stringify(fm)}---\n\n${body}`);
  return path.relative(ROOT, file);
}

const args = process.argv.slice(2);
if (args[0] === 'new') {
  const title = args.slice(1).join(' ').trim();
  if (!title) { console.error('Usage: npm run insights:new -- "Article title"'); process.exit(1); }
  console.log(`Created ${draftFile({ title, category: 'meta-updates' })} (status: draft). Edit it, then set status: published when it's ready.`);
  process.exit(0);
}

const res = await fetch(FEED, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(90000) });
if (!res.ok) { console.error(`Could not load ${FEED} (${res.status}).`); process.exit(1); }
const data = await res.json();
const covered = existing();
const items = (data.items || []).filter(i => !covered.has(norm(i.url))).slice(0, 25);

const d = args.indexOf('--draft');
if (d > -1) {
  const n = Number(args[d + 1]);
  const item = items[n - 1];
  if (!item) { console.error(`No item ${args[d + 1]}. Run without --draft to see the list.`); process.exit(1); }
  const category = TAG_TO_CATEGORY[(item.tags || []).find(t => TAG_TO_CATEGORY[t])] || 'meta-updates';
  const file = draftFile({ title: item.title, category, origin: { title: item.title, url: item.url, source: item.source, date: item.date?.slice(0, 10), summary: item.summary } });
  console.log(`Created ${file} (status: draft, category: ${category}).\nRewrite the headline and body in your own words before publishing.`);
  process.exit(0);
}

console.log(`\nNew Meta advertising updates not yet covered (${items.length})\n`);
items.forEach((i, n) => console.log(`${String(n + 1).padStart(2)}. ${i.official ? '[official] ' : ''}${i.title}\n    ${i.source} · ${i.date ? i.date.slice(0, 10) : 'no date'} · ${(i.tags || []).join(', ')}\n    ${i.url}\n`));
const bad = (data.sources || []).filter(s => !s.ok).map(s => s.name);
if (bad.length) console.log(`Sources unavailable right now: ${bad.join(', ')}`);
console.log('Create a draft with: npm run insights:news -- --draft <number>');
