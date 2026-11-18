// Advertiser lookup by name, using the public Meta Ad Library's own advertiser
// search (the same box a person types into). Meta's Ad Library API only
// searches the words inside ads, so brands such as "CareCo" are otherwise
// buried under unrelated pages whose ads happen to mention the word.
const cache = new Map();
const TTL = 24 * 3600 * 1000;

const text = (v, max) => (typeof v === 'string' && v.length <= max && !/[\x00-\x1f<>]/.test(v) ? v.trim() : '');
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
    const found = new Map();
      await page.goto('https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=GB&media_type=all', { waitUntil: 'domcontentloaded', timeout: 25000 });

      await page.getByRole('button', { name: /decline optional cookies|only allow essential cookies|reject optional|allow all cookies/i }).first().click({ timeout: 5000 }).catch(() => {});

      const box = page.locator('input[placeholder*="keyword or advertiser" i], input[aria-label*="keyword or advertiser" i]').first();
      await box.waitFor({ state: 'visible', timeout: 15000 });
      if (!(await box.isEnabled().catch(() => false))) {

        const combo = page.locator('[role="combobox"]').filter({ hasText: /ad category|all ads|issues|choose/i }).first();
        await combo.click({ timeout: 8000 }).catch(() => page.getByText(/ad category/i).first().click({ timeout: 6000 }));

        await page.getByRole('gridcell', { name: /^all ads$/i }).first().click({ timeout: 6000 }).catch(() => page.getByText('All ads', { exact: true }).last().click({ timeout: 6000 }));
        await page.waitForTimeout(500);
      }

      await box.click({ timeout: 8000, force: true });
      await box.pressSequentially(q, { delay: 70 });
    // Use the public result links, including the advertiser filter set when
    // someone selects a matching autocomplete option.
    const selector = 'a[href*="view_all_page_id="], a[href*="profile.php?id="]';
    const collect = async () => {
      const links = await page.locator(selector).evaluateAll(nodes => nodes.filter(a => a.getClientRects().length).slice(0, 40).map(a => ({url:a.href, name:a.innerText.trim()})));
      for(const link of links){
        const url=new URL(link.url);
        if(!/^(www\.|m\.)?facebook\.com$/i.test(url.hostname))continue;
        const id=url.searchParams.get('view_all_page_id')||url.searchParams.get('id');
        const name=text(link.name.split('\n')[0],120);
        if(/^\d{3,30}$/.test(id||'')&&name)found.set(id,{id,name});
      }
    };
    const option=page.getByRole('option').filter({hasText:q}).first();
    await Promise.race([page.locator(selector).first().waitFor({timeout:7000}),option.waitFor({timeout:7000})]).catch(()=>{});
    await collect();
    if(!found.size&&await option.isVisible()){
      const name=text((await option.innerText()).split('\n')[0].trim(),120);
      await option.click();
      await page.waitForURL(url=>url.searchParams.has('view_all_page_id'),{timeout:5000}).catch(()=>{});
      const id=new URL(page.url()).searchParams.get('view_all_page_id');
      if(name&&/^\d{3,30}$/.test(id||''))found.set(id,{id,name});
    }
    const results = [...found.values()].slice(0, 12);
    if (results.length) { if (cache.size > 2000) cache.delete(cache.keys().next().value); cache.set(key, { at: Date.now(), results }); }
    return results;
  } finally { await context?.close().catch(() => {}); }
}
