# AD Library Scraper

Interactive creative research dashboard. This first version uses a verified Sharps sample captured on 8 October 2026. Search accepts brand names and URLs; brands outside the sample link to advertiser discovery on Meta. Live Meta API search is not connected.

## Run locally

Use Node.js 22. Run `npm ci`, `npm run dev`, and open http://localhost:3000.

## Render

Create a Node web service from this repository. Build: `npm ci && npm run build`. Start: `npm start`. The server listens on `0.0.0.0` at Render's `PORT`. No secrets are required for the sample interface.

## Data and imagery

The sample contains captured Meta ad metadata and editorial messaging analysis. Images are explicitly labelled Sharps website references, not exact ad thumbnails. Links open the actual creatives in Meta. Saved creatives and followed brands persist only in browser storage on the current device.

## Next integration steps

Connect server-side Meta API access, advertiser resolution, pagination and supported video media delivery. Keep access tokens out of browser bundles, URLs, source control and logs.
