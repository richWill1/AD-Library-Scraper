// Original vector illustrations for Insights articles and categories.
// Each one is a small, self-contained SVG (no text, no external assets) so it
// stays crisp at any size, weighs a few KB and renders identically in social
// previews. Pick one per article with the `art` frontmatter field.

const W = 1200, H = 675;

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
}
const rgba = (hex, a) => `rgba(${hexToRgb(hex).join(',')},${a})`;

function frame(id, accent, body) {
  // Shared backdrop: deep navy, a soft accent glow and a faint dot grid.
  const dots = [];
  for (let x = 40; x < W; x += 40) for (let y = 40; y < H; y += 40) dots.push(`M${x} ${y}h.01`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-hidden="true">
<defs>
<linearGradient id="${id}-bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#070b1d"/><stop offset="1" stop-color="#0e1836"/></linearGradient>
<radialGradient id="${id}-glow" cx=".72" cy=".18" r=".75"><stop offset="0" stop-color="${rgba(accent, .55)}"/><stop offset=".55" stop-color="${rgba(accent, .08)}"/><stop offset="1" stop-color="${rgba(accent, 0)}"/></radialGradient>
<radialGradient id="${id}-glow2" cx=".1" cy="1" r=".6"><stop offset="0" stop-color="rgba(100,210,255,.18)"/><stop offset="1" stop-color="rgba(100,210,255,0)"/></radialGradient>
<linearGradient id="${id}-a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${accent}"/><stop offset="1" stop-color="${rgba(accent, .25)}"/></linearGradient>
<linearGradient id="${id}-w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="rgba(255,255,255,.9)"/><stop offset="1" stop-color="rgba(255,255,255,.35)"/></linearGradient>
<filter id="${id}-blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="18"/></filter>
</defs>
<rect width="${W}" height="${H}" fill="url(#${id}-bg)"/>
<rect width="${W}" height="${H}" fill="url(#${id}-glow)"/>
<rect width="${W}" height="${H}" fill="url(#${id}-glow2)"/>
<path d="${dots.join('')}" stroke="rgba(255,255,255,.13)" stroke-width="2.4" stroke-linecap="round"/>
${body}
</svg>`;
}

const glass = (x, y, w, h, r = 22, extra = '') =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="rgba(255,255,255,.055)" stroke="rgba(255,255,255,.16)" stroke-width="1.5" ${extra}/>`;

const ART = {
  // Revenue bars shrinking to profit bars, with a break-even line.
  'roas-poas'(id, c) {
    const rev = [300, 360, 330, 420, 390, 470];
    const prof = [70, 40, 95, 30, 120, 55];
    let bars = '';
    rev.forEach((v, i) => {
      const x = 250 + i * 120, base = 560;
      bars += `<rect x="${x}" y="${base - v}" width="44" height="${v}" rx="10" fill="rgba(255,255,255,.12)" stroke="rgba(255,255,255,.22)"/>`;
      bars += `<rect x="${x + 50}" y="${base - prof[i]}" width="44" height="${prof[i]}" rx="10" fill="url(#${id}-a)"/>`;
    });
    return `${glass(190, 80, 820, 530, 30)}${bars}
<path d="M220 495H980" stroke="${c}" stroke-width="3" stroke-dasharray="10 10" opacity=".9"/>
<circle cx="980" cy="495" r="9" fill="${c}"/><circle cx="980" cy="495" r="26" fill="${c}" opacity=".25" filter="url(#${id}-blur)"/>
<path d="M240 140 Q 520 110 640 190 T 960 150" fill="none" stroke="rgba(255,255,255,.5)" stroke-width="3" stroke-linecap="round"/>`;
  },
  // A wall of ad cards with the AdSnoop lens scanning across them.
  'competitor-lens'(id, c) {
    let cards = '';
    const hi = new Set([2, 7, 9]);
    for (let r = 0; r < 3; r++) for (let k = 0; k < 5; k++) {
      const i = r * 5 + k, x = 150 + k * 186 + (r % 2 ? 40 : 0), y = 90 + r * 172;
      const on = hi.has(i);
      cards += `<g opacity="${on ? 1 : .7}">${glass(x, y, 150, 140, 16)}${on ? `<rect x="${x}" y="${y}" width="150" height="140" rx="16" fill="none" stroke="${c}" stroke-width="2.5"/>` : ''}
<rect x="${x + 14}" y="${y + 14}" width="122" height="66" rx="9" fill="${on ? rgba(c, .55) : 'rgba(255,255,255,.1)'}"/>
<rect x="${x + 14}" y="${y + 92}" width="96" height="9" rx="4.5" fill="rgba(255,255,255,.32)"/>
<rect x="${x + 14}" y="${y + 110}" width="64" height="9" rx="4.5" fill="rgba(255,255,255,.18)"/></g>`;
    }
    return `${cards}
<g transform="translate(690 350)"><circle r="150" fill="${rgba(c, .1)}" filter="url(#${id}-blur)"/>
<circle cx="-54" r="44" fill="rgba(7,11,29,.55)" stroke="#fff" stroke-width="9"/><circle cx="54" r="44" fill="rgba(7,11,29,.55)" stroke="#fff" stroke-width="9"/>
<circle cx="-40" cy="4" r="17" fill="#fff"/><circle cx="68" cy="4" r="17" fill="#fff"/></g>`;
  },
  // Three formats floating together: video, static, carousel, plus a mix ring.
  'format-mix'(id, c) {
    const ring = (r, frac, off, col) => {
      const C = 2 * Math.PI * r;
      return `<circle r="${r}" fill="none" stroke="${col}" stroke-width="26" stroke-dasharray="${C * frac} ${C}" stroke-dashoffset="${-C * off}" transform="rotate(-90)" stroke-linecap="round"/>`;
    };
    return `<g transform="translate(250 250) rotate(-6)">${glass(-120, -150, 240, 300, 26)}<rect x="-96" y="-126" width="192" height="200" rx="16" fill="${rgba(c, .5)}"/>
<path d="M-22 -60 L38 -26 L-22 8Z" fill="#fff"/><rect x="-96" y="94" width="150" height="10" rx="5" fill="rgba(255,255,255,.4)"/><rect x="-96" y="116" width="100" height="10" rx="5" fill="rgba(255,255,255,.2)"/></g>
<g transform="translate(600 300) rotate(3)">${glass(-120, -150, 240, 300, 26)}<rect x="-96" y="-126" width="192" height="200" rx="16" fill="rgba(100,210,255,.35)"/>
<path d="M-96 50 L-30 -20 L20 30 L50 0 L96 50Z" fill="rgba(255,255,255,.75)"/><circle cx="50" cy="-70" r="20" fill="#fff"/><rect x="-96" y="94" width="150" height="10" rx="5" fill="rgba(255,255,255,.4)"/></g>
<g transform="translate(950 250) rotate(7)">${glass(-90, -140, 200, 270, 22, 'opacity=".5"')}${glass(-105, -150, 200, 270, 22, 'opacity=".75"')}${glass(-120, -160, 200, 270, 22)}
<rect x="-100" y="-140" width="160" height="170" rx="14" fill="rgba(232,119,46,.55)"/><circle cx="-60" cy="70" r="7" fill="#fff"/><circle cx="-38" cy="70" r="7" fill="rgba(255,255,255,.4)"/><circle cx="-16" cy="70" r="7" fill="rgba(255,255,255,.4)"/></g>
<g transform="translate(600 560)">${ring(70, .42, 0, c)}${ring(70, .3, .45, 'rgba(100,210,255,.9)')}${ring(70, .18, .78, 'rgba(232,119,46,.9)')}</g>`;
  },
  // Performance that slowly decays, lifted again by each creative refresh.
  'fatigue-curve'(id, c) {
    const pts = [];
    let x = 120;
    const segs = [[480, 330], [330, 260], [420, 300]];
    let d = '';
    segs.forEach(([y0, y1], s) => {
      const x0 = x, x1 = x + 310;
      d += `${s ? 'L' : 'M'}${x0} ${H - y0} C ${x0 + 120} ${H - y0 + 10}, ${x1 - 120} ${H - y1 - 20}, ${x1} ${H - y1} `;
      pts.push([x0, H - y0]);
      x = x1 + 10;
    });
    const dots = pts.map(([px, py]) => `<circle cx="${px}" cy="${py}" r="10" fill="#fff"/><circle cx="${px}" cy="${py}" r="30" fill="${c}" opacity=".35" filter="url(#${id}-blur)"/><path d="M${px} ${py + 26}V585" stroke="rgba(255,255,255,.25)" stroke-dasharray="4 8" stroke-width="2"/>`).join('');
    return `${glass(80, 70, 1040, 540, 30)}
<path d="M120 585H1080" stroke="rgba(255,255,255,.18)" stroke-width="2"/>
<path d="${d}" fill="none" stroke="${c}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
<path d="${d}" fill="none" stroke="${c}" stroke-width="22" opacity=".25" filter="url(#${id}-blur)"/>
<path d="M120 ${H - 200} C 400 ${H - 230}, 700 ${H - 320}, 1080 ${H - 420}" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="3" stroke-dasharray="12 12"/>
${dots}`;
  },
  // Browser and server paths converging into one deduplicated event.
  'capi-flow'(id, c) {
    return `<g>${glass(110, 120, 300, 200, 22)}<circle cx="140" cy="148" r="6" fill="#ff6b6b"/><circle cx="160" cy="148" r="6" fill="#ffd166"/><circle cx="180" cy="148" r="6" fill="#06d6a0"/>
<rect x="136" y="176" width="248" height="16" rx="8" fill="rgba(255,255,255,.3)"/><rect x="136" y="206" width="180" height="16" rx="8" fill="rgba(255,255,255,.16)"/><rect x="136" y="250" width="110" height="40" rx="12" fill="${rgba(c, .7)}"/></g>
<g>${glass(110, 380, 300, 200, 22)}${[0, 1, 2].map(i => `<rect x="140" y="${408 + i * 54}" width="240" height="38" rx="10" fill="rgba(255,255,255,.08)" stroke="rgba(255,255,255,.2)"/><circle cx="162" cy="${427 + i * 54}" r="6" fill="${i === 1 ? c : 'rgba(100,210,255,.9)'}"/>`).join('')}</g>
<path d="M410 220 C 620 220, 640 340, 800 340" fill="none" stroke="rgba(100,210,255,.9)" stroke-width="6" stroke-linecap="round"/>
<path d="M410 480 C 620 480, 640 340, 800 340" fill="none" stroke="${c}" stroke-width="6" stroke-linecap="round"/>
<circle cx="880" cy="340" r="120" fill="${rgba(c, .3)}" filter="url(#${id}-blur)"/>
<circle cx="880" cy="340" r="84" fill="rgba(7,11,29,.7)" stroke="#fff" stroke-width="5"/>
<path d="M842 342 L870 370 L922 312" fill="none" stroke="#fff" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>`;
  },
  // Fallback: concentric signal rings in the category colour.
  rings(id, c) {
    return `<g transform="translate(600 340)">${[60, 120, 180, 240, 300].map((r, i) => `<circle r="${r}" fill="none" stroke="${i % 2 ? 'rgba(255,255,255,.18)' : c}" stroke-width="${i === 0 ? 8 : 2}" opacity="${1 - i * .15}"/>`).join('')}
<circle r="26" fill="#fff"/><circle r="90" fill="${rgba(c, .35)}" filter="url(#${id}-blur)"/></g>`;
  },
};

export const ART_KEYS = Object.keys(ART);

export function renderArt(key, accent) {
  const fn = ART[key] || ART.rings;
  const id = 'a' + (key || 'rings').replace(/[^a-z0-9]/gi, '');
  return frame(id, accent, fn(id, accent));
}
