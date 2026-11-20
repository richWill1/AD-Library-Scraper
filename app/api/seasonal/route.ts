import {NextRequest, NextResponse} from 'next/server';
import {directorySearch} from '@/lib/advertiser-directory';
import {metaFetch} from '@/lib/meta-api';
import {getMetaCredential} from '@/lib/meta-token-store';
import {readSnapshot,writeSnapshot} from '@/lib/creative-store';
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
// Page IDs verified in Meta's Ad Library advertiser search.
const MAJOR_PAGES: Record<string, string> = {Currys: '282722695080974', Argos: '108712049190071', 'Boots UK': '137917343831', 'John Lewis & Partners': '145210795501787', 'Amazon.co.uk': '136154403098698'};
const MAJOR_NAMES = ['John Lewis & Partners', 'John Lewis', 'AO.com', 'Very', 'Amazon', 'Lidl GB', 'Aldi UK', 'Tesco', "Sainsbury's", 'Marks and Spencer', 'M&S', 'JD Sports', 'Superdrug', 'Dunelm', 'IKEA UK', 'Next', 'ASOS', 'boohoo', 'Gymshark', 'Smyths Toys', 'The Perfume Shop', 'Ninja Kitchen UK', 'Dyson', 'Samsung UK', 'Selfridges', 'Debenhams', 'Wayfair UK', 'B&Q', 'Halfords', 'Matalan', 'Primark'];
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
let lastCall = 0, failures = 0;
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

// On the live site, ask Meta directly: no internal rate limit to pace around, so
// searches run a few at a time and a full build takes seconds rather than minutes.
let directToken = '';
async function directSearch(term: string, page = '', maxPages = 3) {
  const out: Ad[] = []; let after = '';
  for (let i = 0; i < maxPages; i++) {
    const p = new URLSearchParams({ad_reached_countries: '["GB"]', ad_type: 'ALL', ad_active_status: 'ACTIVE', limit: '100', fields: 'id,page_id,page_name,ad_creative_bodies,ad_creative_link_titles,ad_delivery_start_time,total_reach_by_location,publisher_platforms'});
    if (page) p.set('search_page_ids', JSON.stringify([page])); else p.set('search_terms', term);
    if (after) p.set('after', after);
    let body: any;
    try { const res = await metaFetch(`https://graph.facebook.com/v26.0/ads_archive?${p}`, {headers: {Authorization: `Bearer ${directToken}`}, signal: AbortSignal.timeout(25000), cache: 'no-store'}); body = await res.json(); } catch { failures++; break; }
    if (body?.error || !Array.isArray(body?.data)) { failures++; break; }
    for (const a of body.data) {
      const bodies = [...new Set<string>((a.ad_creative_bodies || []).map((x: string) => String(x).trim()).filter(Boolean))];
      const reach = a.total_reach_by_location?.find((r: any) => (r.key ?? r.location) === 'GB')?.value;
      out.push({id: String(a.id), pageId: String(a.page_id || ''), pageName: String(a.page_name || ''), title: String((a.ad_creative_link_titles || [])[0] || ''), copy: bodies.join('\n\n'), start: String(a.ad_delivery_start_time || '').slice(0, 10), reach: typeof reach === 'number' ? reach : null, platforms: a.publisher_platforms || []});
    }
    after = body.paging?.next ? body.paging?.cursors?.after || '' : ''; if (!after) break;
  }
  return out;
}
async function pool<T>(items: T[], n: number, fn: (x: T) => Promise<void>) { let i = 0; await Promise.all(Array.from({length: n}, async () => { while (i < items.length) { const x = items[i++]; try { await fn(x); } catch {} } })); }

async function search(term: string, page = '', maxPages = 3) {
  if (directToken) return directSearch(term, page, maxPages);
  const out: Ad[] = []; let after = '';
  for (let i = 0; i < maxPages; i++) {
    await paced();
    const p = new URLSearchParams({q: term, coverage: 'GB'}); if (page) p.set('page', page); if (after) p.set('after', after);
    let res = await fetch(`${ORIGIN}/api/ads?${p}`, {signal: AbortSignal.timeout(30000), cache: 'no-store', headers: {'x-adsnoop-internal': 'seasonal'}});
    // The ads endpoint allows 20 requests a minute per caller: wait and retry once.
    if (res.status === 429) { await sleep(20000); lastCall = Date.now(); res = await fetch(`${ORIGIN}/api/ads?${p}`, {signal: AbortSignal.timeout(30000), cache: 'no-store'}); }
    if (!res.ok) { failures++; break; }
    const body = await res.json(); if (!Array.isArray(body.ads)) break;
    out.push(...body.ads); after = body.nextCursor || ''; if (!after) break;
  }
  return out;
}

async function build(key: string) {
  const ev = EVENTS[key];
  failures = 0;
  const seen = new Map<string, Ad>();
  const add = (list: Ad[]) => { for (const a of list) if (a && /^\d{1,30}$/.test(String(a.id)) && !seen.has(a.id)) seen.set(a.id, a); };
  try { directToken = (await getMetaCredential()).token || ''; } catch { directToken = ''; }
  const jobs: [string, string, number][] = [...(await majorPages()).map(id => [id, id, 2] as [string, string, number]), ...ev.terms.map(t => [t, '', 3] as [string, string, number])];
  // Direct: four at a time. Through the shared ads endpoint: one at a time, paced.
  await pool(jobs, directToken ? 4 : 1, async ([term, page, n]) => { add(await search(term, page, n)); });
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
    event: key, name: ev.name, updatedAt: new Date().toISOString(), partial: failures > 0,
    stats: {ads: ads.length, advertisers: byPage.size, newThisWeek: ads.filter(a => { const d = days(a.start); return d != null && d <= 7; }).length, withDiscount: depths.length, typicalDiscount: depths.length ? depths[Math.floor(depths.length / 2)] : null, deepest: depths.length ? depths[depths.length - 1] : null},
    timeline, advertisers, top, tactics, discounts: buckets
  };
}

function refresh(key: string) {
  let work = inflight.get(key);
  if (!work) {
    work = build(key).then(d => { if ((d as {stats: {ads: number}}).stats.ads) { cache.set(key, {at: Date.now(), data: d}); if (!(d as {partial?: boolean}).partial) writeSnapshot('seasonal-' + key, JSON.stringify(d)); } return d; }).finally(() => inflight.delete(key));
    inflight.set(key, work);
  }
  return work;
}
// Keep both trackers fresh in the background on the live site, so nobody waits for a build.
let scheduled = false;
function scheduleRefresh() {
  if (scheduled || process.env.RENDER_SERVICE_ID !== 'srv-db3ufoad0e5s73f5dudg') return;
  scheduled = true;
  const tick = async () => { for (const k of Object.keys(EVENTS)) { const h = cache.get(k); if (!h || Date.now() - h.at > TTL - 15 * 60000) { try { await refresh(k); } catch {} } } };
  setTimeout(tick, 5000); setInterval(tick, 20 * 60000).unref?.();
}

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get('event') || '';
  if (!EVENTS[key]) return NextResponse.json({error: 'Unknown event.'}, {status: 400});
  let hit = cache.get(key);
  // A preview without its own Meta access reuses the live site's shared result.
  if (!process.env.META_ACCESS_TOKEN?.trim() && process.env.RENDER_SERVICE_ID !== 'srv-db3ufoad0e5s73f5dudg') {
    try {
      const res = await fetch(`${ORIGIN}/api/seasonal?event=${encodeURIComponent(key)}`, {signal: AbortSignal.timeout(150000), cache: 'no-store'});
      if (res.ok) return NextResponse.json(await res.json(), {headers: {'Cache-Control': 'public, max-age=600'}});
    } catch {}
  }
  // After a restart, start from the last saved result instead of making visitors wait.
  if (!hit) { const saved = await readSnapshot('seasonal-' + key); if (saved) { try { const d = JSON.parse(saved); cache.set(key, {at: Date.parse(d.updatedAt) || 0, data: d}); hit = cache.get(key); } catch {} } }
  scheduleRefresh();
  const ttl = (hit?.data as {partial?: boolean} | undefined)?.partial ? 10 * 60000 : TTL;
  if (hit && Date.now() - hit.at < ttl) return NextResponse.json(hit.data, {headers: {'Cache-Control': 'public, max-age=600'}});
  let work = inflight.get(key);
  if (!work) work = refresh(key);
  try {
    // Serve stale data straight away while a refresh runs.
    const data = hit ? hit.data : await work;
    return NextResponse.json(data, {headers: {'Cache-Control': 'public, max-age=600'}});
  } catch { return NextResponse.json({error: 'Seasonal data is temporarily unavailable.'}, {status: 503}); }
}
