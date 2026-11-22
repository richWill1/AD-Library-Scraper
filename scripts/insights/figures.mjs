// In-article diagrams, referenced from Markdown with `:::figure <name>`.
// Plain inline SVG with real text so they stay sharp, accessible and tiny.

const font = 'font-family="-apple-system,BlinkMacSystemFont,Inter,Segoe UI,sans-serif"';

const FIGURES = {
  // Hypothetical order: where £100 of revenue goes before it becomes profit.
  'poas-waterfall'() {
    const rows = [
      ['Order revenue (ex. VAT)', 100, 0, '#2f7bf6'],
      ['Cost of goods', -42, 100, '#94a3b8'],
      ['Shipping & fulfilment', -9, 58, '#94a3b8'],
      ['Payment fees', -2, 49, '#94a3b8'],
      ['Expected returns', -7, 47, '#94a3b8'],
      ['Contribution before ads', 40, 0, '#14a37f'],
      ['Meta ad cost (ROAS 3.0)', -33, 40, '#e8772e'],
      ['Contribution after ads', 7, 0, '#0f172a'],
    ];
    const x0 = 250, scale = 5.2, rowH = 44;
    let g = '';
    rows.forEach(([label, v, start, col], i) => {
      const y = 20 + i * rowH;
      const from = v < 0 ? start + v : start, w = Math.abs(v) * scale;
      g += `<text x="${x0 - 14}" y="${y + 23}" text-anchor="end" font-size="14" fill="currentColor" ${font}>${label}</text>`;
      g += `<rect x="${x0 + from * scale}" y="${y + 6}" width="${w}" height="26" rx="6" fill="${col}" opacity="${v < 0 ? .85 : 1}"/>`;
      g += `<text x="${x0 + (from + Math.abs(v)) * scale + 8}" y="${y + 24}" font-size="14" font-weight="650" fill="currentColor" ${font}>${v < 0 ? '−' : ''}£${Math.abs(v)}</text>`;
    });
    return {
      svg: `<svg viewBox="0 0 820 ${20 + rows.length * rowH + 10}" role="img" aria-labelledby="fig-poas-t"><title id="fig-poas-t">Waterfall from £100 revenue to £7 contribution after ad costs in a hypothetical order</title>${g}</svg>`,
      caption: 'Hypothetical example. A 3.0 ROAS means £33 of ad spend for this £100 order. Once product, fulfilment, fees and returns are paid, £7 of contribution is left.',
    };
  },
  // How browser and server events for one purchase are reconciled.
  'capi-dedup'() {
    const box = (x, y, w, h, title, sub, col) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="14" fill="${col}" fill-opacity=".1" stroke="${col}" stroke-width="1.5"/>
<text x="${x + 16}" y="${y + 28}" font-size="15" font-weight="700" fill="currentColor" ${font}>${title}</text><text x="${x + 16}" y="${y + 50}" font-size="12.5" fill="currentColor" opacity=".75" ${font}>${sub}</text>`;
    const arrow = (d) => `<path d="${d}" fill="none" stroke="currentColor" stroke-opacity=".45" stroke-width="2" marker-end="url(#ah)"/>`;
    return {
      svg: `<svg viewBox="0 0 820 260" role="img" aria-labelledby="fig-capi-t"><title id="fig-capi-t">Pixel and Conversions API events with the same event name and event ID are counted once</title>
<defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="currentColor" fill-opacity=".55"/></marker></defs>
${box(10, 20, 250, 70, 'Meta Pixel (browser)', "Purchase · eventID: ord_10482", '#2f7bf6')}
${box(10, 170, 250, 70, 'Conversions API (server)', 'Purchase · event_id: ord_10482', '#e8772e')}
${arrow('M262 55 C 340 55, 340 130, 410 130')}${arrow('M262 205 C 340 205, 340 130, 410 130')}
${box(414, 95, 190, 70, 'Meta matches', 'same name + ID ≤ 48h', '#8b5cf6')}
${arrow('M606 130 L 640 130')}
${box(644, 95, 166, 70, '1 purchase', 'counted once', '#14a37f')}</svg>`,
      caption: 'Meta deduplicates a browser and a server event when event_name and event_id match and arrive within 48 hours (Meta for Developers).',
    };
  },
};

export function renderFigure(name) {
  const f = FIGURES[name];
  if (!f) throw new Error(`Unknown figure "${name}"`);
  const { svg, caption } = f();
  return `<figure class="ins-figure"><div class="ins-figure-svg">${svg}</div><figcaption>${caption}</figcaption></figure>`;
}
