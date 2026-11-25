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
const dock = document.getElementById('dock');
const fmt = n => n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'm' : n >= 1000 ? Math.round(n / 1000) + 'k' : String(n);
const UTM = 'utm_source=chrome-extension&utm_medium=extension';
const brandUrl = (b, extra = '') => `${ADSNOOP}/?page=${encodeURIComponent(b.id)}&name=${encodeURIComponent(b.name)}${extra}&${UTM}`;
const searchUrl = q => `${ADSNOOP}/?q=${encodeURIComponent(q)}&${UTM}`;
const open = url => { chrome.tabs.create({url}); window.close(); };
const show = (...nodes) => main.replaceChildren(...nodes.filter(Boolean));
const setDock = (...nodes) => { dock.replaceChildren(...nodes.filter(Boolean)); dock.hidden = !dock.childNodes.length; };
let tabId = null, site = '';

if (!/^https:\/\/adsnoop\.co\.uk$/.test(ADSNOOP)) document.getElementById('env').hidden = false;
document.getElementById('openapp').addEventListener('click', () => open(`${ADSNOOP}/?${UTM}`));

function badge(text) {
  if (tabId == null) return;
  try { chrome.action.setBadgeBackgroundColor({tabId, color: '#0071e3'}); chrome.action.setBadgeText({tabId, text}); } catch {}
}

// The site you're on, shown under the logo: its icon, address and page title.
function showTab(tab, host) {
  const fav = document.getElementById('fav');
  const letter = () => fav.replaceChildren((host || '?').charAt(0));
  if (/^(https:|data:image\/)/.test(tab?.favIconUrl || '')) fav.replaceChildren($('img', {src: tab.favIconUrl, alt: '', onerror: letter})); else letter();
  document.getElementById('tabhost').textContent = host;
  document.getElementById('tabtitle').textContent = (tab?.title || '').replace(/\s+/g, ' ').trim().slice(0, 120);
  document.getElementById('tab').hidden = false;
}

function searchForm(value = '') {
  return $('form', {class: 'search', onsubmit: e => { e.preventDefault(); const q = e.target.q.value.trim(); if (q) open(searchUrl(q)); }},
    $('input', {name: 'q', type: 'search', value, placeholder: 'Search a brand or website', 'aria-label': 'Search AdSnoop', maxlength: '120'}),
    $('button', {class: 'btn primary', type: 'submit'}, 'Search'));
}
const siteLabel = host => (host || '').split('.')[0].replace(/-/g, ' ');

function avatar(b) {
  const initial = () => $('div', {class: 'avatar', 'aria-hidden': 'true'}, b.name.charAt(0));
  const pic = b.picture || b.logo;
  return pic ? $('img', {class: 'avatar', src: pic, alt: '', onerror: e => e.target.replaceWith(initial())}) : initial();
}

function brandCard(data) {
  const b = data.brand, m = data.match || {};
  const sub = [b.handle ? '@' + b.handle : '', b.category || ''].filter(Boolean).join(' · ') || 'Advertiser on Facebook and Instagram';
  const chips = [
    m.linkedOnSite ? $('span', {class: 'chip green'}, '✓ Linked on this site') : null,
    m.adsLinkToSite ? $('span', {class: 'chip blue'}, `Ads point to ${data.site}`) : null,
    m.nameMatches && !(m.linkedOnSite && m.adsLinkToSite) ? $('span', {class: 'chip'}, 'Name matches') : null,
  ].filter(Boolean);
  return $('section', {class: 'card'},
    $('div', {class: 'brand'}, avatar(b), $('div', {}, $('h1', {}, b.name), $('div', {class: 'sub'}, sub))),
    chips.length ? $('div', {class: 'chips'}, chips) : null);
}

function status(data) {
  return $('div', {class: 'status'}, $('span', {class: 'dot', 'aria-hidden': 'true'}), `Matched to ${data.site}`, $('span', {class: 'r'}, 'UK ads'));
}

function adTile(ad, b) {
  const label = ad.title || 'Live ad';
  return $('button', {class: 'ad', title: label, 'aria-label': label, onclick: () => open(brandUrl(b))},
    ad.image ? $('img', {src: ad.image, alt: '', loading: 'lazy', onerror: e => e.target.replaceWith($('span', {class: 'noimg'}, label))}) : $('span', {class: 'noimg'}, ad.video ? 'Video ad' : label),
    ad.video ? $('span', {class: 'play', 'aria-hidden': 'true'}, '▶') : null,
    ad.reach ? $('span', {class: 'reach'}, fmt(ad.reach) + ' reach') : null);
}

function notRight(data) {
  return $('div', {class: 'small'},
    $('button', {class: 'link', onclick: () => open(searchUrl(siteLabel(data.site)))}, 'Not the right brand?'),
    $('span', {}, 'Source: Meta Ad Library'));
}

function renderFound(data) {
  const b = data.brand, a = data.ads;
  const count = a.count + (a.more ? '+' : '');
  const grid = (data.grid?.length ? data.grid : data.top || []).slice(0, 9);
  badge(a.count > 99 || a.more && a.count >= 99 ? '99+' : String(a.count));
  const minis = [
    [String(a.newThisWeek), 'new this week'],
    typeof a.instagram === 'number' ? [String(a.instagram) + (a.more ? '+' : ''), 'on Instagram'] : null,
    typeof a.facebook === 'number' ? [String(a.facebook) + (a.more ? '+' : ''), 'on Facebook'] : null,
  ].filter(Boolean);
  show(
    status(data),
    brandCard(data),
    $('section', {class: 'card'},
      $('div', {class: 'count'},
        $('div', {}, $('div', {class: 'n'}, count), $('div', {class: 'l'}, a.count === 1 && !a.more ? 'ad running in the UK right now' : 'ads running in the UK right now')),
        $('span', {class: 'live'}, $('i', {'aria-hidden': 'true'}), 'Running now')),
      $('div', {class: 'mini'}, minis.map(([n, l]) => $('div', {}, $('b', {}, n), $('span', {}, l))))),
    data.summary ? $('section', {class: 'card summary'}, $('span', {class: 'k'}, '✦ WHAT THEY’RE PUSHING'), $('p', {}, data.summary)) : null,
    grid.length ? $('div', {class: 'head'}, $('b', {}, 'Their biggest ads right now'), $('span', {}, 'by UK reach')) : null,
    grid.length ? $('div', {class: 'grid'}, grid.map(ad => adTile(ad, b))) : null);
  setDock(
    $('div', {class: 'row'},
      $('button', {class: 'btn primary grow', onclick: () => open(brandUrl(b))}, `See all ${count} ads →`),
      $('button', {class: 'btn secondary', onclick: () => open(brandUrl(b, '&do=pin'))}, '☆ Track')),
    $('div', {class: 'row'}, $('button', {class: 'btn secondary', onclick: () => open(brandUrl(b))}, '✦ Remix one of their ads for your brand')),
    notRight(data));
}

function renderNoAds(data) {
  badge('0');
  show(status(data), brandCard(data),
    $('section', {class: 'card msg'}, $('h1', {}, 'No ads running right now'), $('p', {}, `${data.brand.name} isn't running any ads in the UK at the moment. Track them and AdSnoop will show you when they start.`)));
  setDock(
    $('div', {class: 'row'},
      $('button', {class: 'btn primary grow', onclick: () => open(brandUrl(data.brand, '&do=pin'))}, '☆ Track this brand'),
      $('button', {class: 'btn secondary', onclick: () => open(brandUrl(data.brand))}, 'Open')),
    notRight(data));
}

function renderMessage(title, text, value = '', retry = false) {
  setDock();
  show($('section', {class: 'card msg'},
    $('div', {class: 'art', 'aria-hidden': 'true'}, $('img', {src: 'eyes.svg', alt: ''})),
    $('h1', {}, title), $('p', {}, text),
    retry ? $('div', {class: 'row', style: 'margin-top:12px'}, $('button', {class: 'btn secondary', onclick: () => run()}, 'Try again')) : null,
    searchForm(value)));
}

function renderLoading() {
  setDock();
  const sk = (w, h, r = 8) => $('div', {class: 'sk', style: `width:${w};height:${h}px;border-radius:${r}px`});
  show(
    $('div', {class: 'loadnote'}, $('span', {class: 'ring', 'aria-hidden': 'true'}), $('span', {}, $('b', {}, "Finding this brand's ads…"), site ? ` Checking ${site}` : '')),
    $('section', {class: 'card'}, $('div', {class: 'skrow'}, sk('52px', 52, 26), $('div', {style: 'flex:1;display:grid;gap:7px'}, sk('55%', 14), sk('35%', 11)))),
    $('section', {class: 'card'}, $('div', {class: 'skrow'}, sk('70px', 30), sk('45%', 12))),
    $('div', {class: 'grid'}, Array.from({length: 6}, () => $('div', {class: 'sk', style: 'aspect-ratio:4/5;border-radius:12px'}))));
}

async function run() {
  renderLoading();
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
  showTab(tab, site.replace(/^www\./, ''));
  run();
});
