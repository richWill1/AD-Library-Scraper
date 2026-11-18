import {NextResponse} from 'next/server';
export const runtime = 'nodejs';

// Meta advertising news feed: public RSS feeds from Meta and specialist
// publishers, filtered to what matters for advertisers and tagged by topic.
// Each item links to the original article; only the feed's own short summary is shown.
const SOURCES = [
  {id: 'meta-newsroom', name: 'Meta Newsroom', url: 'https://about.fb.com/news/feed/', official: true},
  {id: 'meta-developers', name: 'Meta for Developers', url: 'https://developers.facebook.com/blog/feed/', official: true},
  {id: 'jon-loomer', name: 'Jon Loomer', url: 'https://www.jonloomer.com/feed/', official: false},
  {id: 'social-media-today', name: 'Social Media Today', url: 'https://www.socialmediatoday.com/feeds/news/', official: false}
];
const TAGS: {tag: string; re: RegExp}[] = [
  {tag: 'Ads & campaigns', re: /advantage\+|ads manager|\bcampaigns?\b|advertis|ad (formats?|placements?|delivery|auction)|\bbudget|bidding|\bcreatives?\b|\bads?\b/i},
  {tag: 'AI & automation', re: /\bai\b|generative|llama|meta ai|automat|andromeda/i},
  {tag: 'Measurement', re: /pixel|conversions api|\bcapi\b|attribution|measurement|reporting|incrementality|\blift\b|analytics/i},
  {tag: 'Formats & placements', re: /\breels\b|stories|threads|whatsapp|marketplace|\bvideo\b|carousel|partnership ads|creator/i},
  {tag: 'Policy & privacy', re: /polic(y|ies)|privacy|regulat|\bdsa\b|consent|brand safety|transparency|ad library|subscription|ad-free/i},
  {tag: 'Business tools', re: /business (suite|ai|tools?|messaging)|\bshops?\b|commerce|meta verified|business manager|marketing api|graph api/i}
];
const META_TOPIC = /\b(meta|facebook|instagram|threads|whatsapp|messenger|reels|advantage\+|ads manager)\b/i;
let cached: {at: number; data: unknown} | null = null;
let inflight: Promise<unknown> | null = null;

const decode = (s: string) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, ' ')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
  .replace(/\s+/g, ' ').trim();
const field = (xml: string, names: string[]) => { for (const n of names) { const m = xml.match(new RegExp(`<${n}(?:\\s[^>]*)?>([\\s\\S]*?)</${n}>`, 'i')); if (m) return m[1]; } return ''; };
const linkOf = (xml: string) => { const t = decode(field(xml, ['link'])); if (/^https?:\/\//.test(t)) return t; const m = xml.match(/<link[^>]*href="([^"]+)"/i); return m ? m[1] : ''; };
const clip = (s: string, n: number) => s.length <= n ? s : s.slice(0, s.lastIndexOf(' ', n) > n * 0.6 ? s.lastIndexOf(' ', n) : n).replace(/[,.;:\s]+$/, '') + '…';

async function read(source: typeof SOURCES[number]) {
  const res = await fetch(source.url, {headers: {'user-agent': 'AdSnoopBot/1.0 (+https://adsnoop.co.uk)', accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml'}, signal: AbortSignal.timeout(10000), cache: 'no-store'});
  if (!res.ok) throw Error(String(res.status));
  const xml = (await res.text()).slice(0, 3_000_000);
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>|<entry[\s>][\s\S]*?<\/entry>/gi) || [];
  return blocks.slice(0, 40).map(b => {
    const title = decode(field(b, ['title'])), url = linkOf(b);
    const date = Date.parse(decode(field(b, ['pubDate', 'published', 'updated', 'dc:date'])));
    const summary = clip(decode(field(b, ['description', 'summary', 'content:encoded', 'content'])).replace(/\s*The post [\s\S]*$/, '').replace(/\s*(Continue reading|Read more)[\s\S]*$/i, ''), 220);
    const text = `${title} ${summary}`;
    const tags = TAGS.filter(t => t.re.test(text)).map(t => t.tag);
    return {title: clip(title, 160), url, date: Number.isFinite(date) ? new Date(date).toISOString() : null, summary, tags, source: source.name, official: source.official, text};
  }).filter(i => i.title && /^https?:\/\//.test(i.url) && i.tags.length && (source.official ? i.tags.some(t => ['Ads & campaigns', 'Measurement', 'Policy & privacy', 'Business tools'].includes(t)) && /advertis|\bads?\b|business|marketing|brand|creator|measurement|api|commerce|polic/i.test(i.text) : META_TOPIC.test(i.text)))
    .map(({text: _t, ...rest}) => rest);
}

async function load() {
  const results = await Promise.allSettled(SOURCES.map(read));
  const items = results.flatMap(r => r.status === 'fulfilled' ? r.value : []);
  const seen = new Set<string>();
  const unique = items.filter(i => { const k = i.url.replace(/[?#].*$/, ''); if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 80);
  return {items: unique, sources: SOURCES.map((s, i) => ({name: s.name, official: s.official, ok: results[i].status === 'fulfilled'})), updatedAt: new Date().toISOString()};
}

export async function GET() {
  if (!cached || Date.now() - cached.at > 3600 * 1000) {
    if (!inflight) inflight = load().then(d => { if ((d as {items: unknown[]}).items.length) cached = {at: Date.now(), data: d}; return d; }).finally(() => { inflight = null; });
    if (!cached) { try { const d = await inflight; return NextResponse.json(d, {headers: {'Cache-Control': 'public, max-age=900'}}); } catch { return NextResponse.json({items: [], error: 'Updates are temporarily unavailable.'}, {status: 503}); } }
  }
  return NextResponse.json(cached!.data, {headers: {'Cache-Control': 'public, max-age=900'}});
}
