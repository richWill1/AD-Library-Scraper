import {NextRequest, NextResponse} from 'next/server';
import {collectorConfiguration} from '@/lib/meta-creative';
export const runtime = 'nodejs';

// Find advertiser Pages by name via the collector, which uses the public Meta Ad
// Library advertiser search. The Ad Library API only matches words inside ads.
type Advertiser = {id: string; name: string; alias?: string; followers: number | null; verified: boolean; category?: string; instagram?: string};
const cache = new Map<string, {at: number; data: Advertiser[]}>();
const inflight = new Map<string, Promise<Advertiser[] | null>>();
const rates = new Map<string, {at: number; count: number}>();
const TTL = 24 * 3600 * 1000;
const clean = (v: unknown, max: number) => (typeof v === 'string' && v.length <= max && !/[\x00-\x1f<>]/.test(v) ? v.trim() || undefined : undefined);

function valid(input: unknown): Advertiser[] {
  if (!Array.isArray(input)) return [];
  const out: Advertiser[] = [];
  for (const a of input.slice(0, 12)) {
    const id = String(a?.id ?? ''), name = clean(a?.name, 120);
    if (!/^\d{3,30}$/.test(id) || !name) continue;
    const followers = Number.isFinite(Number(a?.followers)) && Number(a.followers) >= 0 ? Math.round(Number(a.followers)) : null;
    out.push({id, name, alias: clean(a?.alias, 80), followers, verified: a?.verified === true, category: clean(a?.category, 60), instagram: clean(a?.instagram, 60)});
  }
  return out;
}

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get('q') || '').trim();
  if (q.length < 2 || q.length > 80) return NextResponse.json({advertisers: [], error: 'Enter a brand name.'}, {status: 400});
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0] || 'shared', now = Date.now(), r = rates.get(ip);
  if (r && now - r.at < 60000) { if (r.count >= 15) return NextResponse.json({advertisers: [], code: 'RATE_LIMITED'}, {status: 429}); r.count++; } else rates.set(ip, {at: now, count: 1});
  if (rates.size > 1000) for (const [k, v] of rates) if (now - v.at > 60000) rates.delete(k);
  const key = q.toLowerCase(), hit = cache.get(key);
  if (hit && now - hit.at < TTL) return NextResponse.json({advertisers: hit.data, source: 'meta-ad-library-search'});
  const config = collectorConfiguration();
  if (!config.ready) return NextResponse.json({advertisers: [], code: 'NOT_CONFIGURED'});
  let work = inflight.get(key);
  if (!work) {
    work = (async () => {
      try {
        const res = await fetch(`${config.url}/advertisers?q=${encodeURIComponent(q)}`, {headers: {'X-Collector-Key': config.secret}, redirect: 'error', signal: AbortSignal.timeout(45000), cache: 'no-store'});
        if (!res.ok) return null;
        const data = valid((await res.json())?.advertisers);
        if (data.length) { if (cache.size > 2000) cache.delete(cache.keys().next().value!); cache.set(key, {at: Date.now(), data}); }
        return data;
      } catch { return null; }
      finally { inflight.delete(key); }
    })();
    inflight.set(key, work);
  }
  const data = await work;
  if (!data) return NextResponse.json({advertisers: [], code: 'LOOKUP_UNAVAILABLE'});
  return NextResponse.json({advertisers: data, source: 'meta-ad-library-search'}, {headers: {'Cache-Control': 'no-store'}});
}
