// Advertiser lookup by name, using the public Meta Ad Library's own advertiser
// search (the same box a person types into). Meta's Ad Library API only
// searches the words inside ads, so brands such as "CareCo" are otherwise
// buried under unrelated pages whose ads happen to mention the word.
const cache = new Map();
const TTL = 24 * 3600 * 1000;

const text = (v, max) => (typeof v === 'string' && v.length <= max && !/[\x00-\x1f<>]/.test(v) ? v.trim() : '');
const num = v => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Math.round(Number(v)) : null);

function pick(value, out, depth = 0, seen = { n: 0 }) {
  if (!value || typeof value !== 'object' || depth > 25 || ++seen.n > 20000) return;
  if (Array.isArray(value)) { for (const v of value) pick(v, out, depth + 1, seen); return; }
  const id = String(value.page_id ?? value.pageID ?? '');
  const name = text(value.name ?? value.page_name, 120);
  if (/^\d{3,30}$/.test(id) && name && !out.has(id)) {
    out.set(id, {
      id, name,
      alias: text(value.page_alias ?? value.alias, 80) || undefined,
      followers: num(value.likes ?? value.page_like_count ?? value.followers),
      verified: Boolean(value.verification === 'BLUE_VERIFIED' || value.is_verified || value.verification === 'VERIFIED'),
      category: text(value.category ?? value.page_category, 60) || undefined,
      instagram: text(value.ig_username, 60) || undefined,
      igFollowers: num(value.ig_followers)
    });
  }
  for (const v of Object.values(value)) pick(v, out, depth + 1, seen);
}

export async function findAdvertisers(browser, query) {
  const q = query.trim().slice(0, 80), key = q.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.results;
  let context;
  try {
    context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'en-GB' });
    const page = await context.newPage();
    await page.route('**/*', route => {
      const req = route.request(); let host;
      try { host = new URL(req.url()).hostname; } catch { return route.abort(); }
      if (!/\.(facebook\.com|fbcdn\.net|fbsbx\.com)$/.test('.' + host) || ['media', 'font', 'image'].includes(req.resourceType())) return route.abort();
      return route.continue();
    });
    const found = new Map(), reads = []; let listening = false;
    page.on('response', response => {
      if (!listening || !response.url().startsWith('https://www.facebook.com/api/graphql') || reads.length >= 30) return;
      reads.push((async () => {
        try {
          const body = await response.text();
          if (body.length > 3000000 || !/page_id|pageID/.test(body)) return;
          for (const line of body.replace(/^for \(;;\);\s*/, '').split('\n')) { try { pick(JSON.parse(line), found); } catch {} }
        } catch {}
      })());
    });
    await page.goto('https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=GB&media_type=all', { waitUntil: 'domcontentloaded', timeout: 25000 });
    // Logged-out visitors in the UK may be shown a cookie choice first.
    await page.getByRole('button', { name: /decline optional cookies|only allow essential cookies|reject optional/i }).first().click({ timeout: 4000 }).catch(() => {});
    // The search box unlocks once an ad category is chosen.
    const box = page.getByRole('textbox', { name: /search by keyword or advertiser/i });
    if (!(await box.isEnabled({ timeout: 3000 }).catch(() => false))) {
      await page.getByRole('combobox', { name: /ad category/i }).first().click({ timeout: 8000 });
      await page.getByRole('gridcell', { name: /^all ads$/i }).first().click({ timeout: 6000 }).catch(() => page.getByText('All ads', { exact: true }).first().click({ timeout: 4000 }));
    }
    await box.click({ timeout: 8000 });
    listening = true;
    await box.pressSequentially(q, { delay: 70 });
    // Wait for Meta's advertiser suggestions to arrive.
    const until = Date.now() + 9000;
    while (Date.now() < until) {
      await page.waitForTimeout(400);
      await Promise.allSettled(reads);
      if (found.size) { await page.waitForTimeout(700); await Promise.allSettled(reads); break; }
    }
    const results = [...found.values()].slice(0, 12);
    if (results.length) { if (cache.size > 2000) cache.delete(cache.keys().next().value); cache.set(key, { at: Date.now(), results }); }
    return results;
  } finally { await context?.close().catch(() => {}); }
}
