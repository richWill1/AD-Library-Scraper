// Builds the AdSnoop Insights hub as static HTML before `next build`.
//
// Source:  content/insights/articles/*.md (YAML frontmatter + Markdown)
//          content/insights/categories.yml
// Output:  public/insights-pages/   (HTML, served at /insights via rewrites)
//          public/insights-art/     (SVG illustrations)
//          public/insights-assets/manifest.json (used by the social image route)
//          public/sitemap.xml       (existing pages + published articles)
//
// Pages are plain HTML, the same way the rest of the marketing site is built,
// so search engines get the full article without running JavaScript and the
// pages ship only a small progressive-enhancement script.
//
// Drafts (status: draft) are only built on the preview service or when
// INSIGHTS_DRAFTS=1. They are always noindex and never in the sitemap.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Marked } from 'marked';
import YAML from 'yaml';
import { renderArt, ART_KEYS } from './insights/art.mjs';
import { renderFigure } from './insights/figures.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://adsnoop.co.uk';
const CONTENT = path.join(ROOT, 'content/insights');
const OUT = path.join(ROOT, 'public/insights-pages');
const ART_OUT = path.join(ROOT, 'public/insights-art');
const ASSETS = path.join(ROOT, 'public/insights-assets');
const PREVIEW_SERVICE = 'srv-dbu68pp42hec73bmqgog';
const SHOW_DRAFTS = process.env.INSIGHTS_DRAFTS === '1' || process.env.RENDER_SERVICE_ID === PREVIEW_SERVICE;
const WPM = 230;

// ---------- helpers ----------
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const slugify = s => String(s).toLowerCase().replace(/&/g, ' and ').replace(/<[^>]+>/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const fmtDate = d => new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const isoDate = d => new Date(d + 'T00:00:00Z').toISOString().slice(0, 10);
const hash = s => crypto.createHash('sha256').update(s).digest('hex').slice(0, 10);
const json = o => JSON.stringify(o).replace(/</g, '\\u003c');
function fail(msg) { console.error(`\n[insights] ${msg}\n`); process.exit(1); }
function write(file, text) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); }

// ---------- load content ----------
const categories = YAML.parse(fs.readFileSync(path.join(CONTENT, 'categories.yml'), 'utf8'));
const catBySlug = new Map(categories.map(c => [c.slug, c]));

function parseArticle(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!m) fail(`${file}: missing YAML frontmatter`);
  const meta = YAML.parse(m[1]);
  const slug = path.basename(file, '.md');
  const need = ['title', 'description', 'category', 'status', 'publishedAt'];
  for (const k of need) if (!meta[k]) fail(`${slug}: frontmatter is missing "${k}"`);
  if (!catBySlug.has(meta.category)) fail(`${slug}: unknown category "${meta.category}"`);
  if (!['draft', 'published'].includes(meta.status)) fail(`${slug}: status must be draft or published`);
  if (meta.art && !ART_KEYS.includes(meta.art)) fail(`${slug}: unknown art "${meta.art}" (use one of ${ART_KEYS.join(', ')})`);
  for (const k of ['publishedAt', 'updatedAt']) if (meta[k] instanceof Date) meta[k] = meta[k].toISOString().slice(0, 10);
  if (meta.description.length > 170) console.warn(`[insights] ${slug}: description is ${meta.description.length} characters (aim for 120–160)`);
  const words = m[2].replace(/:::[^\n]*|<[^>]+>|[#>*_`|[\]()-]/g, ' ').split(/\s+/).filter(Boolean).length;
  return { ...meta, slug, body: m[2], words, readingTime: Math.max(1, Math.round(words / WPM)), url: `/insights/${slug}` };
}

const all = fs.readdirSync(path.join(CONTENT, 'articles')).filter(f => f.endsWith('.md') && !f.startsWith('_'))
  .map(f => parseArticle(path.join(CONTENT, 'articles', f)));
const articles = all.filter(a => a.status === 'published' || SHOW_DRAFTS)
  .sort((a, b) => (b.publishedAt.localeCompare(a.publishedAt)) || ((b.featured ? 1 : 0) - (a.featured ? 1 : 0)) || a.title.localeCompare(b.title));
const live = articles.filter(a => a.status === 'published');
const bySlug = new Map(articles.map(a => [a.slug, a]));
for (const a of articles) for (const r of a.related || []) if (!all.some(x => x.slug === r)) fail(`${a.slug}: related article "${r}" does not exist`);

// ---------- angles worth testing ----------
// content/insights/angles/*.md: one creative angle each (frontmatter + "how to test" body).
// content/insights/angles/_week.yml: which two angles lead this week, plus the optional collection.
const ANGLES_DIR = path.join(CONTENT, 'angles');
function parseAngle(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!m) fail(`${file}: missing YAML frontmatter`);
  const meta = YAML.parse(m[1]);
  const slug = path.basename(file, '.md');
  for (const k of ['name', 'summary', 'why', 'status', 'examples']) if (!meta[k]) fail(`angle ${slug}: frontmatter is missing "${k}"`);
  if (!['draft', 'published'].includes(meta.status)) fail(`angle ${slug}: status must be draft or published`);
  for (const k of ['updatedAt']) if (meta[k] instanceof Date) meta[k] = meta[k].toISOString().slice(0, 10);
  for (const e of meta.examples) {
    for (const k of ['ad', 'page', 'brand', 'image']) if (!e[k]) fail(`angle ${slug}: an example is missing "${k}"`);
    e.ad = String(e.ad); e.page = String(e.page);
    if (!/^\d{1,30}$/.test(e.ad) || !/^\d{1,30}$/.test(e.page)) fail(`angle ${slug}: ad and page must be numeric IDs`);
    if (!/^https:\/\/media\.adsnoop\.co\.uk\//.test(e.image)) fail(`angle ${slug}: example images must come from media.adsnoop.co.uk`);
  }
  const brands = new Set(meta.examples.map(e => e.page)).size;
  return { ...meta, slug, body: m[2], brands, url: `/insights/angles/${slug}` };
}
const allAngles = fs.existsSync(ANGLES_DIR) ? fs.readdirSync(ANGLES_DIR).filter(f => f.endsWith('.md') && !f.startsWith('_')).map(f => parseAngle(path.join(ANGLES_DIR, f))) : [];
const angles = allAngles.filter(a => a.status === 'published' || SHOW_DRAFTS).sort((a, b) => b.brands - a.brands || a.name.localeCompare(b.name));
const liveAngles = angles.filter(a => a.status === 'published');
const angleWeek = fs.existsSync(path.join(ANGLES_DIR, '_week.yml')) ? YAML.parse(fs.readFileSync(path.join(ANGLES_DIR, '_week.yml'), 'utf8')) : null;
if (angleWeek) {
  if (angleWeek.week instanceof Date) angleWeek.week = angleWeek.week.toISOString().slice(0, 10);
  for (const s of angleWeek.featured || []) if (!allAngles.some(a => a.slug === s)) fail(`_week.yml: featured angle "${s}" does not exist`);
}

// ---------- markdown ----------
function renderMarkdown(article) {
  const toc = [];
  const used = new Set();
  const marked = new Marked({ gfm: true });
  marked.use({
    renderer: {
      heading({ tokens, depth }) {
        const text = this.parser.parseInline(tokens);
        if (depth === 1) fail(`${article.slug}: use ## for headings; the title is the only H1`);
        let id = slugify(text) || 'section', n = 2;
        while (used.has(id)) id = `${slugify(text)}-${n++}`;
        used.add(id);
        if (depth === 2) toc.push({ id, text: text.replace(/<[^>]+>/g, '') });
        return `<h${depth} id="${id}"><a class="ins-anchor" href="#${id}" aria-hidden="true" tabindex="-1">#</a>${text}</h${depth}>\n`;
      },
      table(token) {
        const head = token.header.map((c, i) => `<th scope="col"${token.align[i] ? ` style="text-align:${token.align[i]}"` : ''}>${this.parser.parseInline(c.tokens)}</th>`).join('');
        const rows = token.rows.map(r => `<tr>${r.map((c, i) => `<td${token.align[i] ? ` style="text-align:${token.align[i]}"` : ''}>${this.parser.parseInline(c.tokens)}</td>`).join('')}</tr>`).join('');
        return `<div class="ins-table" tabindex="0" role="region" aria-label="Table"><table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>\n`;
      },
      link({ href, title, tokens }) {
        const text = this.parser.parseInline(tokens);
        const external = /^https?:\/\//.test(href) && !href.startsWith(SITE);
        const internalArticle = href.match(/^\/insights\/([a-z0-9-]+)$/);
        if (internalArticle && !all.some(a => a.slug === internalArticle[1])) fail(`${article.slug}: links to missing article ${href}`);
        const product = /^\/(\?|tracker|seasonal|meta-updates|$)/.test(href);
        const attrs = [`href="${esc(href)}"`];
        if (title) attrs.push(`title="${esc(title)}"`);
        if (external) attrs.push('rel="noopener"');
        if (product) attrs.push('data-ins-cta="inline"');
        return `<a ${attrs.join(' ')}>${text}</a>`;
      },
    },
  });

  // Container blocks: :::type [attributes or title] ... :::
  const blocks = [];
  const src = article.body.replace(/^:::([a-z]+)([^\n]*)\n([\s\S]*?)^:::\s*$/gm, (_, type, rest, inner) => {
    blocks.push({ type, rest: rest.trim(), inner });
    return `\n<!--INSBLOCK${blocks.length - 1}-->\n`;
  });
  const attrsOf = s => Object.fromEntries([...s.matchAll(/([a-z]+)="([^"]*)"/g)].map(m => [m[1], m[2]]));
  let html = marked.parse(src);
  html = html.replace(/<!--INSBLOCK(\d+)-->/g, (_, i) => {
    const { type, rest, inner } = blocks[+i];
    const body = () => marked.parse(inner);
    switch (type) {
      case 'impact': return `<section class="ins-impact" aria-label="What this means for advertisers"><p class="ins-impact-kicker"><span class="ins-dot"></span>What this means for advertisers</p>${body()}</section>`;
      case 'example': return `<aside class="ins-callout ins-example"><p class="ins-callout-label">Hypothetical example${rest ? ` · ${esc(rest)}` : ''}</p>${body()}</aside>`;
      case 'verify': return `<aside class="ins-callout ins-verify"><p class="ins-callout-label">Check before you rely on this</p>${body()}</aside>`;
      case 'note': return `<aside class="ins-callout ins-note">${rest ? `<p class="ins-callout-label">${esc(rest)}</p>` : ''}${body()}</aside>`;
      case 'takeaways': return `<aside class="ins-takeaways" aria-label="Key takeaways"><p class="ins-callout-label">${esc(rest || 'Key takeaways')}</p>${body()}</aside>`;
      case 'figure': return renderFigure(rest);
      case 'cta': {
        const a = attrsOf(rest);
        if (!a.href || !a.label) fail(`${article.slug}: :::cta needs href and label`);
        return ctaBlock({ heading: a.heading, text: marked.parseInline(inner.trim()), href: a.href, label: a.label, placement: a.placement || 'inline' });
      }
      default: fail(`${article.slug}: unknown block :::${type}`);
    }
  });
  return { html, toc };
}

function ctaBlock({ heading, text, href, label, placement }) {
  return `<aside class="ins-cta" data-placement="${esc(placement)}"><div class="ins-cta-eyes" aria-hidden="true"><i></i><i></i></div><div class="ins-cta-copy">${heading ? `<p class="ins-cta-h">${esc(heading)}</p>` : ''}<p>${text}</p></div><a class="ins-btn" href="${esc(href)}" data-ins-cta="${esc(placement)}">${esc(label)} <span aria-hidden="true">→</span></a></aside>`;
}

// ---------- shared chrome, reused from the existing site ----------
const metaUpdates = fs.readFileSync(path.join(ROOT, 'public/live/meta-updates.html'), 'utf8');
const headerSrc = metaUpdates.match(/<header class="topnav[\s\S]*?<\/header>/)?.[0];
const footerSrc = metaUpdates.match(/<footer class="pg-foot">[\s\S]*?<\/footer>/)?.[0];
const consentSrc = metaUpdates.match(/<aside id="analytics-choice"[\s\S]*?<\/aside>/)?.[0];
if (!headerSrc || !footerSrc || !consentSrc) fail('could not read the shared header/footer from public/live/meta-updates.html');
if (!headerSrc.includes('href="/insights"')) fail('the site header has no Insights link; add it to public/live/*.html first');
const header = headerSrc
  .replace(/<a class="nav-btn" href="\/insights"[^>]*>/, '<a class="nav-btn active" href="/insights" aria-current="page">');
const footer = footerSrc;

const cssFile = path.join(ASSETS, 'insights.css'), jsFile = path.join(ASSETS, 'insights.js');
const cssV = hash(fs.readFileSync(cssFile, 'utf8')), jsV = hash(fs.readFileSync(jsFile, 'utf8'));

function page({ title, description, canonical, ogImage, ogType = 'website', jsonLd = [], body, noindex, pageData, extraHead = '' }) {
  return `<!doctype html><html lang="en-GB"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#090e20">
<title>${esc(title)}</title><meta name="description" content="${esc(description)}">
<link rel="canonical" href="${SITE}${canonical}"><meta name="robots" content="${noindex ? 'noindex, follow' : 'index, follow, max-image-preview:large'}">
<meta property="og:type" content="${ogType}"><meta property="og:site_name" content="AdSnoop"><meta property="og:locale" content="en_GB"><meta property="og:url" content="${SITE}${canonical}">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:image" content="${SITE}${ogImage}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(description)}"><meta name="twitter:image" content="${SITE}${ogImage}">
<link rel="icon" type="image/svg+xml" href="/favicon.svg"><link rel="icon" type="image/svg+xml" media="(prefers-color-scheme: dark)" href="/brand/favicon-dark.svg">
<link rel="alternate" type="application/rss+xml" title="AdSnoop Insights" href="/insights/feed.xml">
<link rel="stylesheet" href="/live/header.css"><link rel="stylesheet" href="/insights-assets/insights.css?v=${cssV}">${extraHead}
${jsonLd.map(o => `<script type="application/ld+json">${json(o)}</script>`).join('')}
</head><body${pageData ? ` data-ins='${esc(JSON.stringify(pageData))}'` : ''}>
<a href="#main" class="ins-skip">Skip to content</a>
${header}
${body}
${footer}
${consentSrc}
<script src="/brand/eyes-interaction.js" defer></script><script src="/live/site.js" defer></script><script src="/live/analytics-choice.js" defer></script><script src="/insights-assets/insights.js?v=${jsV}" defer></script>
</body></html>`;
}

const ORG = { '@type': 'Organization', name: 'AdSnoop', url: SITE + '/', logo: { '@type': 'ImageObject', url: SITE + '/brand/adsnoop-wordmark-dark.svg' } };
const crumbs = items => ({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: items.map(([name, url], i) => ({ '@type': 'ListItem', position: i + 1, name, item: SITE + url })) });

// ---------- components ----------
const artUrl = a => `/insights-art/${a.slug}.svg`;
const catChip = (c, tag = 'span') => `<${tag} class="ins-chip" style="--c:${c.colour}"${tag === 'a' ? ` href="/insights/category/${c.slug}" data-ins-cat="${c.slug}"` : ''}>${esc(c.name)}</${tag}>`;
const draftBadge = a => a.status === 'draft' ? '<span class="ins-draft-badge">Draft</span>' : '';

function card(a, { size = 'md', eager = false, placement = 'grid', dup = false } = {}) {
  const c = catBySlug.get(a.category);
  const dims = size === 'lg' ? 'width="1200" height="675"' : 'width="600" height="338"';
  return `<article class="ins-card ins-card-${size}${dup ? ' ins-dup' : ''}" style="--c:${c.colour}" data-search="${esc([a.title, a.description, c.name, ...(a.keywords || [])].join(' ').toLowerCase())}">
<a class="ins-card-link" href="${a.url}" data-ins-related="${placement}"><div class="ins-card-media"><img src="${artUrl(a)}" alt="${esc(a.artAlt || '')}" ${dims} ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async"></div>
<div class="ins-card-body"><p class="ins-card-meta">${catChip(c)}${draftBadge(a)}</p><h3>${esc(a.title)}</h3><p class="ins-card-desc">${esc(a.description)}</p>
<p class="ins-card-foot"><time datetime="${isoDate(a.publishedAt)}">${fmtDate(a.publishedAt)}</time><span aria-hidden="true">·</span><span>${a.readingTime} min read</span></p></div></a></article>`;
}

const categoryNav = (active) => `<nav class="ins-catnav" aria-label="Insights categories"><a href="/insights" class="ins-catnav-all"${!active ? ' aria-current="page"' : ''}>All insights</a>${categories.map(c => `<a href="/insights/category/${c.slug}" data-ins-cat="${c.slug}" style="--c:${c.colour}"${active === c.slug ? ' aria-current="page"' : ''}><i aria-hidden="true"></i>${esc(c.name)}</a>`).join('')}</nav>`;

const productBand = (placement) => `<section class="ins-band" aria-labelledby="band-${placement}"><div class="ins-wrap ins-band-in">
<div><p class="ins-eyebrow">From reading to research</p><h2 id="band-${placement}">See what your competitors are running on Meta.</h2><p>Search any advertiser to explore their live Facebook and Instagram ads, creative mix and messaging themes.</p></div>
<form class="ins-band-form" action="/" method="get" data-ins-search-form="${placement}"><label class="sr-only" for="band-q-${placement}">Advertiser name or website</label><input id="band-q-${placement}" name="q" type="search" maxlength="120" placeholder="Search an advertiser or website…" autocomplete="off" required><button type="submit" class="ins-btn">Search ads <span aria-hidden="true">→</span></button></form>
</div></section>`;

// ---------- pages ----------
function articlePage(a) {
  const c = catBySlug.get(a.category);
  const { html, toc } = renderMarkdown(a);
  const related = (a.related || []).map(s => bySlug.get(s)).filter(Boolean);
  for (const x of articles) if (related.length < 3 && x !== a && !related.includes(x) && x.category === a.category) related.push(x);
  for (const x of articles) if (related.length < 3 && x !== a && !related.includes(x)) related.push(x);
  const updated = a.updatedAt && a.updatedAt !== a.publishedAt ? a.updatedAt : null;
  const sources = (a.sources || []).map(s => `<li><a href="${esc(s.url)}" rel="noopener">${esc(s.title)}</a>${s.publisher ? ` <span>${esc(s.publisher)}</span>` : ''}${s.note ? ` <em>${esc(s.note)}</em>` : ''}</li>`).join('');
  const cta = a.cta ? ctaBlock({ heading: a.cta.heading, text: esc(a.cta.text), href: a.cta.href, label: a.cta.label, placement: 'article_end' }) : '';
  const ogImage = `/insights-og/${a.slug}`;
  const body = `<div class="ins-progress" aria-hidden="true"><i></i></div>
<main id="main" class="ins-article" style="--c:${c.colour}">
${a.status === 'draft' ? '<div class="ins-draft-bar" role="note">Draft preview: this article is not published, not indexed and is hidden on the live site.</div>' : ''}
<header class="ins-article-head ins-wrap"><nav class="ins-crumbs" aria-label="Breadcrumb"><ol><li><a href="/insights">Insights</a></li><li><a href="/insights/category/${c.slug}" data-ins-cat="${c.slug}">${esc(c.name)}</a></li></ol></nav>
<p class="ins-article-kicker">${catChip(c, 'a')}${draftBadge(a)}</p>
<h1>${esc(a.title)}</h1><p class="ins-dek">${esc(a.description)}</p>
<p class="ins-byline"><span class="ins-author"><span class="ins-author-mark" aria-hidden="true"><i></i><i></i></span>${esc(a.author || 'AdSnoop Editorial')}</span><span>Published <time datetime="${isoDate(a.publishedAt)}">${fmtDate(a.publishedAt)}</time></span>${updated ? `<span>Updated <time datetime="${isoDate(updated)}">${fmtDate(updated)}</time></span>` : ''}<span>${a.readingTime} min read</span></p></header>
<div class="ins-wrap ins-hero-figure"><img src="${artUrl(a)}" alt="${esc(a.artAlt || '')}" width="1200" height="675" fetchpriority="high" decoding="async"></div>
<div class="ins-wrap ins-article-grid${toc.length >= 4 ? ' has-toc' : ''}">
${toc.length >= 4 ? `<nav class="ins-toc" aria-label="On this page"><p>On this page</p><ol>${toc.map(t => `<li><a href="#${t.id}">${esc(t.text)}</a></li>`).join('')}</ol></nav>` : ''}
<article class="ins-prose">${html}
${sources ? `<section class="ins-sources" aria-labelledby="sources-h"><h2 id="sources-h">Sources and further reading</h2><ol>${sources}</ol><p class="ins-sources-note">We link to original documentation wherever possible. Platform features and interfaces change, so check the source if something looks different in your account.</p></section>` : ''}
${cta}
</article></div>
${related.length ? `<section class="ins-related ins-wrap" aria-labelledby="related-h"><div class="ins-section-head"><h2 id="related-h">Keep reading</h2><a href="/insights" class="ins-more">All insights <span aria-hidden="true">→</span></a></div><div class="ins-grid">${related.slice(0, 3).map(r => card(r, { placement: 'related' })).join('')}</div></section>` : ''}
</main>
${productBand('article')}`;
  const ld = [
    { '@context': 'https://schema.org', '@type': 'BlogPosting', headline: a.title, description: a.description, image: [SITE + ogImage], datePublished: isoDate(a.publishedAt), dateModified: isoDate(updated || a.publishedAt), author: { '@type': 'Organization', name: a.author || 'AdSnoop Editorial', url: SITE + '/insights' }, publisher: ORG, mainEntityOfPage: { '@type': 'WebPage', '@id': SITE + a.url }, articleSection: c.name, inLanguage: 'en-GB', wordCount: a.words, keywords: (a.keywords || []).join(', ') || undefined, isAccessibleForFree: true },
    crumbs([['Insights', '/insights'], [c.name, `/insights/category/${c.slug}`], [a.title, a.url]]),
  ];
  return page({
    title: `${a.seoTitle || a.title} | AdSnoop`, description: a.description, canonical: a.url, ogImage, ogType: 'article', jsonLd: ld, body, noindex: a.status === 'draft',
    pageData: { type: 'article', slug: a.slug, category: a.category },
    extraHead: `<meta property="article:published_time" content="${isoDate(a.publishedAt)}">${updated ? `<meta property="article:modified_time" content="${isoDate(updated)}">` : ''}<meta property="article:section" content="${esc(c.name)}">`,
  });
}

function hubPage() {
  const featured = articles.find(a => a.featured) || articles[0];
  const side = articles.filter(a => a !== featured).slice(0, 2);
  const counts = Object.fromEntries(categories.map(c => [c.slug, articles.filter(a => a.category === c.slug).length]));
  const body = `<main id="main" class="ins-hub">
<section class="ins-hero" data-fx="signals"><canvas class="fx-canvas" aria-hidden="true"></canvas><div class="ins-wrap ins-hero-in">
<p class="ins-eyebrow">AdSnoop Insights</p><h1>Meta Ads Intelligence.<br><span>Without the Noise.</span></h1>
<p class="ins-lede">Stay ahead of Meta advertising updates, creative trends and performance strategies. Practical insights for advertisers who want to know what’s changing — and what to do about it.</p>
<form class="ins-search" role="search" action="/insights" method="get" data-ins-search><svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true"><circle cx="11" cy="11" r="7.5" stroke="currentColor" stroke-width="1.8"/><path d="m16.5 16.5 5 5" stroke="currentColor" stroke-width="1.8"/></svg><label class="sr-only" for="ins-q">Search Insights</label><input id="ins-q" name="q" type="search" placeholder="Search articles: ROAS, creative fatigue, Conversions API…" autocomplete="off" maxlength="80"></form>
${categoryNav(null)}
</div></section>
${featured ? `<section class="ins-wrap ins-featured" aria-labelledby="featured-h"><h2 id="featured-h" class="sr-only">Featured</h2><div class="ins-featured-grid">${card(featured, { size: 'lg', eager: true, placement: 'featured' })}<div class="ins-featured-side">${side.map(a => card(a, { size: 'sm', placement: 'featured' })).join('')}</div></div></section>` : ''}
${anglesHubSection()}
<section class="ins-wrap ins-all" aria-labelledby="all-h"><div class="ins-section-head"><h2 id="all-h">More insights</h2><p class="ins-results" aria-live="polite" id="ins-results"></p></div>
<div class="ins-grid" id="ins-grid">${articles.map(a => card(a, { dup: featured && (a === featured || side.includes(a)) && articles.length > 3 })).join('')}</div>
<div class="ins-empty" id="ins-empty" hidden><p><strong>No articles match that search yet.</strong></p><p>Try a broader term, browse a topic below, or search competitor ads directly with AdSnoop.</p></div></section>
<section class="ins-wrap ins-topics" aria-labelledby="topics-h"><div class="ins-section-head"><h2 id="topics-h">Browse by topic</h2></div><div class="ins-topic-grid">
${categories.map(c => `<a class="ins-topic" href="/insights/category/${c.slug}" data-ins-cat="${c.slug}" style="--c:${c.colour}"><span class="ins-topic-orb" aria-hidden="true"></span><h3>${esc(c.name)}</h3><p>${esc(c.description)}</p><span class="ins-topic-count">${counts[c.slug] ? `${counts[c.slug]} article${counts[c.slug] > 1 ? 's' : ''}` : 'Coming soon'}</span></a>`).join('')}
</div></section>
<section class="ins-wrap ins-live" aria-labelledby="live-h"><div class="ins-live-card"><div><p class="ins-eyebrow"><span class="ins-pulse" aria-hidden="true"></span>Live feed</p><h2 id="live-h">Meta advertising news, as it happens</h2><p>Headlines from Meta’s own newsroom and developer blog, plus trusted industry sources, filtered for advertisers.</p></div><a class="ins-btn ins-btn-ghost" href="/meta-updates" data-ins-cta="hub_live_feed">Open Meta updates <span aria-hidden="true">→</span></a></div></section>
</main>
${productBand('hub')}
<script type="application/json" id="ins-index">${json(articles.map(a => ({ s: a.slug, t: a.title, d: a.description, c: catBySlug.get(a.category).name, k: (a.keywords || []).join(' ') })))}</script>
<script src="/live/hero-fx.js" defer></script>`;
  const ld = [
    { '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'AdSnoop Insights', description: 'Practical Meta advertising analysis for paid media teams.', url: SITE + '/insights', inLanguage: 'en-GB', publisher: ORG, mainEntity: { '@type': 'ItemList', itemListElement: live.map((a, i) => ({ '@type': 'ListItem', position: i + 1, url: SITE + a.url, name: a.title })) } },
    crumbs([['Insights', '/insights']]),
  ];
  return page({ title: 'Meta Ads Insights: Strategy, Creative & Measurement | AdSnoop', description: 'Practical Meta advertising insights for paid media teams: platform updates, creative strategy, measurement and competitor research, explained clearly.', canonical: '/insights', ogImage: '/insights-og/hub', jsonLd: ld, body, pageData: { type: 'hub' } });
}

function categoryPage(c) {
  const list = articles.filter(a => a.category === c.slug);
  const empty = list.filter(a => a.status === 'published').length === 0;
  const extra = c.slug === 'meta-updates' ? `<div class="ins-live-card ins-live-inline"><div><p class="ins-eyebrow"><span class="ins-pulse" aria-hidden="true"></span>Live feed</p><h2>Follow Meta changes as they happen</h2><p>While we write up the updates that matter most, the Meta updates feed tracks announcements from Meta and trusted industry sources.</p></div><a class="ins-btn ins-btn-ghost" href="/meta-updates" data-ins-cta="category_live_feed">Open Meta updates <span aria-hidden="true">→</span></a></div>` : '';
  const body = `<main id="main" class="ins-hub">
<section class="ins-hero ins-hero-cat" style="--c:${c.colour}"><div class="ins-wrap ins-hero-in"><nav class="ins-crumbs ins-crumbs-dark" aria-label="Breadcrumb"><ol><li><a href="/insights">Insights</a></li><li aria-current="page">${esc(c.name)}</li></ol></nav>
<h1>${esc(c.name)}</h1><p class="ins-lede">${esc(c.description)}</p>${categoryNav(c.slug)}</div></section>
<section class="ins-wrap ins-all" aria-label="${esc(c.name)} articles">${extra}
${list.length ? `<div class="ins-grid">${list.map(a => card(a)).join('')}</div>` : `<div class="ins-empty"><p><strong>First articles coming soon.</strong></p><p>In the meantime, explore the <a href="/insights">latest insights</a>.</p></div>`}
</section></main>
${productBand('category')}`;
  const ld = [
    { '@context': 'https://schema.org', '@type': 'CollectionPage', name: `${c.name} | AdSnoop Insights`, description: c.description, url: `${SITE}/insights/category/${c.slug}`, inLanguage: 'en-GB', publisher: ORG },
    crumbs([['Insights', '/insights'], [c.name, `/insights/category/${c.slug}`]]),
  ];
  return { html: page({ title: `${c.name}: Meta Ads Insights | AdSnoop`, description: c.description.slice(0, 160), canonical: `/insights/category/${c.slug}`, ogImage: '/insights-og/hub', jsonLd: ld, body, noindex: empty, pageData: { type: 'category', category: c.slug } }), indexable: !empty };
}

// ---------- angle components and pages ----------
const searchLink = e => `/?page=${e.page}&name=${encodeURIComponent(e.brand)}`;
const daysText = d => d ? `${d} day${d === 1 ? '' : 's'} live` : '';
const angleShot = (e, { eager = false, cls = '' } = {}) => `<img class="ang-shot${cls}" src="${esc(e.image)}" alt="${esc(`${e.brand} ad using this angle`)}" width="400" height="500" ${eager ? '' : 'loading="lazy" '}decoding="async">`;
const angleMeta = a => `<div class="ang-meta"><span class="pill pill-brands">${esc(a.countLabel || `${a.brands} UK brand${a.brands === 1 ? '' : 's'} in our sample`)}</span>${(a.sectors || []).slice(0, 1).map(s => `<span class="pill">${esc(s)}</span>`).join('')}${a.format ? `<span class="pill">${esc(a.format)}</span>` : ''}${a.status === 'draft' ? '<span class="ins-draft-badge">Draft</span>' : ''}</div>`;

function angleFeatureCard(a, place) {
  const e = a.examples[0];
  return `<article class="ang-card">
<a class="ang-ad" href="${a.url}" data-ang="${a.slug}" data-ang-place="${place}">${angleShot(e)}<span class="ang-ad-brand">${esc(e.brand)}</span></a>
<div class="ang-body">${angleMeta(a)}
<h3><a href="${a.url}" data-ang="${a.slug}" data-ang-place="${place}">${esc(a.name)}</a></h3>
<p class="ang-what">${esc(a.summary)}</p>
<div class="ang-why"><p class="ang-lbl">Why it works</p><p>${esc(a.why)}</p></div>
<div class="ang-actions"><a class="ins-btn ang-btn" href="${a.url}" data-ang="${a.slug}" data-ang-place="${place}">See ${a.examples.length} examples <span aria-hidden="true">→</span></a><a class="ins-btn ang-btn ang-btn-line" href="${searchLink(e)}" data-ins-cta="angle_${place}">View ${esc(e.brand)} ads</a></div>
</div></article>`;
}
const angleTile = (a, place) => `<a class="ang-tile" href="${a.url}" data-ang="${a.slug}" data-ang-place="${place}" data-sectors="${esc((a.sectors || []).join('|'))}"><img src="${esc(a.examples[0].image)}" alt="" width="88" height="110" loading="lazy" decoding="async"><span><b>${esc(a.name)}</b><small>${esc(a.countShort || `${a.brands} brand${a.brands === 1 ? '' : 's'}`)} · ${esc((a.sectors || [])[0] || '')}</small></span></a>`;

function anglesHubSection() {
  if (!angleWeek || !angles.length) return '';
  const featured = (angleWeek.featured || []).map(s => angles.find(a => a.slug === s)).filter(Boolean);
  if (!featured.length) return '';
  const rest = angles.filter(a => !featured.includes(a)).slice(0, 4);
  const brandCount = new Set(featured.flatMap(a => a.examples.map(e => e.page))).size;
  const col = angleWeek.collection;
  return `<section class="ins-wrap ang" aria-labelledby="ang-h">
<div class="ang-head"><div><p class="ins-eyebrow">Angles worth testing · Week of ${fmtDate(angleWeek.week).replace(/ \d{4}$/, '')}</p>
<h2 id="ang-h">${esc(angleWeek.headline || 'Creative angles worth testing this week')}</h2>
<p class="ang-sub">${esc(angleWeek.intro || `Spotted across ${brandCount} UK brands running ads right now, picked by the AdSnoop team.`)}</p></div>
<a class="ang-more" href="/insights/angles" data-ang="library" data-ang-place="hub">Explore all ${angles.length} angles <span aria-hidden="true">→</span></a></div>
<div class="ang-grid">${featured.map(a => angleFeatureCard(a, 'hub')).join('')}</div>
${rest.length ? `<div class="ang-strip">${rest.map(a => angleTile(a, 'hub_strip')).join('')}</div>` : ''}
${col && col.angle && angles.find(a => a.slug === col.angle) ? (() => { const ca = angles.find(a => a.slug === col.angle); return `<div class="ang-collection"><div><p class="ins-eyebrow">Collection of the week</p><h3>${esc(col.title)}</h3><p>${esc(col.text)}</p><a class="ins-btn ang-btn" href="${ca.url}" data-ang="${ca.slug}" data-ang-place="collection">View collection <span aria-hidden="true">→</span></a></div><div class="ang-stack">${ca.examples.slice(0, 3).map(e => angleShot(e)).join('')}</div></div>`; })() : ''}
</section>`;
}

function anglesLibraryPage() {
  const sectors = [...new Set(angles.flatMap(a => a.sectors || []))].sort();
  const body = `<main id="main" class="ins-hub">
<section class="ins-hero ins-hero-cat" style="--c:#8b5cf6"><div class="ins-wrap ins-hero-in"><nav class="ins-crumbs ins-crumbs-dark" aria-label="Breadcrumb"><ol><li><a href="/insights">Insights</a></li><li aria-current="page">Angles worth testing</li></ol></nav>
<h1>Creative angles worth testing</h1><p class="ins-lede">Formats and hooks that UK brands are running on Facebook and Instagram right now, with live examples and a note on how to test each one.</p>
${sectors.length > 1 ? `<nav class="ins-catnav ang-filter" aria-label="Filter angles by sector"><button type="button" aria-pressed="true" data-ang-sector="">All sectors</button>${sectors.map(s => `<button type="button" aria-pressed="false" data-ang-sector="${esc(s)}"><i aria-hidden="true"></i>${esc(s)}</button>`).join('')}</nav>` : ''}
</div></section>
<section class="ins-wrap ins-all" aria-label="All angles"><div class="ang-library" id="ang-library">${angles.map(a => `<article class="ang-lib-card" data-sectors="${esc((a.sectors || []).join('|'))}"><a href="${a.url}" data-ang="${a.slug}" data-ang-place="library"><div class="ang-lib-media">${a.examples.slice(0, 2).map(e => angleShot(e)).join('')}</div><div class="ang-lib-body">${angleMeta(a)}<h2>${esc(a.name)}</h2><p>${esc(a.summary)}</p></div></a></article>`).join('')}</div>
<p class="ang-note">Examples are UK ads that were live when we reviewed them. Counts show how many brands we found using each angle in our sample, not across all of Meta.</p></section></main>
${productBand('angles')}`;
  const ld = [
    { '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'Creative angles worth testing | AdSnoop Insights', url: `${SITE}/insights/angles`, inLanguage: 'en-GB', publisher: ORG },
    crumbs([['Insights', '/insights'], ['Angles worth testing', '/insights/angles']]),
  ];
  return page({ title: 'Meta Ad Creative Angles Worth Testing, With UK Examples | AdSnoop', description: 'Creative formats and hooks UK brands are running on Facebook and Instagram now, with live ad examples and how to test each angle.', canonical: '/insights/angles', ogImage: '/insights-og/hub', jsonLd: ld, body, noindex: !liveAngles.length, pageData: { type: 'angles' } });
}

function anglePage(a) {
  const others = angles.filter(x => x !== a).slice(0, 4);
  const html = new Marked({ gfm: true }).parse(a.body || '');
  const body = `<main id="main" class="ins-hub ang-page">
${a.status === 'draft' ? '<div class="ins-draft-bar" role="note">Draft preview: this angle is not published, not indexed and is hidden on the live site.</div>' : ''}
<header class="ins-wrap ang-page-head"><nav class="ins-crumbs" aria-label="Breadcrumb"><ol><li><a href="/insights">Insights</a></li><li><a href="/insights/angles">Angles worth testing</a></li></ol></nav>
<div class="ang-page-top"><div>${angleMeta(a)}<h1>${esc(a.name)}</h1><p class="ins-dek">${esc(a.summary)}</p>
<div class="ang-why"><p class="ang-lbl">Why it works</p><p>${esc(a.why)}</p></div></div>
<a class="ang-ad ang-ad-lg" href="${searchLink(a.examples[0])}" data-ins-cta="angle_page_hero">${angleShot(a.examples[0], { eager: true })}<span class="ang-ad-brand">${esc(a.examples[0].brand)}</span></a></div></header>
${html.trim() ? `<section class="ins-wrap"><div class="ins-prose ang-test">${html}</div></section>` : ''}
<section class="ins-wrap ang-examples" aria-labelledby="ex-h"><div class="ins-section-head"><h2 id="ex-h">${a.examples.length} live UK example${a.examples.length === 1 ? '' : 's'}</h2></div>
<div class="ang-ex-grid">${a.examples.map(e => `<a class="ang-ex" href="${searchLink(e)}" data-ins-cta="angle_example">${angleShot(e)}<span class="ang-ex-cap"><b>${esc(e.brand)}</b><small>${[e.sector, daysText(e.days)].filter(Boolean).map(esc).join(' · ')}</small>${e.note ? `<small class="ang-ex-note">${esc(e.note)}</small>` : ''}</span></a>`).join('')}</div>
<p class="ang-note">Click an example to see everything that brand is running now. Examples were live when we reviewed them${a.updatedAt ? ` on ${fmtDate(a.updatedAt)}` : ''} and may since have stopped.</p></section>
${others.length ? `<section class="ins-wrap ang-others" aria-labelledby="oth-h"><div class="ins-section-head"><h2 id="oth-h">More angles to test</h2><a href="/insights/angles" class="ins-more">All angles <span aria-hidden="true">→</span></a></div><div class="ang-strip">${others.map(o => angleTile(o, 'related')).join('')}</div></section>` : ''}
</main>
${productBand('angle')}`;
  const ld = [
    { '@context': 'https://schema.org', '@type': 'WebPage', name: `${a.name}: Meta ad angle with UK examples`, description: a.summary, url: SITE + a.url, inLanguage: 'en-GB', publisher: ORG },
    crumbs([['Insights', '/insights'], ['Angles worth testing', '/insights/angles'], [a.name, a.url]]),
  ];
  return page({ title: `${a.name}: Meta Ad Angle With UK Examples | AdSnoop`, description: `${a.summary}`.slice(0, 160), canonical: a.url, ogImage: '/insights-og/hub', jsonLd: ld, body, noindex: a.status === 'draft', pageData: { type: 'angle', slug: a.slug } });
}

function rss() {
  const items = live.slice(0, 30).map(a => `<item><title>${esc(a.title)}</title><link>${SITE}${a.url}</link><guid isPermaLink="true">${SITE}${a.url}</guid><pubDate>${new Date(a.publishedAt + 'T08:00:00Z').toUTCString()}</pubDate><category>${esc(catBySlug.get(a.category).name)}</category><description>${esc(a.description)}</description></item>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>AdSnoop Insights</title><link>${SITE}/insights</link><atom:link href="${SITE}/insights/feed.xml" rel="self" type="application/rss+xml"/><description>Practical Meta advertising insights for paid media teams.</description><language>en-gb</language>${items}</channel></rss>`;
}

// Existing indexable pages keep their place in the sitemap.
const STATIC_URLS = ['/', '/christmas-ads', '/black-friday-ads', '/meta-updates'];
function latestContentDate(list) {
  return list.map(a => a.updatedAt || a.publishedAt).sort().at(-1);
}

function sitemap(catIndexable) {
  const urls = [...STATIC_URLS.map(u => ({ loc: u })), { loc: '/insights', lastmod: latestContentDate(live) },
    ...categories.filter(c => catIndexable[c.slug]).map(c => ({
      loc: `/insights/category/${c.slug}`,
      lastmod: latestContentDate(live.filter(a => a.category === c.slug)),
    })),
    ...live.map(a => ({ loc: a.url, lastmod: a.updatedAt || a.publishedAt })),
    ...(liveAngles.length ? [{ loc: '/insights/angles', lastmod: liveAngles.map(a => a.updatedAt).filter(Boolean).sort().at(-1) }] : []),
    ...liveAngles.map(a => ({ loc: a.url, lastmod: a.updatedAt }))];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(u => `  <url>\n    <loc>${SITE}${u.loc}</loc>${u.lastmod ? `\n    <lastmod>${isoDate(u.lastmod)}</lastmod>` : ''}\n  </url>`).join('\n')}\n</urlset>\n`;
}

// ---------- write ----------
fs.rmSync(OUT, { recursive: true, force: true });
fs.rmSync(ART_OUT, { recursive: true, force: true });
for (const a of articles) {
  write(path.join(ART_OUT, `${a.slug}.svg`), renderArt(a.art, catBySlug.get(a.category).colour));
  write(path.join(OUT, `${a.slug}.html`), articlePage(a));
}
write(path.join(ART_OUT, 'hub.svg'), renderArt('rings', '#2f7bf6'));
write(path.join(OUT, 'index.html'), hubPage());
const catIndexable = {};
for (const c of categories) { const r = categoryPage(c); catIndexable[c.slug] = r.indexable; write(path.join(OUT, 'category', `${c.slug}.html`), r.html); }
if (angles.length) {
  write(path.join(OUT, 'angles', 'index.html'), anglesLibraryPage());
  for (const a of angles) write(path.join(OUT, 'angles', `${a.slug}.html`), anglePage(a));
}
write(path.join(OUT, 'feed.xml'), rss());
write(path.join(ROOT, 'public/sitemap.xml'), sitemap(catIndexable));
write(path.join(ASSETS, 'manifest.json'), JSON.stringify({
  hub: { title: 'Meta Ads Intelligence. Without the Noise.', category: 'AdSnoop Insights', colour: '#2f7bf6', art: 'hub' },
  ...Object.fromEntries(articles.map(a => [a.slug, { title: a.title, category: catBySlug.get(a.category).name, colour: catBySlug.get(a.category).colour, art: a.slug }])),
}, null, 1));

console.log(`[insights] built ${articles.length} article(s) (${live.length} published${SHOW_DRAFTS ? ', drafts shown' : ''}), ${categories.length} categories, ${angles.length} angle(s) (${liveAngles.length} published)`);
