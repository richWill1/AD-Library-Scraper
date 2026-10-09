# AD Library Scraper

Interactive creative research dashboard with a verified Sharps sample and server-side Meta Ad Library search.

## Run locally

Use Node.js 22. Run `npm ci`, `npm run dev`, and open http://localhost:3000.

## Render

Node web service. Build: `npm ci && npm run build`. Start: `npm start`. Binds `0.0.0.0` at Render's `PORT`. Configure `META_ACCESS_TOKEN` privately in Render environment settings. Never use a NEXT_PUBLIC token variable or commit credentials. Without a token, sample browsing works and searches explain the missing connection.

## Search and data

Calls Meta v26.0 ads_archive for active ads reached in GB. Sharps resolves to verified Page ID 280531915302272. Every new brand/URL search first displays advertiser choices with public Facebook Page logos, then loads ad details only after selection. Missing logos fall back to initials. Other brand names and URLs become keyword discovery queries. Discovery requests use only advertiser identity fields; users select the matching advertiser before a Page ID search. URLs are not fetched and domain ownership is not automatically verified. Pagination uses an opaque cursor; Meta paging URLs and tokens are never returned to the browser. Server requests time out after 20 seconds, results cache for five minutes and each client IP is limited to 20 requests/minute in each server instance. Free Render restarts reset these in-memory limits and caches.

The advertiser workspace supports top UK reach, available impression-range lower bounds, longest running and newest sorting; filters for platform, funnel estimate, recent starts and minimum reach; copy grouping; side-by-side comparison of three ads; locally saved ad records and notes; CSV export and editable-note creative test brief exports. Identical copy grouping is not visual creative deduplication. Rankings cover loaded pages only, with missing values last. Impressions are requested but shown as unavailable when absent; they are never inferred from reach.

Cards show platforms, UK reach when available, start date, elapsed days, target locations, ages and an explicitly editorial funnel estimate. Reach can be unavailable and must not be summed as unique people across ads. The API does not supply a reliable playable media URL in this integration: actual creatives open on Meta; format is unknown for live results. Sample images are labelled website references, not ad thumbnails. Sample running times are frozen at 8 October 2026. Saved IDs and following persist on this browser only.

## Health

GET /api/health reports server health and whether a token is configured, not token validity. Live validity must be checked with an actual search. Expired credentials receive a safe renewal message without exposing Meta response details.

## Session and media previews

Refresh restores the current research session, selected advertiser, loaded records, filters and open details from this tab's sessionStorage. Metadata retains its original retrieval date; refresh the live search explicitly to fetch new data. Autoplay preference persists in localStorage.

Our own media route reads `data/collected-media.json`, a batch of video URLs matched to Library IDs from the rendered Meta Ad Library DOM. It does not call another ad SaaS. This is an operator-collected proof of playback, not automatic collection for arbitrary brands. Missing ads retain their Meta link. Collection records carry the observation time; the server refuses batches older than six hours and CDN URLs past their signed expiry. A Render deploy ships the batch, so deploys/restarts preserve it until expiry. Refresh reloads media by the restored ad ID. No Meta cookies or access tokens are stored with the creative records.

Videos start muted inline, loop, pause off-screen/background, and appear in the detail panel too. Actual file playback failure shows a Meta link. Each collected card labels its collection date. Autoplay remains subject to browser policy.

The next collection milestone is an owned service that refreshes these records for each selected advertiser. A direct public HTTP test received Meta's browser challenge; do not treat bypassing that challenge or borrowing the operator's login cookies as a production solution. Accounts, billing, durable research storage and fully automatic collection are not implemented yet.

## Brand discovery improvements

Editing the search field immediately removes stale advertiser results and automatically discovers advertisers after a 700 ms typing pause (minimum two characters). Superseded browser requests are aborted and ignored. Closest advertiser-name matches appear first; discovery retrieves up to 100 ads per page and supports further pagination. Searches support business domains, Facebook Page URLs and numeric Page IDs. Domain normalization handles subdomains and common multipart suffixes. Website queries remain hints, not verified domain-to-Page ownership.

Search coverage can be United Kingdom or UK + EU (all 27 EU countries). The selected coverage persists with the research session. Both discovery and Page ID searches request active ads within that scope. This is not worldwide commercial-ad coverage or a complete advertiser directory. UK reach remains explicitly UK reach even for EU searches; missing UK reach is unavailable. Broader search does not automatically collect media.

## Messaging map

The Messaging map tab maps the loaded, filtered ad text into hooks, benefits, offers, proof/reassurance and next steps. Deterministic text rules detect themes; this is not AI visual analysis, verified brand claims or measured performance. Each theme includes its exact text evidence, overlapping ad count, and distinct full-copy patterns. Evidence examples rank by available UK reach and open the existing ad/brief panel. Full-copy groups may share the same short evidence excerpt.

Users can edit a test direction per theme. Notes persist locally per advertiser and are included in the plain-text map export. The map view itself persists with the research session. Theme rules currently recognise English phrases; other languages and ads without usable text may have no detected themes. More pages or changed filters rebuild the map from the current loaded records.

## Owned collection feasibility and companion prototype

An isolated free Render Docker collector was deployed and tested against Neville Johnson ad 1443215247729112. Chromium launched successfully, but Meta rejected the public preview request (`META_BLOCKED`). This server is not connected to the website's media route and is not a working automatic creative solution. It has its own private secret and never receives Meta credentials.

The source-reviewed companion prototype in `companion/` is packaged at `/downloads/creative-companion.zip`. For live ad records with a Page ID and no collected batch media, the card probes for the companion, requests a matching preview if it is installed, and validates returned CDN URLs. The companion uses an authenticated customer browser session without extracting cookies or tokens. A `/creative-connection` page explains its access and installation. No extension has been installed or tested end to end; do not describe playback across brands as complete. UK preview scope, English Library ID labels, one concurrent lookup and Meta access restrictions are current limits.

## Creative Lab interface

The research UI uses warm paper surfaces, navy display typography, an orange primary action, and lavender/mint/pink/yellow messaging accents. An original inline SVG moodboard and eye mark provide the playful visual identity; the illustration is decorative, not an actual ad or a media preview. Branding remains AD Library Scraper. Responsive layouts were checked at desktop size and 390 px, including theme clicks and the ad detail panel. This visual update does not change API coverage or complete the unverified creative companion.
