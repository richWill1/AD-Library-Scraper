// AdSnoop popup: look up the brand behind the current tab's website and show
// its live ads. Only runs when you click the icon; sends only the site's address.
const $ = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v; else if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : String(kid));
  return el;
};
const main = document.getElementById('main');
const fmt = n => n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'm' : n >= 1000 ? Math.round(n / 1000) + 'k' : String(n);
const UTM = 'utm_source=chrome-extension&utm_medium=extension';
const brandUrl = (b, extra = '') => `${ADSNOOP}/?page=${encodeURIComponent(b.id)}&name=${encodeURIComponent(b.name)}${extra}&${UTM}`;
const searchUrl = q => `${ADSNOOP}/?q=${encodeURIComponent(q)}&${UTM}`;
const open = url => { chrome.tabs.create({url}); window.close(); };
const show = (...nodes) => main.replaceChildren(...nodes.filter(Boolean));
let tabId = null, site = '';

if (!/^https:\/\/adsnoop\.co\.uk$/.test(ADSNOOP)) document.getElementById('env').hidden = false;

function badge(text) {
  if (tabId == null) return;
  try { chrome.action.setBadgeBackgroundColor({tabId, color: '#0071e3'}); chrome.action.setBadgeText({tabId, text}); } catch {}
}

function searchForm(value = '') {
  return $('form', {class: 'search', onsubmit: e => { e.preventDefault(); const q = e.target.q.value.trim(); if (q) open(searchUrl(q)); }},
    $('input', {name: 'q', type: 'search', value, placeholder: 'Search a brand or website', 'aria-label': 'Search AdSnoop', maxlength: '120'}),
    $('button', {class: 'btn primary', type: 'submit'}, 'Search'));
}
const siteLabel = host => (host || '').split('.')[0].replace(/-/g, ' ');

function brandHead(data) {
  const b = data.brand;
  const pic = b.picture || b.logo;
  return $('div', {class: 'brand'},
    pic ? $('img', {src: pic, alt: '', onerror: e => e.target.remove()}) : null,
    $('div', {}, $('h1', {}, b.name), $('div', {class: 'site'}, data.site)));
}

function notRight(data) {
  return $('div', {class: 'foot'},
    $('button', {class: 'link', onclick: () => open(searchUrl(siteLabel(data.site)))}, 'Not the right brand?'),
    $('span', {}, 'UK ads · Meta Ad Library'));
}

function renderFound(data) {
  const b = data.brand, a = data.ads;
  const count = a.count + (a.more ? '+' : '');
  badge(a.count > 99 || a.more && a.count >= 99 ? '99+' : String(a.count));
  show(
    brandHead(data),
    $('div', {class: 'stats'},
      $('div', {class: 'stat'}, $('b', {}, count), $('span', {}, a.count === 1 && !a.more ? 'ad live in the UK' : 'ads live in the UK')),
      $('div', {class: 'stat'}, $('b', {}, String(a.newThisWeek)), $('span', {}, 'launched this week'))),
    data.summary ? $('div', {class: 'summary'}, $('span', {class: 'k'}, '✦ AI summary'), $('p', {}, data.summary)) : null,
    data.top?.length ? $('div', {class: 'label'}, 'Top ads by UK reach') : null,
    data.top?.length ? $('div', {class: 'grid'}, data.top.map(ad =>
      $('button', {class: 'ad', title: ad.title || 'Open on AdSnoop', 'aria-label': ad.title || 'Live ad', onclick: () => open(brandUrl(b))},
        ad.image ? $('img', {class: 'img', src: ad.image, alt: '', loading: 'lazy', onerror: e => e.target.replaceWith($('span', {class: 'noimg'}, 'Ad'))}) : $('span', {class: 'noimg'}, 'Video'),
        ad.reach ? $('span', {class: 't'}, fmt(ad.reach) + ' reach') : null))) : null,
    $('div', {class: 'actions'},
      $('button', {class: 'btn primary', onclick: () => open(brandUrl(b))}, `See all ${b.name}'s ads →`),
      $('button', {class: 'btn secondary', onclick: () => open(brandUrl(b, '&do=pin'))}, '☆ Pin as a competitor')),
    $('p', {class: 'remix'}, $('button', {class: 'link', onclick: () => open(brandUrl(b))}, '✦ Remix any of their ads for your brand')),
    notRight(data));
}

function renderNoAds(data) {
  badge('0');
  show(brandHead(data),
    $('div', {class: 'msg', style: 'margin-top:14px'}, $('p', {}, `${data.brand.name} isn't running any ads in the UK right now.`)),
    $('div', {class: 'actions'}, $('button', {class: 'btn primary', onclick: () => open(brandUrl(data.brand))}, 'Open on AdSnoop →')),
    notRight(data));
}

function renderMessage(title, text, value = '', retry = false) {
  show($('div', {class: 'msg'}, $('h1', {}, title), $('p', {}, text)),
    retry ? $('div', {class: 'actions'}, $('button', {class: 'btn secondary', onclick: () => run()}, 'Try again')) : null,
    searchForm(value));
}

async function run() {
  show($('div', {class: 'loading'}, $('span', {class: 'ring', 'aria-hidden': 'true'}),
    $('p', {}, $('b', {}, "Finding this brand's ads…"), $('br'), site ? `Checking ${site}` : 'Checking the site')));
  let data = null, status = 0;
  try {
    const r = await fetch(`${ADSNOOP}/api/lookup?site=${encodeURIComponent(site)}`, {signal: AbortSignal.timeout(90000)});
    status = r.status; data = await r.json().catch(() => null);
  } catch {}
  if (data?.status === 'found' && data.brand && data.ads) return renderFound(data);
  if (data?.status === 'no_ads' && data.brand) return renderNoAds(data);
  if (data?.status === 'not_found') { badge(''); return renderMessage("We couldn't find ads for this site", "We couldn't match this website to an advertiser. Try searching for the brand by name.", siteLabel(data.site)); }
  if (data?.status === 'not_brand_site') return renderMessage("Open a brand's website", "Go to a brand's own website, then click AdSnoop again to see the ads it's running. Or search for a brand here.");
  if (status === 429) return renderMessage('Give it a minute', "You've looked up a lot of sites in a short time. Please try again in a minute.", siteLabel(site), true);
  renderMessage("AdSnoop couldn't check this site just now", 'This can happen while the site wakes up. Please try again.', siteLabel(site), true);
}

chrome.tabs.query({active: true, currentWindow: true}, ([tab]) => {
  tabId = tab?.id ?? null;
  let url = null;
  try { url = new URL(tab?.url || ''); } catch {}
  if (!url || !/^https?:$/.test(url.protocol)) return renderMessage("Open a brand's website", "Go to a brand's own website, then click AdSnoop again to see the ads it's running. Or search for a brand here.");
  site = url.hostname;
  run();
});
