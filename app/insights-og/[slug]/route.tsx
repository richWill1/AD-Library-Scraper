import { ImageResponse } from 'next/og';
import fs from 'node:fs';
import path from 'node:path';

// Social preview images for Insights, rendered once at build time from the
// manifest and illustrations that scripts/build-insights.mjs generates.
type Entry = { title: string; category: string; colour: string; art: string };

export const dynamic = 'force-static';
export const dynamicParams = false;

function manifest(): Record<string, Entry> {
  try {
    return JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public/insights-assets/manifest.json'), 'utf8'));
  } catch {
    return {};
  }
}

export function generateStaticParams() {
  return Object.keys(manifest()).map(slug => ({ slug }));
}

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const entry = manifest()[slug];
  if (!entry) return new Response('Not found', { status: 404 });
  let art = '';
  try {
    art = 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(process.cwd(), 'public/insights-art', `${entry.art}.svg`)).toString('base64');
  } catch {}
  const size = entry.title.length > 70 ? 54 : 62;
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', position: 'relative', background: '#070b1d', color: '#fff' }}>
        {art ? <img src={art} width={1200} height={675} style={{ position: 'absolute', top: -22, left: 0, opacity: 0.35 }} alt="" /> : null}
        <div style={{ position: 'absolute', inset: 0, display: 'flex', background: 'linear-gradient(90deg, rgba(7,11,29,.96) 0%, rgba(7,11,29,.82) 55%, rgba(7,11,29,.25) 100%)' }} />
        <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '64px 72px', width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 30, fontWeight: 700, letterSpacing: -1 }}>
            <div style={{ display: 'flex', gap: 6 }}>
              <div style={{ width: 30, height: 30, borderRadius: 30, border: '5px solid #fff', display: 'flex' }} />
              <div style={{ width: 30, height: 30, borderRadius: 30, border: '5px solid #fff', display: 'flex' }} />
            </div>
            AdSnoop Insights
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 22, maxWidth: 900 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 26, color: entry.colour, fontWeight: 700 }}>
              <div style={{ width: 14, height: 14, borderRadius: 14, background: entry.colour, display: 'flex' }} />
              {entry.category}
            </div>
            <div style={{ fontSize: size, lineHeight: 1.08, fontWeight: 700, letterSpacing: -2 }}>{entry.title}</div>
          </div>
          <div style={{ display: 'flex', fontSize: 24, color: '#aab6d3' }}>adsnoop.co.uk/insights</div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
