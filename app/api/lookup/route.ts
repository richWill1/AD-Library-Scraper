import {NextRequest, NextResponse} from 'next/server';
import {createHash} from 'node:crypto';
import {readSnapshot, writeSnapshot} from '@/lib/creative-store';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Brand lookup for the AdSnoop Chrome extension: "which brand owns this
// website, and what ads is it running?" One reply carries the brand, its live
// UK ad count, its top four ads by UK reach and the AI summary headline.
// It reuses the site's own routes (advertisers, ads, media, brand-summary), so
// their rate limits, previews' forwarding and caches all still apply.
// Each answer is cached for a day (memory, then the R2 snapshot store), so a
// popular site costs one set of Meta lookups a day, not one per click.
const DAY = 24 * 3600 * 1000, MISS = 3600 * 1000;
const IS_MAIN = process.env.RENDER_SERVICE_ID === 'srv-db3ufoad0e5s73f5dudg';
// LOOKUP_ORIGIN lets a local copy borrow another AdSnoop site's routes for testing.
const SELF = process.env.LOOKUP_ORIGIN || `http://127.0.0.1:${process.env.PORT || 3000}`;
const ID = /^\d{1,30}$/, PAGES = 4;

type Top = {id: string; title: string; image: string | null; reach: number | null; start: string | null};
type Lookup = {
  status: 'found' | 'no_ads' | 'not_found' | 'not_brand_site';
  site: string;
  brand?: {id: string; name: string; picture?: string; logo?: string};
  ads?: {count: number; more: boolean; newThisWeek: number};
  top?: Top[];
  summary?: string | null;
  checkedAt: string;
};

// Sites that aren't one brand's own website: social networks, search engines,
// webmail and the like. The extension only looks up brands' own websites.
const NOT_BRAND = /(^|\.)(facebook|fb|instagram|messenger|whatsapp|threads|google|bing|yahoo|duckduckgo|ecosia|youtube|youtu|tiktok|twitter|x|linkedin|pinterest|reddit|snapchat|wikipedia|gmail|outlook|adsnoop|claude|chatgpt|openai|github|onrender)\.[a-z.]+$|^(localhost|live\.com|office\.com|microsoft365\.com|mail\.yahoo\.com|t\.co)$/i;

const cors = {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Max-Age': '86400'};
const reply = (body: object, status = 200, cache = 'no-store') => NextResponse.json(body, {status, headers: {...cors, 'Cache-Control': cache}});

// "https://www.shop.example.co.uk/path" -> "shop.example.co.uk"; null if it isn't a public web address.
function siteHost(input: string): string | null {
  let host: string;
  try { host = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`).hostname.toLowerCase(); } catch { return null; }
  host = host.replace(/^(www\d?|m|shop|store|uk|en|en-gb)\./, '');
  if (host.length > 120 || !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) || /^\d+(\.\d+){3}$/.test(host)) return null;
  return host;
}

const memory = new Map<string, Lookup>();
const inflight = new Map<string, Promise<Lookup | null>>();
const rates = new Map<string, {at: number; count: number}>();
const snapName = (host: string) => (IS_MAIN ? '' : 'pv-') + 'lookup-' + createHash('sha1').update(host).digest('hex').slice(0, 20);
const fresh = (l: Lookup | null | undefined): l is Lookup => !!l && Date.now() - Date.parse(l.checkedAt) < (l.status === 'found' || l.status === 'no_ads' ? DAY : MISS);

async function get(path: string, ip: string, ms: number) {
  const r = await fetch(SELF + path, {headers: {'x-forwarded-for': ip, accept: 'application/json'}, signal: AbortSignal.timeout(ms), cache: 'no-store'});
  if (r.status === 204) return null;
  const body = await r.json().catch(() => null);
  return {ok: r.ok, status: r.status, body};
}

async function firstImage(id: string, ip: string): Promise<string | null> {
  try {
    const r = await get('/api/media?id=' + id, ip, 15000);
    const items = Array.isArray(r?.body?.items) ? r!.body.items : [];
    const img = items.find((i: any) => i?.kind === 'image' && typeof i.url === 'string') || items.find((i: any) => typeof i?.poster === 'string');
    const url = img ? String(img.kind === 'image' ? img.url : img.poster) : '';
    return /^https:\/\//.test(url) ? url : null;
  } catch { return null; }
}

async function build(host: string, ip: string): Promise<Lookup | null> {
  const now = new Date().toISOString();
  // 1. Which brand owns this website?
  const found = await get('/api/advertisers?q=' + encodeURIComponent(host), ip, 60000);
  if (!found || !found.ok) return null; // lookup failed or rate limited: don't cache
  const pick = (Array.isArray(found.body?.advertisers) ? found.body.advertisers : []).find((a: any) => ID.test(String(a?.id || '')) && a?.confidence === 'verified');
  if (!pick || (found.body.status !== 'resolved' && found.body.status !== 'choose')) return {status: 'not_found', site: host, checkedAt: now};
  const brand = {id: String(pick.id), name: String(pick.name || host).slice(0, 120), picture: typeof pick.picture === 'string' ? pick.picture : undefined, logo: typeof pick.logo === 'string' && /^https:\/\//.test(pick.logo) ? pick.logo : undefined};
  // 2. Its live UK ads.
  // Up to PAGES pages (about 200 ads), so big advertisers get a fair count.
  const ads: any[] = [], seen = new Set<string>();
  let after = '', more = false;
  for (let i = 0; i < PAGES; i++) {
    const res = await get(`/api/ads?page=${brand.id}&coverage=GB${after ? '&after=' + encodeURIComponent(after) : ''}`, ip, 60000).catch(() => null);
    if (!res || !res.ok || !Array.isArray(res.body?.ads)) { if (i === 0) return null; break; }
    for (const a of res.body.ads) { const id = String(a?.id || ''); if (ID.test(id) && !seen.has(id)) { seen.add(id); ads.push(a); } }
    after = typeof res.body.nextCursor === 'string' ? res.body.nextCursor : '';
    more = !!after;
    if (!after) break;
  }
  if (!ads.length) return {status: 'no_ads', site: host, brand, checkedAt: now};
  const count = Math.max(ads.length, typeof pick.adCount === 'number' ? pick.adCount : 0);
  const week = Date.now() - 7 * 864e5;
  const newThisWeek = ads.filter(a => a.start && Date.parse(a.start) >= week).length;
  // Top four by UK reach, skipping near-copies (same headline) so the four look different.
  const byReach = [...ads].sort((a, b) => (b.reach || 0) - (a.reach || 0) || String(b.start || '').localeCompare(String(a.start || '')));
  const heads = new Set<string>(), ranked: any[] = [];
  for (const a of byReach) { const h = String(a.title || a.copy || a.id).toLowerCase().replace(/\W+/g, ' ').trim().slice(0, 60); if (heads.has(h)) continue; heads.add(h); ranked.push(a); if (ranked.length === 4) break; }
  for (const a of byReach) { if (ranked.length >= 4) break; if (!ranked.includes(a)) ranked.push(a); }
  // 3. Thumbnails and the summary headline, side by side.
  const [images, summary] = await Promise.all([
    Promise.all(ranked.map(a => firstImage(String(a.id), ip))),
    get(`/api/brand-summary?page=${brand.id}&name=${encodeURIComponent(brand.name)}`, ip, 25000).then(r => (r?.ok && typeof r.body?.summary?.headline === 'string' ? r.body.summary.headline.slice(0, 300) : null)).catch(() => null),
  ]);
  const top: Top[] = ranked.map((a, i) => ({id: String(a.id), title: [a.title, a.copy].map(t => String(t || '').replace(/\s+/g, ' ').trim()).find(t => t && !/^(ad creative|untitled|\{\{.*\}\})$/i.test(t))?.slice(0, 90) || '', image: images.at(i) || null, reach: typeof a.reach === 'number' ? a.reach : null, start: a.start || null}));
  return {status: 'found', site: host, brand, ads: {count, more: more && count <= ads.length, newThisWeek}, top, summary, checkedAt: now};
}

export function OPTIONS() { return new NextResponse(null, {status: 204, headers: cors}); }

export async function GET(req: NextRequest) {
  const raw = (req.nextUrl.searchParams.get('site') || '').trim();
  const host = raw && raw.length <= 2000 ? siteHost(raw) : null;
  if (!host) return reply({status: 'not_brand_site', site: '', checkedAt: new Date().toISOString()});
  if (NOT_BRAND.test(host)) return reply({status: 'not_brand_site', site: host, checkedAt: new Date().toISOString()}, 200, 'public, max-age=86400');

  const hit = memory.get(host);
  if (fresh(hit)) return reply(hit, 200, 'private, max-age=1800');

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'shared', now = Date.now(), r = rates.get(ip);
  if (r && now - r.at < 60000) { if (r.count >= 12) return reply({status: 'busy', code: 'RATE_LIMITED', site: host}, 429); r.count++; } else rates.set(ip, {at: now, count: 1});
  if (rates.size > 1000) for (const [k, v] of rates) if (now - v.at > 60000) rates.delete(k);

  let work = inflight.get(host);
  if (!work) {
    work = (async () => {
      try { const saved = JSON.parse((await readSnapshot(snapName(host))) || 'null'); if (fresh(saved)) return saved as Lookup; } catch {}
      const made = await build(host, ip);
      if (made) { try { await writeSnapshot(snapName(host), JSON.stringify(made)); } catch {} }
      return made;
    })().finally(() => inflight.delete(host));
    inflight.set(host, work);
  }
  let result: Lookup | null = null;
  try { result = await work; } catch { result = null; }
  if (!result) return reply({status: 'unavailable', site: host}, 503);
  if (memory.size > 2000) memory.delete(memory.keys().next().value!);
  memory.set(host, result);
  console.log('[lookup]', host, result.status, result.brand?.name || '');
  return reply(result, 200, 'private, max-age=1800');
}
