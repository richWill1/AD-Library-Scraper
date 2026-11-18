import {NextRequest, NextResponse} from 'next/server';
import {directorySearch} from '@/lib/advertiser-directory';
export const runtime = 'nodejs';

// Seasonal ad trackers (Christmas, Black Friday). Built from the same live UK
// Ad Library search the site uses, shared by every visitor and cached, so it
// costs about a dozen Meta calls every few hours per event.
const ORIGIN = process.env.ADS_ORIGIN || 'https://ad-library-scraper-94t0.onrender.com';
const TTL = 4 * 3600 * 1000;
type Ad = {id: string; pageId: string; pageName: string; title: string; copy: string; start: string; reach: number | null; platforms?: string[]};
const EVENTS: Record<string, {name: string; terms: string[]; match: RegExp}> = {
  christmas: {name: 'Christmas', terms: ['christmas', 'xmas', 'festive', 'christmas gift'], match: /\b(christmas|xmas|festive|santa|stocking fillers?|secret santa|advent)\b/i},
  'black-friday': {name: 'Black Friday', terms: ['black friday', 'cyber monday', 'black friday deals'], match: /\b(black\s*friday|cyber\s*monday|cyber\s*week|black\s*week|blackfriday)\b/i}
};
const TACTICS: {id: string; label: string; re: RegExp}[] = [
  {id: 'discount', label: 'Percentage off', re: /\d{1,2}\s*%\s*off|up to \d{1,2}\s*%/i},
  {id: 'delivery', label: 'Free or fast delivery', re: /free (next[- ]day |standard |uk )?(delivery|shipping)|next[- ]day delivery/i},
  {id: 'urgency', label: 'Urgency and deadlines', re: /ends (tonight|soon|midnight|sunday|monday)|limited time|today only|last chance|while stocks last|hurry|final hours/i},
  {id: 'gifting', label: 'Gift ideas', re: /gift guide|gifts? for (him|her|them|everyone|kids|mum|dad)|perfect gift|gift ideas?|stocking fillers?/i},
  {id: 'deadline', label: 'Last order dates', re: /last (order|posting|delivery) dates?|order by|in time for christmas|arrive before christmas/i},
  {id: 'early', label: 'Early access and members', re: /early access|vip|members?( only| first| get)|sign up|subscribe/i},
  {id: 'bundle', label: 'Bundles and gift sets', re: /bundle|gift sets?|multi.?buy|\b3 for 2\b|buy one get/i},
  {id: 'personal', label: 'Personalised', re: /personali[sz]ed|monogram|engrav/i},
  {id: 'returns', label: 'Extended returns', re: /(extended|free) returns|returns until|christmas returns/i},
  {id: 'finance', label: 'Pay later', re: /klarna|clearpay|pay (later|in 3|monthly)|interest.free/i}
];
// Keyword search only returns the newest few hundred matching ads, so big
// retailers get crowded out. Their own pages are checked directly as well.
const MAJOR_PAGES: Record<string, string> = {Currys: '282722695080974', Argos: '108712049190071', 'Boots UK': '137917343831'};
const MAJOR_NAMES = ['John Lewis & Partners', 'John Lewis', 'AO.com', 'Very', 'Amazon', 'Lidl GB', 'Aldi UK', 'Tesco', "Sainsbury's", 'Marks and Spencer', 'M&S', 'JD Sports', 'Superdrug', 'Dunelm', 'IKEA UK', 'Next', 'ASOS', 'boohoo', 'Gymshark', 'Smyths Toys', 'The Perfume Shop', 'Ninja Kitchen UK', 'Dyson', 'Samsung UK', 'Selfridges', 'Debenhams', 'Wayfair UK', 'B&Q', 'Halfords', 'Matalan', 'Primark'];
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
let lastCall = 0;
async function paced() { const wait = lastCall + 3200 - Date.now(); if (wait > 0) await sleep(wait); lastCall = Date.now(); }
async function majorPages() {
  const pages = new Map<string, string>(Object.entries(MAJOR_PAGES).map(([n, id]) => [id, n]));
  for (const name of MAJOR_NAMES) {
    try { for (const p of await directorySearch(name)) if (p.score >= 5 && !pages.has(p.id)) pages.set(p.id, p.name); } catch {}
  }
  return [...pages.keys()].slice(0, 20);
}
const cache = new Map<string, {at: number; data: unknown}>();
const inflight = new Map<string, Promise<unknown>>();
const days = (start: string) => { const t = Date.parse(start + 'T00:00:00Z'); return Number.isFinite(t) ? Math.max(0, Math.floor((Date.now() - t) / 86400000)) : null; };

async function search(term: string, page = '', maxPages = 3) {
  const out: Ad[] = []; let after = '';
  for (let i = 0; i < maxPages; i++) {
    await paced();
    const p = new URLSearchParams({q: term, coverage: 'GB'}); if (page) p.set('page', page); if (after) p.set('after', after);
    const res = await fetch(`${ORIGIN}/api/ads?${p}`, {signal: AbortSignal.timeout(30000), cache: 'no-store', headers: {'x-adsnoop-internal': 'seasonal'}});
    if (!res.ok) break;
    const body = await res.json(); if (!Array.isArray(body.ads)) break;
    out.push(...body.ads); after = body.nextCursor || ''; if (!after) break;
  }
  return out;
}

async function build(key: string) {
  const ev = EVENTS[key];
  const seen = new Map<string, Ad>();
  const add = (list: Ad[]) => { for (const a of list) if (a && /^\d{1,30}$/.test(String(a.id)) && !seen.has(a.id)) seen.set(a.id, a); };
  for (const id of await majorPages()) { try { add(await search(id, id, 2)); } catch {} }
  for (const term of ev.terms) { try { add(await search(term)); } catch {} }
  const ads = [...seen.values()].filter(a => ev.match.test(`${a.title || ''}\n${a.copy || ''}`) && /^\d{1,30}$/.test(String(a.pageId)));
  // Advertisers
  const byPage = new Map<string, {id: string; name: string; ads: number; reach: number; first: string}>();
  for (const a of ads) { const e = byPage.get(a.pageId) || {id: a.pageId, name: a.pageName, ads: 0, reach: 0, first: a.start}; e.ads++; e.reach += a.reach || 0; if (a.start && (!e.first || a.start < e.first)) e.first = a.start; byPage.set(a.pageId, e); }
  const advertisers = [...byPage.values()].sort((x, y) => y.reach - x.reach || y.ads - x.ads).slice(0, 15);
  // Top ads: one per distinct message, ranked by UK reach then days live
  const copyKey = (a: Ad) => (a.copy || '').toLowerCase().replace(/\s+/g, ' ').slice(0, 90);
  const distinct = new Map<string, Ad>();
  for (const a of [...ads].sort((x, y) => (y.reach || 0) - (x.reach || 0) || (days(y.start) || 0) - (days(x.start) || 0))) { const k = a.pageId + '|' + copyKey(a); if (!distinct.has(k)) distinct.set(k, a); }
  const perBrand = new Map<string, number>();
  const top = [...distinct.values()].filter(a => { const n = perBrand.get(a.pageId) || 0; if (n >= 2) return false; perBrand.set(a.pageId, n + 1); return true; }).slice(0, 24)
    .map(a => ({id: a.id, pageId: a.pageId, pageName: a.pageName, title: a.title === 'Ad creative' ? '' : a.title, copy: (a.copy === 'No ad copy provided by Meta.' ? '' : a.copy).slice(0, 320), start: a.start, days: days(a.start), reach: a.reach}));
  // Launches per day, last 42 days
  const timeline: number[] = new Array(42).fill(0);
  for (const a of ads) { const d = days(a.start); if (d != null && d < 42) timeline[41 - d]++; }
  // Tactics and discount depth
  const tactics = TACTICS.map(t => ({id: t.id, label: t.label, ads: ads.filter(a => t.re.test(`${a.title}\n${a.copy}`)).length})).filter(t => t.ads).sort((x, y) => y.ads - x.ads);
  const depths: number[] = [];
  for (const a of ads) { const m = [...`${a.title}\n${a.copy}`.matchAll(/(\d{1,2})\s*%\s*off|up to (\d{1,2})\s*%/gi)].map(x => Number(x[1] || x[2])).filter(n => n >= 5 && n <= 90); if (m.length) depths.push(Math.max(...m)); }
  depths.sort((x, y) => x - y);
  const buckets = [[5, 19, 'Under 20%'], [20, 29, '20–29%'], [30, 39, '30–39%'], [40, 49, '40–49%'], [50, 90, '50% or more']].map(([lo, hi, label]) => ({label, ads: depths.filter(d => d >= (lo as number) && d <= (hi as number)).length}));
  return {
    event: key, name: ev.name, updatedAt: new Date().toISOString(),
    stats: {ads: ads.length, advertisers: byPage.size, newThisWeek: ads.filter(a => { const d = days(a.start); return d != null && d <= 7; }).length, withDiscount: depths.length, typicalDiscount: depths.length ? depths[Math.floor(depths.length / 2)] : null, deepest: depths.length ? depths[depths.length - 1] : null},
    timeline, advertisers, top, tactics, discounts: buckets
  };
}

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get('event') || '';
  if (!EVENTS[key]) return NextResponse.json({error: 'Unknown event.'}, {status: 400});
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return NextResponse.json(hit.data, {headers: {'Cache-Control': 'public, max-age=600'}});
  let work = inflight.get(key);
  if (!work) { work = build(key).then(d => { if ((d as {stats: {ads: number}}).stats.ads) cache.set(key, {at: Date.now(), data: d}); return d; }).finally(() => inflight.delete(key)); inflight.set(key, work); }
  try {
    // Serve stale data straight away while a refresh runs.
    const data = hit ? hit.data : await work;
    return NextResponse.json(data, {headers: {'Cache-Control': 'public, max-age=600'}});
  } catch { return NextResponse.json({error: 'Seasonal data is temporarily unavailable.'}, {status: 503}); }
}
