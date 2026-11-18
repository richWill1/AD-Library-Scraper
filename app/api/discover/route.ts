import {NextRequest, NextResponse} from 'next/server';
import {getMetaCredential} from '@/lib/meta-token-store';
import {metaFetch} from '@/lib/meta-api';
import {observeAds} from '@/lib/advertiser-directory';
export const runtime = 'nodejs';

// Category discovery: every advertiser running live UK ads that mention a term
// (for example "blinds"), ranked by Meta's estimated UK reach. Reads several
// hundred ads instead of the first page, so big brands are not crowded out.
// Every Page seen is added to the shared advertiser directory, so name searches
// for those brands improve too. Results are shared and cached.
const ORIGIN = process.env.ADS_ORIGIN || 'https://ad-library-scraper-94t0.onrender.com';
const MAIN_SERVICE = 'srv-db3ufoad0e5s73f5dudg';
const TTL = 6 * 3600 * 1000, PAGES = 6, LIMIT = 100;
type Advertiser = {id: string; name: string; ads: number; reach: number; latest: string};
type Result = {q: string; advertisers: Advertiser[]; scanned: number; more: boolean; updatedAt: string};
const cache = new Map<string, {at: number; data: Result}>();
const inflight = new Map<string, Promise<Result>>();
const rates = new Map<string, {at: number; count: number}>();

const ukReach = (a: {total_reach_by_location?: {key?: string; location?: string; value?: number; reach?: number}[]}) => {
  const r = a.total_reach_by_location?.find(x => (x.key ?? x.location) === 'GB');
  const v = r?.value ?? r?.reach;
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
};

function rank(rows: {id: string; page_id: string; page_name: string; reach: number; start: string}[], q: string, more: boolean): Result {
  const byPage = new Map<string, Advertiser>();
  for (const r of rows) {
    if (!/^\d{1,30}$/.test(r.page_id) || !r.page_name) continue;
    const e = byPage.get(r.page_id) || {id: r.page_id, name: r.page_name.slice(0, 120), ads: 0, reach: 0, latest: ''};
    e.ads++; e.reach += r.reach; if (r.start > e.latest) e.latest = r.start;
    byPage.set(r.page_id, e);
  }
  const advertisers = [...byPage.values()].sort((a, b) => b.reach - a.reach || b.ads - a.ads).slice(0, 36);
  return {q, advertisers, scanned: rows.length, more, updatedAt: new Date().toISOString()};
}

async function buildWithToken(q: string, token: string): Promise<Result> {
  const rows: {id: string; page_id: string; page_name: string; reach: number; start: string}[] = [];
  let after = '';
  for (let i = 0; i < PAGES; i++) {
    const p = new URLSearchParams({ad_reached_countries: JSON.stringify(['GB']), ad_type: 'ALL', ad_active_status: 'ACTIVE', search_terms: q, limit: String(LIMIT), fields: 'id,page_id,page_name,total_reach_by_location,ad_delivery_start_time'});
    if (after) p.set('after', after);
    const res = await metaFetch(`https://graph.facebook.com/v26.0/ads_archive?${p}`, {headers: {Authorization: `Bearer ${token}`}, signal: AbortSignal.timeout(20000), cache: 'no-store'});
    const body = await res.json();
    if (!res.ok || body.error || !Array.isArray(body.data)) { if (!rows.length) throw Error('META'); break; }
    for (const a of body.data) rows.push({id: String(a.id), page_id: String(a.page_id || ''), page_name: typeof a.page_name === 'string' ? a.page_name : '', reach: ukReach(a), start: String(a.ad_delivery_start_time || '').slice(0, 10)});
    after = body.paging?.next && body.paging?.cursors?.after ? String(body.paging.cursors.after) : '';
    if (!after) break;
  }
  try { observeAds(rows.map(r => ({id: r.id, page_id: r.page_id, page_name: r.page_name}))); } catch {}
  return rank(rows, q, !!after);
}

// Without its own Meta access (preview), read the main service's public ads search instead.
async function buildViaAds(q: string): Promise<Result> {
  const rows: {id: string; page_id: string; page_name: string; reach: number; start: string}[] = [];
  let after = '';
  for (let i = 0; i < 3; i++) {
    const p = new URLSearchParams({q, coverage: 'GB', discover: '1'}); if (after) p.set('after', after);
    const res = await fetch(`${ORIGIN}/api/ads?${p}`, {signal: AbortSignal.timeout(25000), cache: 'no-store'});
    if (!res.ok) break;
    const body = await res.json();
    for (const a of Array.isArray(body.ads) ? body.ads : []) rows.push({id: String(a.id), page_id: String(a.pageId || ''), page_name: String(a.pageName || ''), reach: 0, start: String(a.start || '')});
    after = body.nextCursor || ''; if (!after) break;
  }
  if (!rows.length) throw Error('UNAVAILABLE');
  return rank(rows, q, !!after);
}

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get('q') || '').trim().replace(/\s+/g, ' ');
  if (q.length < 2 || q.length > 60 || /[\x00-\x1f<>]/.test(q)) return NextResponse.json({advertisers: [], error: 'Enter a product, category or brand.'}, {status: 400});
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0] || 'shared', now = Date.now(), r = rates.get(ip);
  if (r && now - r.at < 60000) { if (r.count >= 10) return NextResponse.json({advertisers: [], code: 'RATE_LIMITED'}, {status: 429}); r.count++; } else rates.set(ip, {at: now, count: 1});
  if (rates.size > 1000) for (const [k, v] of rates) if (now - v.at > 60000) rates.delete(k);
  const key = q.toLowerCase(), hit = cache.get(key);
  if (hit && now - hit.at < TTL) return NextResponse.json(hit.data, {headers: {'Cache-Control': 'public, max-age=900'}});
  let token = '';
  try { token = (await getMetaCredential()).token; } catch {}
  if (!token && process.env.RENDER_SERVICE_ID !== MAIN_SERVICE) {
    try { const res = await fetch(`${ORIGIN}/api/discover?q=${encodeURIComponent(q)}`, {signal: AbortSignal.timeout(60000), cache: 'no-store'}); if (res.ok) return NextResponse.json(await res.json(), {headers: {'Cache-Control': 'public, max-age=900'}}); } catch {}
  }
  let work = inflight.get(key);
  if (!work) {
    work = (token ? buildWithToken(q, token) : buildViaAds(q)).then(d => { if (d.advertisers.length) { if (cache.size > 500) cache.delete(cache.keys().next().value!); cache.set(key, {at: Date.now(), data: d}); } return d; }).finally(() => inflight.delete(key));
    inflight.set(key, work);
  }
  try { return NextResponse.json(await work, {headers: {'Cache-Control': 'public, max-age=900'}}); }
  catch { return NextResponse.json({advertisers: [], code: 'UNAVAILABLE'}, {status: 503}); }
}
