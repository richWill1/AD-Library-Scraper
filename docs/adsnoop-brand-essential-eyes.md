# AdSnoop — Essential Eyes brand system (preview)
Status: Approved direction, preview implementation (18 November 2026). Production remains on `main`.

## Signature
Two geometric O-shaped eyes replace the two letters in Snoop. Two single-stroke circles and two offset pupils: no eyelashes, no magnifying glasses, no added eyebrows. The custom AdSn+p letters use Inter Display Bold outlines converted to vector paths. Wordmark is completely scalable and does not depend on a font file in the browser.

## Logo assets
- `/brand/adsnoop-wordmark-dark.svg` — navy-on-light full wordmark
- `/brand/adsnoop-wordmark-light.svg` — white-on-dark full wordmark
- `/brand/adsnoop-eyes-dark.svg` — standalone navy-on-light mark
- `/brand/adsnoop-eyes-light.svg` — standalone white-on-dark mark
- `/brand/favicon-light.svg` and `/brand/favicon-dark.svg` — colour-scheme-aware favicons
- `/brand/adsnoop-loader.svg` — animated pupils for research loading, reduced-motion accessible

## Colours
- Midnight Ink: `#0B1734`, core logo and identity
- Paper: `#F7F9FC`, cool light background
- White: `#FFFFFF`, reverse mark
- Product action blue: `#0066CC`, retained from the existing website UI
- Optional soft lavender accent: `#B18ADD`, sparing use for future campaigns only

## Usage
Use light SVG logo in the website's existing dark navigation. Use dark SVG logo on white/off-white content. Never recolour eye pupils independently. Use only the two-eye symbol at favicon sizes, never compress the full wordmark into an icon. Keep clear space around the eyes equal to at least half an eye radius. Target a minimum rendered mark height of 20 px for icon-only uses and 24 px for full wordmark.

## Motion
The two pupils slowly track side-to-side during advertiser loading and media collection. No spinning, flashing or exaggerated blinking. Built-in `prefers-reduced-motion` disables this animation. The animation changes presentation only; search logic/API behaviour remains unchanged.

## Release protection
All initial branding changes are confined to GitHub branch `preview/apple-inspired-adsnoop` (Render `adsnoop-live-design-test`, `preview.adsnoop.co.uk`). Production branch `main` is not updated.
