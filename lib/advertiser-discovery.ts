// General advertiser discovery. A trading name or domain is resolved from two
// supported signals: the brand site's own Facebook Page link, and Page names
// returned by the public Ad Library. Nothing here is a per-brand mapping.
import {metaFetch} from './meta-api';
import {knownAdvertisers} from './brand-search';

export type FoundAdvertiser = {
  id: string;
  name: string;
  handle?: string;
  website?: string;
  category?: string;
  evidence: string;
  confidence: 'verified' | 'probable';
  activeAds: boolean | null;
  adCount?: number;
  /** Same public profile picture known brands use. */
  picture?: string;
  /** Brand-site mark used when the profile picture cannot be shown. */
  logo?: string;
};
export type DiscoveryResult = {
  status: 'resolved' | 'choose' | 'not_found' | 'lookup_failed';
  resolved: boolean;
  advertisers: FoundAdvertiser[];
  mentions?: {id: string; name: string; count: number}[];
  message: string;
  code?: string;
  source: string;
};
type PageRef = {id?: string; handle?: string};
type AdPage = {id: string; name: string; adCount: number; ownDomain: boolean};
type SiteHit = {host: string; names: string[]; category?: string; pages: PageRef[]; domainConfirmed: boolean; image?: string};
type DirectoryPage = {id: string; name: string; alias?: string; category?: string; /** The tracked brand name, when the Page is on the curated UK brand list. */ curated?: string};

const DROP = new Set(['uk', 'ltd', 'limited', 'plc', 'inc', 'llp', 'co', 'official', 'online', 'gb']);
const REJECT_PATH = new Set(['sharer', 'share', 'share.php', 'dialog', 'plugins', 'login', 'login.php', 'help', 'privacy', 'policies', 'settings', 'watch', 'reel', 'photo', 'photos', 'stories', 'groups', 'events', 'hashtag', 'marketplace', 'flx', 'ajax', 'tr', 'l.php', 'gaming', 'home', 'profile.php', 'ads']);
const MULTI = ['co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'com.au', 'co.nz', 'co.za', 'com.br', 'co.jp', 'co.in', 'com.sg'];
const ADS_BACKEND = 'https://ad-library-scraper-94t0.onrender.com';
const MAX_HTML = 1_600_000;
const metadataDeniedUntil = new Map<string, number>();
function tokenKey(token: string) {
  let hash = 0;
  for (let i = 0; i < token.length; i++) hash = Math.imul(hash, 31) + token.charCodeAt(i) | 0;
  return String(hash);
}
function metadataDenied(body: {error?: {code?: number; message?: string}}) {
  return [10, 200].includes(body?.error?.code || 0) || /Page Public (Metadata|Content) Access/i.test(body?.error?.message || '');
}
export type PageReference = {status: 'resolved'; id: string; name: string; handle?: string; category?: string} | {status: 'denied' | 'not_found' | 'unavailable'};

/** Official Graph lookup. It works only when the token has Page Public Metadata Access. */
export async function resolvePageReference(target: {handle?: string; url?: string}, token: string, request: typeof fetch = fetch): Promise<PageReference> {
  const handle = (target.handle || '').replace(/^@/, '');
  const pageUrl = target.url || (handle ? `https://www.facebook.com/${handle}` : '');
  if (!pageUrl) return {status: 'not_found'};
  if (!token) return {status: 'unavailable'};
  const key = tokenKey(token);
  if ((metadataDeniedUntil.get(key) || 0) > Date.now()) return {status: 'denied'};
  const params = new URLSearchParams({id: pageUrl, fields: 'id,name,username,category,link'});
  try {
    const res = await metaFetch(`https://graph.facebook.com/v26.0/?${params}`, {headers: {Authorization: 'Bearer ' + token}, signal: AbortSignal.timeout(8000), cache: 'no-store'}, request);
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.error) {
      if (metadataDenied(body)) { metadataDeniedUntil.set(key, Date.now() + 6 * 3600 * 1000); return {status: 'denied'}; }
      return body.error?.code === 100 || res.status === 404 ? {status: 'not_found'} : {status: 'unavailable'};
    }
    const id = String(body.id || '');
    const username = String(body.username || '');
    let linkHandle = '';
    try { linkHandle = new URL(String(body.link || '')).pathname.split('/').filter(Boolean)[0]?.toLowerCase() || ''; } catch { linkHandle = ''; }
    const asked = handle.toLowerCase();
    const matches = !asked || username.toLowerCase() === asked || linkHandle === asked;
    if (!/^\d{3,30}$/.test(id) || typeof body.name !== 'string' || !body.name.trim() || !matches) return {status: 'not_found'};
    return {status: 'resolved', id, name: body.name.trim(), handle: username || handle, category: typeof body.category === 'string' ? body.category : undefined};
  } catch { return {status: 'unavailable'}; }
}

export const compactName = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');

export function hostLabel(host: string) {
  const parts = host.toLowerCase().replace(/^www\./, '').split('.').filter(Boolean);
  const suffix = parts.slice(-2).join('.');
  const take = MULTI.includes(suffix) ? 3 : 2;
  return (parts[parts.length - take] || parts[0] || '').replace(/[^a-z0-9]/g, '');
}

export function publicHost(host: string) {
  const h = host.toLowerCase().replace(/\.$/, '');
  if (!/^[a-z0-9.-]+$/.test(h) || h.length > 253) return false;
  if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal') || h.endsWith('.localhost')) return false;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h) || h.includes(':')) return false;
  return h.includes('.');
}

export function typedHost(input: string): string | null {
  const q = input.trim();
  if (/facebook\.com|fb\.com/i.test(q)) return null;
  if (!/^(https?:\/\/|www\.)/i.test(q) && !/^(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/.*)?$/i.test(q)) return null;
  try {
    const host = new URL(/^https?:/i.test(q) ? q : `https://${q}`).hostname.replace(/^www\./i, '').toLowerCase();
    return publicHost(host) ? host : null;
  } catch { return null; }
}

function tokens(input: string, amp: 'and' | 'drop') {
  let s = input.trim().toLowerCase();
  s = amp === 'and' ? s.replace(/&/g, ' and ') : s.replace(/&/g, ' ');
  const words = s.split(/[^a-z0-9]+/).filter(Boolean);
  while (words.length > 1 && words[0] === 'the') words.shift();
  while (words.length > 1 && DROP.has(words[words.length - 1])) words.pop();
  return words;
}

/** Compact and hyphenated forms of any trading name. Not a brand list. */
export function slugForms(query: string): string[] {
  const host = typedHost(query);
  if (host) {
    const label = hostLabel(host);
    return label.length >= 2 ? [label] : [];
  }
  const forms: string[] = [];
  const add = (words: string[]) => {
    const joined = words.join('');
    if (joined.length >= 2 && !forms.includes(joined)) forms.push(joined);
    if (words.length > 1) {
      const hyp = words.join('-');
      if (!forms.includes(hyp)) forms.push(hyp);
    }
  };
  add(tokens(query, 'and'));
  add(tokens(query, 'drop'));
  const kept = query.trim().toLowerCase().replace(/&/g, ' and ').split(/[^a-z0-9]+/).filter(Boolean);
  while (kept.length > 1 && DROP.has(kept[kept.length - 1])) kept.pop();
  if (kept[0] === 'the' && kept.length > 1) {
    const joined = kept.join('');
    if (!forms.includes(joined)) forms.splice(Math.min(1, forms.length), 0, joined);
  }
  return forms.filter(s => /^[a-z0-9-]+$/.test(s)).slice(0, 4);
}

export function candidateHosts(query: string): string[] {
  const typed = typedHost(query);
  if (typed) return [typed];
  const forms = slugForms(query);
  const compact = forms.filter(s => !s.includes('-') && s.length >= 4);
  const hyphen = forms.filter(s => s.includes('-') && s.length >= 5);
  const hosts: string[] = [];
  const push = (h: string) => { if (publicHost(h) && !hosts.includes(h) && hosts.length < 4) hosts.push(h); };
  for (const s of compact) { push(`${s}.co.uk`); push(`${s}.com`); }
  for (const s of hyphen) push(`${s}.co.uk`);
  for (const s of compact) push(`${s}.org.uk`);
  return hosts;
}

export function searchTerms(query: string): string[] {
  const host = typedHost(query);
  if (host) {
    const label = hostLabel(host).replace(/[-_]/g, ' ');
    // The dotted host is a separate term: Ad Library matches "brand.co.uk" inside ad links
    // even when the spaced name is not in the ad text.
    return [...new Set([host, label].filter(Boolean))].slice(0, 2);
  }
  const phrase = query.trim().replace(/\s+/g, ' ').slice(0, 100);
  const terms = [phrase];
  const slug = slugForms(query).find(s => !s.includes('-') && s.length >= 4);
  // "Good Move" flattens to the same letters as "goodmove", but Ad Library treats the space as two words.
  if (slug && slug !== phrase.toLowerCase()) terms.push(slug);
  return [...new Set(terms)].slice(0, 2);
}

export function nameMatch(query: string, name: string): 'exact' | 'variant' | 'none' {
  const keys = new Set<string>();
  const add = (v: string) => { const c = compactName(v); if (c.length >= 2) keys.add(c); };
  add(query);
  const host = typedHost(query);
  if (host) add(hostLabel(host));
  for (const s of slugForms(query)) if (!s.includes('-')) add(s);
  const n = compactName(name);
  if (n.length < 2) return 'none';
  if ([...keys].some(k => k === n)) return 'exact';
  const nSlug = slugForms(name).find(s => !s.includes('-')) || '';
  if (nSlug.length >= 4 && [...keys].some(k => k === nSlug)) return 'variant';
  return 'none';
}

/** The Page name starts with the whole trading name and adds words after it:
 * "247 Blinds" -> "247 Blinds and Curtains", "Strachan" -> "Strachan Fitted Furniture".
 * A different business that merely contains the name ("Cameron Strachan Golf") does not lead with it. */
export function leadMatch(query: string, name: string): boolean {
  const keys = new Set<string>();
  const add = (v: string) => { const c = compactName(v); if (c.length >= 4) keys.add(c); };
  add(query);
  const host = typedHost(query);
  if (host) add(hostLabel(host));
  for (const s of slugForms(query)) if (!s.includes('-')) add(s);
  const words = name.toLowerCase().replace(/&/g, ' and ').split(/[^a-z0-9]+/).filter(Boolean);
  while (words.length > 1 && words[0] === 'the') words.shift();
  let lead = '';
  for (let i = 0; i < words.length - 1; i++) {
    lead += words[i];
    if (keys.has(lead)) return true;
    if (lead.length > 60) break;
  }
  return false;
}

export function parseFacebookUrl(input: string): PageRef | null {
  let url: URL;
  try { url = new URL(input); } catch { return null; }
  const host = url.hostname.replace(/^(www|m|web|l)\./i, '').toLowerCase();
  if (host !== 'facebook.com' && host !== 'fb.com') return null;
  const idParam = url.searchParams.get('id') || url.searchParams.get('view_all_page_id');
  if (url.pathname === '/profile.php' && idParam && /^\d{5,20}$/.test(idParam)) return {id: idParam};
  if (/^\/ads\/library\/?$/.test(url.pathname) && idParam && /^\d{5,20}$/.test(idParam)) return {id: idParam};
  const parts = url.pathname.split('/').filter(Boolean).map(s => { try { return decodeURIComponent(s); } catch { return s; } });
  if (!parts.length || REJECT_PATH.has(parts[0].toLowerCase())) {
    if (parts[0] && ['pages', 'people'].includes(parts[0].toLowerCase()) && parts[2] && /^\d{5,20}$/.test(parts[2])) return {id: parts[2]};
    return null;
  }
  if (parts.length !== 1) return null;
  const seg = parts[0].replace(/\/+$/, '');
  if (/^\d{5,20}$/.test(seg)) return {id: seg};
  const trailed = seg.match(/^(.*?)-(\d{8,20})$/);
  if (trailed && trailed[1]) return {id: trailed[2], handle: seg};
  if (/^[A-Za-z0-9.]{2,80}$/.test(seg) && !REJECT_PATH.has(seg.toLowerCase())) return {handle: seg};
  return null;
}

function facebookUrls(html: string) {
  const text = html.replace(/\\u002f/gi, '/').replace(/\\\//g, '/').replace(/&amp;/gi, '&');
  const found = new Set<string>();
  for (const m of text.matchAll(/https?:\/\/(?:[\w-]+\.)?(?:facebook|fb)\.com\/[^\s"'<>\\)]+/gi)) found.add(m[0].replace(/[.,);]+$/, ''));
  return [...found];
}

function siteNames(html: string) {
  const names: string[] = [];
  const add = (v: string) => {
    const t = v.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/\s+/g, ' ').trim();
    if (t && t.length < 120 && !names.includes(t)) names.push(t);
  };
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (title) title[1].replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').split(/\s+[|–—]\s+|\s+-\s+/).forEach(add);
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    if (!/(?:property|name)=["'](?:og:site_name|og:title|application-name)["']/i.test(m[0])) continue;
    const content = m[0].match(/content=["']([^"']+)["']/i);
    if (content) add(content[1].replace(/&amp;/g, '&'));
  }
  return names;
}

function absoluteBrandUrl(href: string, host: string) {
  try {
    const url = new URL(href, `https://${host}/`);
    if (url.protocol !== 'https:' || url.username || url.password || url.href.length > 500) return '';
    if (/facebook\.com|fbcdn\.net|instagram\.com|doubleclick|google-analytics|googletagmanager/i.test(url.hostname)) return '';
    return url.href;
  } catch { return ''; }
}

/** A square mark from the brand's own site: icon first, then a social image. */
export function brandMark(html: string, host: string) {
  const icons: {url: string; score: number}[] = [];
  for (const tag of html.matchAll(/<link\b[^>]*>/gi)) {
    const el = tag[0];
    if (!/rel=["'][^"']*(?:apple-touch-icon|icon)[^"']*["']/i.test(el) || /mask-icon|preload/i.test(el)) continue;
    const href = el.match(/href=["']([^"']+)["']/i);
    const url = href && absoluteBrandUrl(href[1], host);
    if (!url) continue;
    const sizes = el.match(/sizes=["'](\d+)/i);
    const score = /apple-touch-icon/i.test(el) ? 300 : sizes ? Number(sizes[1]) : 16;
    icons.push({url, score});
  }
  icons.sort((a, b) => b.score - a.score);
  if (icons[0]) return icons[0].url;
  for (const tag of html.matchAll(/<meta\b[^>]*>/gi)) {
    if (!/property=["']og:image(?::url)?["']/i.test(tag[0])) continue;
    const content = tag[0].match(/content=["']([^"']+)["']/i);
    const url = content && absoluteBrandUrl(content[1], host);
    if (url) return url;
  }
  return undefined;
}

export function readOfficialSite(html: string, finalHost: string, requestedHost: string, query: string): SiteHit | null {
  const slugs = slugForms(query).map(s => s.replace(/-/g, '')).filter(s => s.length >= 4);
  const label = hostLabel(finalHost);
  const requested = hostLabel(requestedHost);
  const domainConfirmed = slugs.some(s => s === label) || (!!label && label === requested);
  // A redirect onto a different registrable name is a different organisation.
  if (!domainConfirmed || !publicHost(finalHost)) return null;
  const names = siteNames(html);
  const blob = names.map(compactName).join(' ');
  // The host was derived from the trading name. A title that contains that name is enough;
  // the page does not also have to publish a Facebook link.
  const named = names.some(n => nameMatch(query, n) !== 'none') || slugs.some(s => blob.includes(s));
  if (!named) return null;
  const parsed: PageRef[] = [];
  const seen = new Set<string>();
  for (const u of facebookUrls(html)) {
    const page = parseFacebookUrl(u);
    if (!page) continue;
    const key = page.id || page.handle || '';
    if (!key || seen.has(key)) continue;
    seen.add(key);
    parsed.push(page);
  }
  const brand = names.slice().sort((a, b) => a.length - b.length)[0] || '';
  const fits = (page: PageRef) => !!page.id || (!!page.handle && (nameMatch(query, page.handle) !== 'none' || attachHandle(page.handle, query) || attachHandle(page.handle, brand)));
  const fitting = parsed.filter(fits);
  const pages = (fitting.length ? fitting : parsed.slice(0, 1)).slice(0, 4);
  const category = names.find(n => nameMatch(query, n) === 'none' && !slugs.some(s => compactName(n).includes(s)));
  const matched = names.filter(n => nameMatch(query, n) !== 'none' || slugs.some(s => compactName(n).includes(s)));
  return {host: finalHost.replace(/^www\./, ''), names: matched.length ? matched : names.slice(0, 1), category: category?.slice(0, 80), pages, domainConfirmed: true, image: brandMark(html, finalHost)};
}

function humanize(handle?: string) {
  if (!handle) return '';
  const stem = handle.replace(/-(\d{8,20})$/, '');
  if (!stem.includes('-') && !stem.includes('.')) return '';
  return stem.split(/[-.]+/).filter(Boolean).join(' ');
}

function attachHandle(handle: string, name: string) {
  const h = compactName(handle), n = compactName(name);
  if (!h || !n || n.length < 4) return false;
  if (h === n) return true;
  if (h.startsWith(n)) {
    const rest = h.slice(n.length);
    // The handle may add a short trading suffix. It must not swallow a different name.
    if (/^(uk|gb|ltd|limited|plc|inc|co|help|hq|official|online|store|shop|beds|furniture|homewares)?$/.test(rest)) return true;
    if (n.length >= 8 && rest.length <= 4) return true;
  }
  if (n.startsWith(h) && h.length >= 8) return true;
  return false;
}

type Draft = {
  id: string;
  name: string;
  handle?: string;
  website?: string;
  category?: string;
  level: 'exact' | 'variant' | 'site';
  /** Matched only because the Page name leads with the trading name. */
  lead?: boolean;
  adCount: number | null;
  ownDomain: boolean;
  domainConfirmed: boolean;
  linkFits: boolean;
  image?: string;
  bits: string[];
};

export function decide(query: string, input: {
  ads: AdPage[];
  sites: SiteHit[];
  directory?: DirectoryPage[];
  adsOk: boolean;
  sitesAttempted: number;
  sitesReached: number;
}): DiscoveryResult {
  const drafts = new Map<string, Draft>();
  const mentions: {id: string; name: string; count: number}[] = [];
  const upsert = (id: string, patch: Partial<Draft> & {name: string}) => {
    const cur = drafts.get(id);
    if (!cur) {
      drafts.set(id, {id, name: patch.name, level: patch.level || 'site', adCount: patch.adCount ?? null, ownDomain: !!patch.ownDomain, domainConfirmed: !!patch.domainConfirmed, linkFits: patch.linkFits !== false, bits: patch.bits || [], handle: patch.handle, website: patch.website, category: patch.category, image: patch.image});
      return;
    }
    if (patch.level === 'exact' || (patch.level === 'variant' && cur.level === 'site')) { cur.level = patch.level; if (patch.name) cur.name = patch.name; }
    if (patch.adCount != null) cur.adCount = Math.max(cur.adCount || 0, patch.adCount);
    cur.ownDomain = cur.ownDomain || !!patch.ownDomain;
    cur.domainConfirmed = cur.domainConfirmed || !!patch.domainConfirmed;
    if (patch.linkFits === false) cur.linkFits = false;
    if (patch.handle && !cur.handle) cur.handle = patch.handle;
    if (patch.website && !cur.website) cur.website = patch.website;
    if (patch.category && !cur.category) cur.category = patch.category;
    if (patch.image && !cur.image) cur.image = patch.image;
    for (const b of patch.bits || []) if (!cur.bits.includes(b)) cur.bits.push(b);
  };
  for (const ad of input.ads) {
    const named = nameMatch(query, ad.name);
    const lead = named === 'none' && leadMatch(query, ad.name);
    if (named === 'none' && !lead) { if (ad.adCount) mentions.push({id: ad.id, name: ad.name, count: ad.adCount}); continue; }
    const level = named === 'none' ? 'variant' : named;
    upsert(ad.id, {name: ad.name, level, adCount: ad.adCount, ownDomain: ad.ownDomain, bits: [level === 'exact' ? `Meta Ad Library names this Page “${ad.name}”` : `Meta lists a Page named “${ad.name}”`, ad.ownDomain ? 'its ads link to this brand’s domain' : ''].filter(Boolean)});
    if (lead) { const d = drafts.get(ad.id)!; if (d.level === 'variant') d.lead = true; }
  }
  for (const page of input.directory || []) {
    const level = nameMatch(query, page.name);
    const aliasHost = page.alias && page.alias.includes('.') ? page.alias : '';
    const aliasOk = !!aliasHost && nameMatch(query, hostLabel(aliasHost)) === 'exact';
    if (level === 'none' && !aliasOk) continue;
    upsert(page.id, {name: page.name, level: level === 'none' ? 'variant' : level, domainConfirmed: aliasOk, website: aliasHost ? `https://${aliasHost.replace(/^https?:\/\//, '')}` : undefined, category: page.category, bits: [level === 'exact' ? `Page name matches “${page.name}”` : level === 'variant' ? `Page name “${page.name}” is only a partial match` : '', aliasOk ? `${aliasHost} was linked from the brand site` : ''].filter(Boolean)});
  }
  for (const site of input.sites) {
    const website = `https://${site.host}/`;
    const brand = site.names.slice().sort((a, b) => a.length - b.length)[0] || site.host;
    for (const page of site.pages) {
      const label = `${site.host} links to this Facebook Page`;
      const named = page.handle ? humanize(page.handle) : '';
      const fits = !page.handle || attachHandle(page.handle, query) || attachHandle(page.handle, brand) || nameMatch(query, named || page.handle) !== 'none' || !!page.id;
      if (page.id) {
        const level = nameMatch(query, named || brand);
        upsert(page.id, {name: drafts.get(page.id)?.name || (named && named.length > brand.length + 2 ? named : brand), handle: page.handle && !/-\d{8,}$/.test(page.handle) ? page.handle : undefined, website, category: site.category, domainConfirmed: true, linkFits: fits, level: level === 'none' ? 'site' : level, bits: [label, site.category || ''].filter(Boolean)});
      } else if (page.handle) {
        const handle = page.handle;
        const target = [...drafts.values()].find(d => d.handle === handle || attachHandle(handle, d.name));
        if (target) { target.handle = target.handle || handle; target.website = target.website || website; target.domainConfirmed = true; target.linkFits = target.linkFits && fits; target.category = target.category || site.category; if (!target.bits.includes(label)) target.bits.push(label); }
        else drafts.set('h:' + page.handle, {id: '', name: brand, handle: page.handle, website, category: site.category, image: site.image, level: 'site', adCount: null, ownDomain: false, domainConfirmed: true, linkFits: fits, bits: [label, 'numeric Page ID was not published on the link']});
      }
    }
  }
  // A confirmed brand domain still describes the Page when the site does not link Facebook.
  // Attach it only to the Page whose name owns that domain, never to a different namesake.
  const identifiable = [...drafts.values()].filter(d => d.id || d.handle);
  for (const site of input.sites) {
    const website = `https://${site.host}/`;
    const linked = new Set(site.pages.map(p => p.id).filter((id): id is string => !!id));
    for (const draft of identifiable) {
      const nameSlug = slugForms(draft.name).find(s => !s.includes('-')) || '';
      const ownsDomain = !linked.size && hostLabel(site.host) === nameSlug && identifiable.filter(d => (slugForms(d.name).find(s => !s.includes('-')) || '') === nameSlug).length === 1;
      if (!(draft.id && linked.has(draft.id)) && !ownsDomain) continue;
      if (!draft.website) draft.website = website;
      if (!draft.category && site.category) draft.category = site.category;
      if (!draft.image && site.image) draft.image = site.image;
      if (site.category && !draft.bits.includes(site.category)) draft.bits.push(site.category);
    }
  }
  const hasExact = [...drafts.values()].some(d => (d.id || d.handle) && d.level === 'exact');
  const advertisers: FoundAdvertiser[] = [...drafts.values()].filter(d => d.id || d.handle).map(d => {
    // Exact Page name, or the brand domain's own Facebook link, can be verified.
    // A suffix such as "UK", or a handle that does not belong to the name, cannot.
    // A Page that only leads with the name is verified by its ads linking to the brand's domain,
    // and never while a Page with the exact name is also in the running.
    const leadOk = !d.lead || (!hasExact && d.ownDomain);
    const confidence: FoundAdvertiser['confidence'] = d.linkFits && (d.level === 'exact' || d.domainConfirmed || (d.level === 'variant' && d.ownDomain && leadOk)) ? 'verified' : 'probable';
    const adsBit = d.adCount == null ? '' : d.adCount > 0 ? `${d.adCount} active UK ads in the first results` : '';
    const evidence = [...d.bits, d.handle ? `@${d.handle}` : '', d.category && !d.bits.includes(d.category) ? d.category : '', adsBit].filter(Boolean).join(' · ').slice(0, 280);
    const picture = /^\d{3,30}$/.test(d.id) ? `https://graph.facebook.com/${d.id}/picture?type=square&width=128&height=128` : undefined;
    return {id: d.id, name: d.name, handle: d.handle, website: d.website, category: d.category?.slice(0, 60), picture, logo: d.image, evidence, confidence, activeAds: d.adCount == null ? null : d.adCount > 0, adCount: d.adCount ?? undefined};
  }).sort((a, b) => Number(b.confidence === 'verified') - Number(a.confidence === 'verified') || Number(b.activeAds === true) - Number(a.activeAds === true) || a.name.localeCompare(b.name));
  const pool = advertisers.filter(a => a.id || a.handle);
  const sources = [input.sites.length ? 'official-website' : '', input.ads.length ? 'ad-library' : '', (input.directory || []).length ? 'directory' : ''].filter(Boolean);
  const source = sources.join('+') || 'none';
  if (!pool.length) {
    const looked = input.adsOk || input.sitesReached > 0;
    if (!looked && (input.sitesAttempted > 0 || !input.adsOk)) return {status: 'lookup_failed', resolved: false, advertisers: [], message: 'The lookup failed before a Page could be identified. This does not mean the advertiser has no ads.', code: 'LOOKUP_FAILED', source};
    return {status: 'not_found', resolved: false, advertisers: [], mentions: mentions.sort((a, b) => b.count - a.count).slice(0, 5), message: 'No Facebook Page could be identified from an official website or from a Page name in the Ad Library.', code: 'NOT_FOUND', source};
  }
  const verified = pool.filter(a => a.id && a.confidence === 'verified');
  if (verified.length === 1 && pool.length === 1) return {status: 'resolved', resolved: true, advertisers: verified, message: '', source};
  const only = pool.length === 1;
  const noId = only && !pool[0].id;
  return {status: 'choose', resolved: false, advertisers: pool.slice(0, 8), code: noId ? 'PAGE_METADATA_PERMISSION' : undefined, message: noId ? 'Facebook Page found. It needs Page Public Metadata Access before its numeric Page ID can be resolved.' : only ? 'One possible Page matches, but the name is not exact enough to open on its own. Confirm it is the right business.' : 'More than one Facebook Page matches this name. Choose the business you mean.', source};
}

export function exactIdentity(query: string, directory: DirectoryPage[] = []): FoundAdvertiser | null {
  const keys = new Set<string>();
  const add = (v: string) => { const c = compactName(v); if (c.length >= 3) keys.add(c); };
  add(query);
  const host = typedHost(query);
  if (host) { add(hostLabel(host)); add(host); }
  const hits = new Map<string, FoundAdvertiser>();
  for (const known of knownAdvertisers) {
    if ([known.pageName, known.handle || '', ...known.aliases].some(a => a && keys.has(compactName(a)))) {
      const site = known.aliases.find(a => /\.[a-z]{2,}$/i.test(a));
      hits.set(known.pageId, {id: known.pageId, name: known.pageName, handle: known.handle, website: site ? `https://${site.replace(/^https?:\/\//, '')}/` : undefined, picture: `https://graph.facebook.com/${known.pageId}/picture?type=square&width=128&height=128`, evidence: 'Matched a verified Page name already on file.', confidence: 'verified', activeAds: null});
    }
  }
  for (const page of directory) {
    if ((keys.has(compactName(page.name)) || (!!page.curated && keys.has(compactName(page.curated)))) && !hits.has(page.id)) hits.set(page.id, {id: page.id, name: page.name, category: page.category, picture: `https://graph.facebook.com/${page.id}/picture?type=square&width=128&height=128`, evidence: 'This Page name matches the trading name exactly.', confidence: 'verified', activeAds: null});
  }
  return hits.size === 1 ? [...hits.values()][0] : null;
}

/** An alias is the Page's own handle or domain, never the ambiguous query. */
export function safeAlias(query: string, advertiser: {name: string; handle?: string; website?: string}) {
  if (advertiser.website) {
    try {
      const host = new URL(advertiser.website).hostname.replace(/^www\./, '');
      if (compactName(host) !== compactName(query)) return host.slice(0, 80);
    } catch { /* ignore bad url */ }
  }
  if (advertiser.handle && !/-\d{8,}$/.test(advertiser.handle) && compactName(advertiser.handle) !== compactName(query)) return advertiser.handle.slice(0, 80);
  return undefined;
}

async function readCap(res: Response) {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let n = 0;
  while (n < MAX_HTML) {
    const step = await reader.read();
    if (step.done) break;
    n += step.value.byteLength;
    chunks.push(step.value);
  }
  try { await reader.cancel(); } catch { /* already closed */ }
  const buf = new Uint8Array(Math.min(n, MAX_HTML));
  let offset = 0;
  for (const chunk of chunks) {
    const take = Math.min(chunk.byteLength, buf.length - offset);
    if (take <= 0) break;
    buf.set(chunk.subarray(0, take), offset);
    offset += take;
  }
  return new TextDecoder('utf-8', {fatal: false}).decode(buf);
}

async function fetchSite(host: string, request: typeof fetch): Promise<{reached: boolean; html: string; finalHost: string}> {
  let current = `https://${host}/`;
  for (let hop = 0; hop < 4; hop++) {
    let res: Response;
    try {
      res = await request(current, {redirect: 'manual', headers: {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36', 'Accept': 'text/html', 'Accept-Language': 'en-GB,en;q=0.9'}, signal: AbortSignal.timeout(5000), cache: 'no-store'});
    } catch { return {reached: false, html: '', finalHost: host}; }
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const next = res.headers.get('location');
      if (!next) return {reached: true, html: '', finalHost: host};
      let url: URL;
      try { url = new URL(next, current); } catch { return {reached: true, html: '', finalHost: host}; }
      if (url.protocol !== 'https:' || !publicHost(url.hostname)) return {reached: true, html: '', finalHost: host};
      current = url.origin + url.pathname;
      continue;
    }
    const finalHost = new URL(current).hostname.replace(/^www\./i, '');
    if (res.status >= 400) return {reached: true, html: '', finalHost};
    const type = res.headers.get('content-type') || '';
    if (type && !/html|xml|text\/plain/i.test(type)) return {reached: true, html: '', finalHost};
    return {reached: true, html: await readCap(res), finalHost};
  }
  return {reached: true, html: '', finalHost: host};
}

type AdRow = {adId: string; pageId: string; pageName: string; captions: string[]; viaHost?: boolean};

async function adsFromGraph(term: string, token: string, pageId: string, request: typeof fetch, cursor = ''): Promise<{ok: boolean; rows: AdRow[]; cursor: string}> {
  const params = new URLSearchParams({ad_reached_countries: '["GB"]', ad_type: 'ALL', ad_active_status: 'ACTIVE', limit: pageId ? '5' : '50', fields: 'id,page_id,page_name,ad_creative_link_captions'});
  if (pageId) params.set('search_page_ids', JSON.stringify([pageId]));
  else params.set('search_terms', term.slice(0, 100));
  if (cursor) params.set('after', cursor);
  try {
    const res = await metaFetch(`https://graph.facebook.com/v26.0/ads_archive?${params}`, {headers: {Authorization: `Bearer ${token}`}, signal: AbortSignal.timeout(10000), cache: 'no-store'}, request);
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.error) return {ok: false, rows: [], cursor: ''};
    const rows: AdRow[] = (Array.isArray(body.data) ? body.data : []).map((a: {id?: string; page_id?: string; page_name?: string; ad_creative_link_captions?: string[]}) => ({adId: String(a.id || ''), pageId: String(a.page_id || ''), pageName: String(a.page_name || ''), captions: Array.isArray(a.ad_creative_link_captions) ? a.ad_creative_link_captions.map(String) : []})).filter((a: AdRow) => /^\d{3,30}$/.test(a.pageId) && a.pageName);
    return {ok: true, rows, cursor: body.paging?.next ? String(body.paging?.cursors?.after || '') : ''};
  } catch { return {ok: false, rows: [], cursor: ''}; }
}

async function adsFromBackend(term: string, pageId: string, cursor: string, request: typeof fetch): Promise<{ok: boolean; rows: AdRow[]; cursor: string}> {
  const params = new URLSearchParams({q: term.slice(0, 100) || 'brand', coverage: 'GB'});
  if (pageId) params.set('page', pageId);
  if (cursor) params.set('after', cursor);
  try {
    const res = await request(`${ADS_BACKEND}/api/ads?${params}`, {cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(12000)});
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.error) return {ok: false, rows: [], cursor: ''};
    const rows: AdRow[] = (Array.isArray(body.ads) ? body.ads : []).map((a: {id?: string; pageId?: string; pageName?: string}) => ({adId: String(a.id || ''), pageId: String(a.pageId || ''), pageName: String(a.pageName || ''), captions: []})).filter((a: AdRow) => /^\d{3,30}$/.test(a.pageId) && a.pageName);
    return {ok: true, rows, cursor: typeof body.nextCursor === 'string' ? body.nextCursor : ''};
  } catch { return {ok: false, rows: [], cursor: ''}; }
}

function groupAds(rows: AdRow[], slugs: string[]): AdPage[] {
  const map = new Map<string, AdPage & {ads: Set<string>}>();
  for (const row of rows) {
    const cur = map.get(row.pageId) || {id: row.pageId, name: row.pageName, adCount: 0, ownDomain: false, ads: new Set<string>()};
    if (row.adId && !cur.ads.has(row.adId)) { cur.ads.add(row.adId); cur.adCount++; }
    if (!row.adId) cur.adCount = Math.max(cur.adCount, 1);
    if (row.pageName.length > cur.name.length) cur.name = row.pageName;
    if (row.viaHost || row.captions.some(c => slugs.includes(hostLabel(c.replace(/^https?:\/\//, '').split('/')[0])))) cur.ownDomain = true;
    map.set(row.pageId, cur);
  }
  return [...map.values()].map(({ads: _ads, ...page}) => page);
}

async function searchPages(query: string, token: string, request: typeof fetch): Promise<AdPage[]> {
  if (!token || (metadataDeniedUntil.get(tokenKey(token)) || 0) > Date.now()) return [];
  const params = new URLSearchParams({q: query.slice(0, 100), fields: 'id,name,link,category,location'});
  try {
    const res = await metaFetch(`https://graph.facebook.com/v26.0/pages/search?${params}`, {headers: {Authorization: `Bearer ${token}`}, signal: AbortSignal.timeout(8000), cache: 'no-store'}, request);
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.error) {
      if (metadataDenied(body)) metadataDeniedUntil.set(tokenKey(token), Date.now() + 6 * 3600 * 1000);
      return [];
    }
    // An exact Page name from the official search can be used. A partial name stays a choice.
    return (Array.isArray(body.data) ? body.data : []).slice(0, 15).map((p: {id?: string; name?: string}) => ({id: String(p.id || ''), name: String(p.name || ''), adCount: 0, ownDomain: false})).filter((p: AdPage) => /^\d{3,30}$/.test(p.id) && p.name && nameMatch(query, p.name) === 'exact');
  } catch { return []; }
}

export async function discoverTradingName(query: string, opts: {token?: string; directory?: DirectoryPage[]; fetch?: typeof fetch} = {}): Promise<DiscoveryResult> {
  const request = opts.fetch || fetch;
  const token = opts.token || '';
  const terms = searchTerms(query);
  const hosts = candidateHosts(query);
  const slugs = slugForms(query).map(s => s.replace(/-/g, ''));
  const adsFor = (term: string, cursor = '') => token ? adsFromGraph(term, token, '', request, cursor) : adsFromBackend(term, '', cursor, request);
  // Ads found by searching the dotted domain ("247blinds.co.uk") mention or link to that domain.
  const typed = typedHost(query);
  const tag = (term: string, rows: AdRow[]) => term === typed && term.includes('.') ? rows.map(r => ({...r, viaHost: true})) : rows;
  const adCalls = terms.map(async term => {
    const first = await adsFor(term);
    if (!first.ok) return first;
    const matched = groupAds(first.rows, slugs).some(p => nameMatch(query, p.name) !== 'none');
    if (matched || !first.cursor) return {...first, rows: tag(term, first.rows)};
    const second = await adsFor(term, first.cursor);
    return {ok: first.ok || second.ok, rows: tag(term, [...first.rows, ...second.rows]), cursor: ''};
  });
  const loadSites = (list: string[]) => Promise.all(list.map(async host => ({host, ...(await fetchSite(host, request))})));
  const [adSettled, siteSettled, pageSearch] = await Promise.all([
    Promise.all(adCalls),
    loadSites(hosts),
    searchPages(query, token, request),
  ]);
  const sites = siteSettled.filter(s => s.reached && s.html).map(s => readOfficialSite(s.html, s.finalHost, s.host, query)).filter((s): s is SiteHit => !!s);
  if (token) {
    const handles = [...new Set(sites.flatMap(s => s.pages.filter(p => p.handle && !p.id).map(p => p.handle!)))].slice(0, 4);
    const resolved = await Promise.all(handles.map(handle => resolvePageReference({handle}, token, request)));
    handles.forEach((handle, i) => {
      const hit = resolved[i];
      if (hit.status !== 'resolved') return;
      for (const site of sites) for (const page of site.pages) if (page.handle?.toLowerCase() === handle.toLowerCase() && !page.id) page.id = hit.id;
    });
  }
  let adsOk = adSettled.some(r => r.ok) || pageSearch.length > 0;
  let rows = adSettled.flatMap(r => r.rows);
  if (!groupAds(rows, slugs).some(p => nameMatch(query, p.name) !== 'none') && sites.length) {
    const extra = [...new Set(sites.flatMap(s => [s.host, ...s.pages.map(p => p.handle || '')]))].filter(t => t && !terms.includes(t)).slice(0, 2);
    const more = await Promise.all(extra.map(term => adsFor(term)));
    if (more.some(r => r.ok)) adsOk = true;
    rows = rows.concat(more.flatMap(r => r.rows));
  }
  const ads = groupAds(rows, slugs);
  const directory = [...(opts.directory || []), ...pageSearch.filter(p => !rows.some(r => r.pageId === p.id)).map(p => ({id: p.id, name: p.name}))];
  let result = decide(query, {ads, sites, directory, adsOk, sitesAttempted: hosts.length, sitesReached: siteSettled.filter(s => s.reached).length});
  // A Page found on the brand site, but not in the keyword sample, still needs an Ad Library check.
  const unchecked = result.advertisers.filter(a => a.id && a.activeAds == null).slice(0, 3);
  if (unchecked.length) {
    const checks = await Promise.all(unchecked.map(async a => ({id: a.id, ...(token ? await adsFromGraph(a.name, token, a.id, request) : await adsFromBackend(a.name, a.id, '', request))})));
    result = {...result, advertisers: result.advertisers.map(a => {
      const check = checks.find(c => c.id === a.id);
      if (!check || !check.ok) return a;
      const count = new Set(check.rows.map(r => r.adId).filter(Boolean)).size;
      const activeAds = count > 0;
      const note = activeAds ? `${count} active UK ads in the first results` : 'no active UK ads';
      return {...a, activeAds, adCount: count, evidence: [a.evidence, note].filter(Boolean).join(' · ').slice(0, 280)};
    })};
  }
  return result;
}
