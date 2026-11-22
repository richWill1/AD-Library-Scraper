import {NextRequest, NextResponse} from 'next/server';
import {directorySearch} from '@/lib/advertiser-directory';
import {metaFetch} from '@/lib/meta-api';
import {getMetaCredential} from '@/lib/meta-token-store';
import {readSnapshot,writeSnapshot} from '@/lib/creative-store';
export const runtime = 'nodejs';

// Seasonal ad collections (Christmas, Black Friday). Built from Meta's public
// UK Ad Library, shared by every visitor and refreshed every few hours.
//
// Meta has no "list every ad" call: ads can only be found by keyword or by
// advertiser page. So each refresh combines three things:
//  1. many seasonal keywords, paged deeply (exact phrase on the live site),
//  2. a rotating list of UK retailers and every advertiser already found,
//     checked page by page so their seasonal ads are caught even when the
//     keyword search's newest-first results have moved past them,
//  3. a season archive that keeps every matching ad we have ever seen, so
//     coverage builds up over the season instead of resetting each refresh.
const MAIN_SERVICE = 'srv-db3ufoad0e5s73f5dudg';
const IS_MAIN = process.env.RENDER_SERVICE_ID === MAIN_SERVICE;
const ORIGIN = process.env.ADS_ORIGIN || 'https://ad-library-scraper-94t0.onrender.com';
const TTL = 4 * 3600 * 1000;
const LIVE_WINDOW = 30 * 3600 * 1000; // seen within this long = still running
const ROTATE_PER_RUN = 30;
const ARCHIVE_MAX = 12000;

type Ad = {id: string; pageId: string; pageName: string; title: string; copy: string; start: string; reach: number | null; platforms?: string[]};
// Season archive entry. Short keys keep the saved file small.
type Arch = {i: string; p: string; n: string; t: string; c: string; s: string; f: number; l: number; r: number | null};

const EVENTS: Record<string, {name: string; terms: [string, number][]; match: RegExp}> = {
  christmas: {
    name: 'Christmas',
    terms: [['christmas', 15], ['xmas', 6], ['festive', 6], ['christmas gift', 6], ['christmas gifts', 4], ['christmas sale', 4], ['gift guide', 4], ['stocking fillers', 4], ['advent calendar', 3], ['secret santa', 3], ['christmas party', 3], ['christmas jumper', 2], ['christmas delivery', 2]],
    match: /\b(christmas|xmas|festive|santa|stocking fillers?|secret santa|advent)\b/i
  },
  'black-friday': {
    name: 'Black Friday',
    terms: [['black friday', 15], ['cyber monday', 8], ['black friday sale', 6], ['black friday deals', 4], ['early black friday', 3], ['black friday offer', 3], ['cyber week', 3], ['cyber weekend', 3], ['black friday weekend', 3], ['blackfriday', 3], ['black week', 2]],
    match: /\b(black\s*friday|cyber\s*monday|cyber\s*week(end)?|black\s*week|blackfriday)\b/i
  }
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
// Checked on every refresh. Page IDs verified in Meta's Ad Library advertiser search.
const MAJOR_PAGES: Record<string, string> = {Currys: '282722695080974', Argos: '108712049190071', 'Boots UK': '137917343831', 'John Lewis & Partners': '145210795501787', 'Amazon.co.uk': '136154403098698'};
// Rotated through a few dozen at a time, alongside every advertiser already in
// the archive. Names are matched against AdSnoop's advertiser directory; names
// it doesn't know yet are skipped until it does.
const BRAND_NAMES = [
  'John Lewis', 'AO.com', 'Very', 'Lidl GB', 'Aldi UK', 'Tesco', "Sainsbury's", 'Asda', 'Morrisons', 'Waitrose', 'Marks and Spencer', 'M&S', 'Iceland Foods',
  'JD Sports', 'Sports Direct', 'Superdrug', 'The Perfume Shop', 'Space NK', 'Lookfantastic', 'Cult Beauty', 'Charlotte Tilbury', 'Rituals', 'The Body Shop', 'Lush',
  'Dunelm', 'IKEA UK', 'Next', 'ASOS', 'boohoo', 'PrettyLittleThing', 'River Island', 'New Look', 'Zara', 'H&M', 'Uniqlo', 'TK Maxx', 'Matalan', 'Primark', 'Fat Face', 'White Stuff', 'Joules', 'Seasalt Cornwall', 'Boden', 'Oasis', 'Monsoon', 'Clarks', 'Schuh', 'Office', 'Footasylum', 'Gymshark', 'End Clothing', 'Selfridges', 'Harrods', 'Liberty London', 'Fortnum & Mason', 'Debenhams', 'House of Fraser', 'Flannels',
  'Smyths Toys', 'The Entertainer', 'Hamleys', 'Lego', 'Waterstones', 'WHSmith', 'The Works', 'Hobbycraft', 'Paperchase', 'Moonpig', 'Funky Pigeon', 'notonthehighstreet', 'Etsy',
  'Ninja Kitchen UK', 'Dyson', 'Samsung UK', 'Apple', 'Google Pixel', 'Sony UK', 'Shark', 'Philips', 'Nespresso', 'Sage Appliances', 'Le Creuset', 'Lakeland', 'Robert Dyas', 'Wayfair UK', 'Habitat', 'Made.com', 'Oak Furnitureland', 'Furniture Village', 'DFS', 'ScS', 'Simba', 'Emma Sleep', 'Eve Sleep', 'Silentnight',
  'B&Q', 'Wickes', 'Screwfix', 'Toolstation', 'Halfords', 'Pets at Home', 'Holland & Barrett', 'Myprotein', 'Bulk', 'Huel', 'Gousto', 'HelloFresh', 'Hotel Chocolat', 'Thorntons', 'Cadbury', 'Prezzybox', 'Firebox', 'Menkind', 'Virgin Experience Days', 'Buyagift', 'Red Letter Days',
  'Pandora', 'Goldsmiths', 'Ernest Jones', 'H.Samuel', 'Beaverbrooks', 'Missoma', 'Monica Vinader', 'Abbott Lyon', 'Astrid & Miyu', 'Molton Brown', 'Jo Malone London', 'Charles Tyrwhitt', 'Sweaty Betty', 'Lounge Underwear', 'Oodie', 'Snug Sofa', 'Currys PC World', 'Argos UK', 'eBay UK', 'Temu', 'Shein'
];
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
let lastCall = 0, failures = 0, calls = 0, rateLimited = false;
async function paced() { const wait = lastCall + 3600 - Date.now(); if (wait > 0) await sleep(wait); lastCall = Date.now(); }
const cache = new Map<string, {at: number; data: unknown}>();
const inflight = new Map<string, Promise<unknown>>();
const archives = new Map<string, Map<string, Arch>>();
const rotation = new Map<string, number>();
const DAY = 86400000;
const days = (start: string) => { const t = Date.parse(start + 'T00:00:00Z'); return Number.isFinite(t) ? Math.max(0, Math.floor((Date.now() - t) / DAY)) : null; };
// The season a date belongs to: January still counts towards last year's Christmas.
const seasonYear = () => { const d = new Date(); return d.getUTCMonth() === 0 ? d.getUTCFullYear() - 1 : d.getUTCFullYear(); };
// The preview keeps its own saved files so it never overwrites the live site's.
const snapName = (base: string) => (IS_MAIN ? '' : 'pv-') + base;
const archiveName = (key: string) => snapName(`seasonal-archive-${key}-${seasonYear()}`);

let directToken = '';
const RATE_CODES = new Set([4, 17, 32, 613, 80004]);
async function directSearch(term: string, page = '', maxPages = 3) {
  const out: Ad[] = []; let after = '';
  for (let i = 0; i < maxPages && !rateLimited; i++) {
    const p = new URLSearchParams({ad_reached_countries: '["GB"]', ad_type: 'ALL', ad_active_status: 'ACTIVE', limit: '100', fields: 'id,page_id,page_name,ad_creative_bodies,ad_creative_link_titles,ad_delivery_start_time,total_reach_by_location,publisher_platforms'});
    if (page) p.set('search_page_ids', JSON.stringify([page])); else { p.set('search_terms', term); if (/\s/.test(term)) p.set('search_type', 'KEYWORD_EXACT_PHRASE'); }
    if (after) p.set('after', after);
    let body: any; calls++;
    try { const res = await metaFetch(`https://graph.facebook.com/v26.0/ads_archive?${p}`, {headers: {Authorization: `Bearer ${directToken}`}, signal: AbortSignal.timeout(25000), cache: 'no-store'}); body = await res.json(); } catch { failures++; break; }
    // Back off for the rest of this refresh as soon as Meta says we're going too fast.
    if (body?.error) { failures++; if (RATE_CODES.has(Number(body.error.code))) rateLimited = true; break; }
    if (!Array.isArray(body?.data)) { failures++; break; }
    for (const a of body.data) {
      const bodies = [...new Set<string>((a.ad_creative_bodies || []).map((x: string) => String(x).trim()).filter(Boolean))];
      const reach = a.total_reach_by_location?.find((r: any) => (r.key ?? r.location) === 'GB')?.value;
      out.push({id: String(a.id), pageId: String(a.page_id || ''), pageName: String(a.page_name || ''), title: String((a.ad_creative_link_titles || [])[0] || ''), copy: bodies.join('\n\n'), start: String(a.ad_delivery_start_time || '').slice(0, 10), reach: typeof reach === 'number' ? reach : null, platforms: a.publisher_platforms || []});
    }
    after = body.paging?.next ? body.paging?.cursors?.after || '' : ''; if (!after) break;
  }
  return out;
}
async function pool<T>(items: T[], n: number, fn: (x: T) => Promise<void>) { let i = 0; await Promise.all(Array.from({length: n}, async () => { while (i < items.length && !rateLimited) { const x = items[i++]; try { await fn(x); } catch {} } })); }

// Without its own Meta access (the preview), search through the live site's
// shared ads endpoint, one call at a time. It returns 50 ads a page.
async function search(term: string, page = '', maxPages = 3) {
  if (directToken) return directSearch(term, page, maxPages);
  const out: Ad[] = []; let after = '';
  for (let i = 0; i < maxPages && !rateLimited; i++) {
    await paced(); calls++;
    const p = new URLSearchParams({q: term, coverage: 'GB'}); if (page) p.set('page', page); if (after) p.set('after', after);
    let res = await fetch(`${ORIGIN}/api/ads?${p}`, {signal: AbortSignal.timeout(30000), cache: 'no-store', headers: {'x-adsnoop-internal': 'seasonal'}});
    // The ads endpoint allows 20 requests a minute per caller: wait and retry once.
    if (res.status === 429) { await sleep(20000); lastCall = Date.now(); calls++; res = await fetch(`${ORIGIN}/api/ads?${p}`, {signal: AbortSignal.timeout(30000), cache: 'no-store'}); if (res.status === 429) rateLimited = true; }
    if (!res.ok) { failures++; break; }
    const body = await res.json(); if (!Array.isArray(body.ads)) break;
    out.push(...body.ads); after = body.nextCursor || ''; if (!after) break;
  }
  return out;
}

async function loadArchive(key: string) {
  let arch = archives.get(key);
  if (arch) return arch;
  arch = new Map();
  const saved = await readSnapshot(archiveName(key));
  if (saved) { try { for (const a of JSON.parse(saved).ads as Arch[]) if (a?.i) arch.set(a.i, a); } catch {} }
  archives.set(key, arch);
  return arch;
}
async function saveArchive(key: string, arch: Map<string, Arch>) {
  if (arch.size > ARCHIVE_MAX) {
    // Drop the least notable ads first: lowest reach, then shortest run.
    const keep = [...arch.values()].sort((x, y) => (y.r || 0) - (x.r || 0) || (y.l - Date.parse(y.s)) - (x.l - Date.parse(x.s))).slice(0, ARCHIVE_MAX);
    arch.clear(); for (const a of keep) arch.set(a.i, a);
  }
  await writeSnapshot(archiveName(key), JSON.stringify({event: key, season: seasonYear(), savedAt: new Date().toISOString(), ads: [...arch.values()]}));
}

// Which advertiser pages to check by ID this refresh: the big five every time,
// plus the next slice of a rotating list (known UK brands + everyone already
// found running seasonal ads, busiest first).
async function pagesToCheck(key: string, arch: Map<string, Arch>) {
  const fixed = Object.values(MAJOR_PAGES);
  const rota: string[] = [];
  const add = (id: string) => { if (/^\d{1,30}$/.test(id) && !fixed.includes(id) && !rota.includes(id)) rota.push(id); };
  for (const name of BRAND_NAMES) { try { for (const p of await directorySearch(name)) if (p.score >= 5) { add(p.id); break; } } catch {} }
  const counts = new Map<string, number>();
  for (const a of arch.values()) counts.set(a.p, (counts.get(a.p) || 0) + 1);
  for (const [id] of [...counts].sort((x, y) => y[1] - x[1])) add(id);
  const per = directToken ? ROTATE_PER_RUN : 8;
  const start = (rotation.get(key) || 0) % Math.max(1, rota.length);
  const slice = rota.length <= per ? rota : [...rota.slice(start, start + per), ...rota.slice(0, Math.max(0, start + per - rota.length))];
  rotation.set(key, start + per);
  return {pages: [...fixed, ...slice], pool: fixed.length + rota.length};
}

type Item = {id: string; pageId: string; pageName: string; title: string; copy: string; start: string; days: number | null; run: number; reach: number | null; live: boolean; lastSeen: string; versions?: number};
const copyKey = (a: Arch) => (a.c || a.t || '').toLowerCase().replace(/\s+/g, ' ').slice(0, 90);
const runDays = (a: Arch) => { const s = Date.parse(a.s + 'T00:00:00Z'); return Number.isFinite(s) ? Math.max(0, Math.floor((a.l - s) / DAY)) : 0; };
const toItem = (a: Arch, now: number, extra: Partial<Item> = {}): Item => ({id: a.i, pageId: a.p, pageName: a.n, title: a.t === 'Ad creative' ? '' : a.t, copy: (a.c === 'No ad copy provided by Meta.' ? '' : a.c).slice(0, 320), start: a.s, days: days(a.s), run: runDays(a), reach: a.r, live: now - a.l < LIVE_WINDOW, lastSeen: new Date(a.l).toISOString().slice(0, 10), ...extra});
// One ad per distinct message, at most two per brand.
function shortlist(sorted: Arch[], now: number, n = 12, extra?: (a: Arch) => Partial<Item>) {
  const seen = new Set<string>(), perBrand = new Map<string, number>(), out: Item[] = [];
  for (const a of sorted) {
    const k = a.p + '|' + copyKey(a); if (seen.has(k)) continue; seen.add(k);
    const c = perBrand.get(a.p) || 0; if (c >= 2) continue; perBrand.set(a.p, c + 1);
    out.push(toItem(a, now, extra?.(a))); if (out.length >= n) break;
  }
  return out;
}

async function build(key: string) {
  const ev = EVENTS[key];
  failures = 0; calls = 0; rateLimited = false;
  const now = Date.now();
  try { directToken = (await getMetaCredential()).token || ''; } catch { directToken = ''; }
  const arch = await loadArchive(key);
  const seen = new Map<string, Ad>();
  const add = (list: Ad[]) => { for (const a of list) if (a && /^\d{1,30}$/.test(String(a.id)) && !seen.has(a.id)) seen.set(a.id, a); };
  const {pages, pool: brandPool} = await pagesToCheck(key, arch);
  // The preview goes through the live site's rate-limited endpoint, so it does a lighter pass.
  const depth = (n: number) => directToken ? n : Math.max(1, Math.ceil(n / 4));
  // Brand pages first: the big retailers carry most of the reach, so they must not be the part that gets cut if Meta slows us down.
  const jobs: [string, string, number][] = [...pages.map(id => [id, id, directToken ? 2 : 1] as [string, string, number]), ...ev.terms.map(([t, n]) => [t, '', depth(n)] as [string, string, number])];
  await pool(jobs, directToken ? 4 : 1, async ([term, page, n]) => { add(await search(term, page, n)); });
  // Merge this refresh into the season archive.
  let added = 0;
  for (const a of seen.values()) {
    if (!/^\d{1,30}$/.test(String(a.pageId)) || !ev.match.test(`${a.title || ''}\n${a.copy || ''}`)) continue;
    const old = arch.get(a.id);
    if (old) { old.l = now; if (a.reach != null) old.r = Math.max(old.r || 0, a.reach); if (a.pageName) old.n = a.pageName; }
    else { arch.set(a.id, {i: a.id, p: a.pageId, n: a.pageName, t: String(a.title || '').slice(0, 160), c: String(a.copy || '').slice(0, 400), s: a.start, f: now, l: now, r: a.reach}); added++; }
  }
  if (seen.size) await saveArchive(key, arch);
  const ads = [...arch.values()];
  const live = ads.filter(a => now - a.l < LIVE_WINDOW);
  const text = (a: Arch) => `${a.t}\n${a.c}`;
  // Advertisers across the whole season
  const byPage = new Map<string, {id: string; name: string; ads: number; reach: number; first: string}>();
  for (const a of ads) { const e = byPage.get(a.p) || {id: a.p, name: a.n, ads: 0, reach: 0, first: a.s}; e.ads++; e.reach += a.r || 0; if (a.s && (!e.first || a.s < e.first)) e.first = a.s; byPage.set(a.p, e); }
  const advertisers = [...byPage.values()].sort((x, y) => y.reach - x.reach || y.ads - x.ads).slice(0, 15);
  // The "best" lists. Meta gives no spend or results for commercial ads, so each list is a different, stated signal.
  const big = new Set([...Object.values(MAJOR_PAGES), ...[...byPage.values()].filter(p => p.reach >= 1_000_000).map(p => p.id)]);
  const groups = new Map<string, Arch[]>();
  for (const a of ads) { const k = a.p + '|' + copyKey(a); const g = groups.get(k) || []; g.push(a); groups.set(k, g); }
  const versions = (a: Arch) => groups.get(a.p + '|' + copyKey(a))?.length || 1;
  const tested = [...groups.values()].filter(g => g.length >= 3).map(g => g.sort((x, y) => (y.r || 0) - (x.r || 0))[0]).sort((x, y) => versions(y) - versions(x) || (y.r || 0) - (x.r || 0));
  const lists = {
    reach: shortlist([...ads].sort((x, y) => (y.r || 0) - (x.r || 0) || runDays(y) - runDays(x)), now),
    longest: shortlist(ads.filter(a => runDays(a) >= 7).sort((x, y) => runDays(y) - runDays(x) || (y.r || 0) - (x.r || 0)), now),
    tested: shortlist(tested, now, 12, a => ({versions: versions(a)})),
    challengers: shortlist(ads.filter(a => !big.has(a.p)).sort((x, y) => (y.r || 0) - (x.r || 0) || runDays(y) - runDays(x)), now)
  };
  // Launches per day, last 42 days, across the whole archive
  const timeline: number[] = new Array(42).fill(0);
  for (const a of ads) { const d = days(a.s); if (d != null && d < 42) timeline[41 - d]++; }
  const tactics = TACTICS.map(t => ({id: t.id, label: t.label, ads: ads.filter(a => t.re.test(text(a))).length})).filter(t => t.ads).sort((x, y) => y.ads - x.ads);
  const depths: number[] = [];
  for (const a of ads) { const m = [...text(a).matchAll(/(\d{1,2})\s*%\s*off|up to (\d{1,2})\s*%/gi)].map(x => Number(x[1] || x[2])).filter(n => n >= 5 && n <= 90); if (m.length) depths.push(Math.max(...m)); }
  depths.sort((x, y) => x - y);
  const buckets = [[5, 19, 'Under 20%'], [20, 29, '20–29%'], [30, 39, '30–39%'], [40, 49, '40–49%'], [50, 90, '50% or more']].map(([lo, hi, label]) => ({label, ads: depths.filter(d => d >= (lo as number) && d <= (hi as number)).length}));
  return {
    event: key, name: ev.name, season: seasonYear(), updatedAt: new Date().toISOString(), partial: failures > 0 || rateLimited,
    stats: {ads: ads.length, live: live.length, advertisers: byPage.size, newThisWeek: ads.filter(a => { const d = days(a.s); return d != null && d <= 7; }).length, addedThisRefresh: added, withDiscount: depths.length, typicalDiscount: depths.length ? depths[Math.floor(depths.length / 2)] : null, deepest: depths.length ? depths[depths.length - 1] : null},
    coverage: {keywords: ev.terms.length, brandsChecked: pages.length, brandPool, calls, since: ads.length ? new Date(Math.min(...ads.map(a => a.f))).toISOString().slice(0, 10) : null},
    lists, top: lists.reach, timeline, advertisers, tactics, discounts: buckets
  };
}

function refresh(key: string) {
  let work = inflight.get(key);
  if (!work) {
    work = build(key).then(d => { if ((d as {stats: {ads: number}}).stats.ads) { cache.set(key, {at: Date.now(), data: d}); writeSnapshot(snapName('seasonal-' + key), JSON.stringify(d)); } return d; }).finally(() => inflight.delete(key));
    inflight.set(key, work);
  }
  return work;
}
// Keep both collections fresh in the background on the live site, so nobody waits for a build.
// One event at a time, so the two never compete for Meta's rate limit.
let scheduled = false;
function scheduleRefresh() {
  if (scheduled || !IS_MAIN) return;
  scheduled = true;
  const tick = async () => { for (const k of Object.keys(EVENTS)) { const h = cache.get(k); if (!h || Date.now() - h.at > TTL - 15 * 60000) { try { await refresh(k); } catch {} } } };
  setTimeout(tick, 5000); setInterval(tick, 20 * 60000).unref?.();
}

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get('event') || '';
  if (!EVENTS[key]) return NextResponse.json({error: 'Unknown event.'}, {status: 400});
  let hit = cache.get(key);
  // After a restart, start from the last saved result instead of making visitors wait.
  // A result saved before the season archive existed is shown once and rebuilt straight away.
  if (!hit) { const saved = await readSnapshot(snapName('seasonal-' + key)); if (saved) { try { const d = JSON.parse(saved); cache.set(key, {at: d?.lists ? Date.parse(d.updatedAt) || 0 : 0, data: d}); hit = cache.get(key); } catch {} } }
  scheduleRefresh();
  const ttl = (hit?.data as {partial?: boolean} | undefined)?.partial ? 20 * 60000 : TTL;
  if (hit && Date.now() - hit.at < ttl) return NextResponse.json(hit.data, {headers: {'Cache-Control': 'public, max-age=600'}});
  const work = inflight.get(key) || refresh(key);
  work.catch(() => {});
  // Serve stale data straight away while a refresh runs.
  if (hit) return NextResponse.json(hit.data, {headers: {'Cache-Control': 'public, max-age=600'}});
  // The preview's first build goes through the live site slowly, so show the
  // live site's current result until it finishes.
  if (!IS_MAIN && !process.env.META_ACCESS_TOKEN?.trim()) {
    try {
      const res = await fetch(`${ORIGIN}/api/seasonal?event=${encodeURIComponent(key)}`, {signal: AbortSignal.timeout(150000), cache: 'no-store'});
      if (res.ok) return NextResponse.json({...(await res.json()), building: true}, {headers: {'Cache-Control': 'no-store'}});
    } catch {}
  }
  try { return NextResponse.json(await work, {headers: {'Cache-Control': 'public, max-age=600'}}); }
  catch { return NextResponse.json({error: 'Seasonal data is temporarily unavailable.'}, {status: 503}); }
}
