# AD Library Scraper

Interactive creative research dashboard with a verified Sharps sample and server-side Meta Ad Library search.

## Run locally

Use Node.js 22. Run `npm ci`, `npm run dev`, and open http://localhost:3000.

## Render

Node web service. Build: `npm ci && npm run build`. Start: `npm start`. Binds `0.0.0.0` at Render's `PORT`. Configure `META_ACCESS_TOKEN` privately in Render environment settings. Never use a NEXT_PUBLIC token variable or commit credentials. Without a token, sample browsing works and searches explain the missing connection.

## Search and data

Calls Meta v26.0 ads_archive for active ads reached in GB. Sharps resolves to verified Page ID 280531915302272. Other brand names and URLs become keyword discovery queries: users select the matching advertiser before a Page ID search. URLs are not fetched and domain ownership is not automatically verified. Pagination uses an opaque cursor; Meta paging URLs and tokens are never returned to the browser. Server requests time out after 20 seconds, results cache for five minutes and each client IP is limited to 20 requests/minute in each server instance. Free Render restarts reset these in-memory limits and caches.

The advertiser workspace supports top UK reach, available impression-range lower bounds, longest running and newest sorting; filters for platform, funnel estimate, recent starts and minimum reach; copy grouping; side-by-side comparison of three ads; locally saved ad records and notes; CSV export and editable-note creative test brief exports. Identical copy grouping is not visual creative deduplication. Rankings cover loaded pages only, with missing values last. Impressions are requested but shown as unavailable when absent; they are never inferred from reach.

Cards show platforms, UK reach when available, start date, elapsed days, target locations, ages and an explicitly editorial funnel estimate. Reach can be unavailable and must not be summed as unique people across ads. The API does not supply a reliable playable media URL in this integration: actual creatives open on Meta; format is unknown for live results. Sample images are labelled website references, not ad thumbnails. Sample running times are frozen at 8 October 2026. Saved IDs and following persist on this browser only.

## Health

GET /api/health reports server health and whether a token is configured, not token validity. Live validity must be checked with an actual search. Expired credentials receive a safe renewal message without exposing Meta response details.
