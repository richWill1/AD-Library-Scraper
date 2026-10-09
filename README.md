# AD Library Scraper

Interactive creative research dashboard with a verified Sharps sample and server-side Meta Ad Library search.

## Run locally

Use Node.js 22. Run `npm ci`, `npm run dev`, and open http://localhost:3000.

## Render

Node web service. Build: `npm ci && npm run build`. Start: `npm start`. Binds `0.0.0.0` at Render's `PORT`. Configure `META_ACCESS_TOKEN` privately in Render environment settings. Never use a NEXT_PUBLIC token variable or commit credentials. Without a token, sample browsing works and searches explain the missing connection.

## Search and data

Calls Meta v26.0 ads_archive for active ads reached in GB. Sharps resolves to verified Page ID 280531915302272. Every new brand/URL search first displays advertiser choices with public Facebook Page logos, then loads ad details only after selection. Missing logos fall back to initials. Other brand names and URLs become keyword discovery queries. Discovery requests use only advertiser identity fields; users select the matching advertiser before a Page ID search. URLs are not fetched and domain ownership is not automatically verified. Pagination uses an opaque cursor; Meta paging URLs and tokens are never returned to the browser. Server requests time out after 20 seconds, results cache for five minutes and each client IP is limited to 20 requests/minute in each server instance. Free Render restarts reset these in-memory limits and caches.

The advertiser workspace supports top UK reach, available impression-range lower bounds, longest running and newest sorting; filters for platform, funnel estimate, recent starts and minimum reach; copy grouping; side-by-side comparison of three ads; locally saved ad records and notes; CSV export and editable-note creative test brief exports. Identical copy grouping is not visual creative deduplication. Rankings cover loaded pages only, with missing values last. Impressions are requested but shown as unavailable when absent; they are never inferred from reach.

Cards show platforms, UK reach when available, start date, elapsed days, target locations, ages and an explicitly editorial funnel estimate. Reach can be unavailable and must not be summed as unique people across ads. The API supplies an official snapshot link rather than a direct playable file. Our server uses the private token with that official snapshot and the owned Render browser collector returns validated image/video CDN URLs. Media formats come from Meta format filters and observed previews; unmatched ads remain unclassified. Sample images are labelled website references, not ad thumbnails. Sample running times are frozen at 8 October 2026. Saved IDs and following persist on this browser only.

## Health

GET /api/health reports application health separately from the Meta connection. It probes the actual Ad Library endpoint (one ID, no ad copy), shares concurrent checks and caches observations for two minutes per server instance. Successful searches also update the observation. Credential presence alone is never reported as a verified connection. Expired, rejected, access-denied and unavailable states have distinct safe messages. No raw Meta error, token or account ID is exposed. Known token and data-access expiry are tracked; the earlier date governs the seven-day renewal warning. The dashboard shows this warning when opened. This is not a scheduled email alert or automatic renewal.

## Session and media previews

Refresh restores the current research session, selected advertiser, loaded records, filters and open details from this tab's sessionStorage. Metadata retains its original retrieval date; refresh the live search explicitly to fetch new data. Autoplay preference persists in localStorage.

Our media route now calls our own authenticated Render snapshot collector for each requested ad ID. The collector renders Meta’s official `/ads/archive/render_ad/` snapshot using the existing token in memory, matches the exact visible Library ID, and extracts the actual video/image elements. It also reads the same snapshot’s media metadata and video file requests when Meta uses streaming playback; audio-only streams are excluded and partial-byte parameters are removed from video file URLs. The initial API snapshot links have an empty token parameter when bearer authentication is used; the collector fills it privately on Meta’s own origin. No operator login cookies, browser companion, third-party ad SaaS, or Meta token in client responses are needed for this path.

Set META_MEDIA_COLLECTOR_URL to the exact owned collector origin and META_MEDIA_COLLECTOR_SECRET privately on the main service. The matching COLLECTOR_SECRET protects the collector. Only that exact origin is accepted; redirects are rejected. The main service passes the Meta token in a private HTTPS request header; the collector does not persist it. Incoming URLs and logs contain only numeric ad IDs, never the token. Collector errors are fixed codes, not raw browser error text. Returned media must be HTTPS fbcdn.net URLs without access_token, valid kind, unique URL and unexpired signed lifetime. Authentication/challenge failures are not bypassed.

The collector runs up to two fresh browser contexts at once with a bounded queue and token-separated cache. The main route has token-separated singleflight, five-minute cache, signed-expiry checks and 80 requests/IP/minute. A temporary collector wake-up/queue failure receives bounded retries. A failed file gets one automatic fresh collection attempt; a manual retry also bypasses media caches. Refresh reconstructs previews by ad ID, so expired files can be recollected. Old operator-collected data is only a six-hour fallback. These caches are ephemeral; they are not durable media hosting.

Cards lazy-load near the viewport. Videos start muted inline, loop and pause off-screen/background; playback still follows browser policy. Static creatives preserve their actual aspect ratio. Empty/loading previews have a clear status and a Meta link rather than presenting ad copy as the creative. Some snapshots have multiple versions; collected elements do not guarantee every variant has been enumerated.

The Creative Mix counts unique loaded ad IDs using Meta VIDEO/IMAGE filter matches and successfully observed media. Both kinds are Mixed; unresolved formats are Unclassified, never assumed static. The percentage denominator includes unclassified ads and is loaded ads, not spend, reach, or all advertiser ads. Filter-based classification scans at most two 100-record pages for each media type and is cached for five minutes; previews can classify additional ads as they load. Copy grouping does not affect this count.

## Brand discovery improvements

Editing the search field immediately removes stale advertiser results and automatically discovers advertisers after a 700 ms typing pause (minimum two characters). Superseded browser requests are aborted and ignored. Closest advertiser-name matches appear first; discovery retrieves up to 100 ads per page and supports further pagination. Searches support business domains, Facebook Page URLs and numeric Page IDs. Domain normalization handles subdomains and common multipart suffixes. Website queries remain hints, not verified domain-to-Page ownership.

Search coverage can be United Kingdom or UK + EU (all 27 EU countries). The selected coverage persists with the research session. Both discovery and Page ID searches request active ads within that scope. This is not worldwide commercial-ad coverage or a complete advertiser directory. UK reach remains explicitly UK reach even for EU searches; missing UK reach is unavailable. Broader search does not automatically collect media.

## Messaging map

The Messaging map tab maps the loaded, filtered ad text into hooks, benefits, offers, proof/reassurance and next steps. Deterministic text rules detect themes; this is not AI visual analysis, verified brand claims or measured performance. Each theme includes its exact text evidence, overlapping ad count, and distinct full-copy patterns. Evidence examples rank by available UK reach and open the existing ad/brief panel. Full-copy groups may share the same short evidence excerpt.

Users can edit a test direction per theme. Notes persist locally per advertiser and are included in the plain-text map export. The map view itself persists with the research session. Theme rules currently recognise English phrases; other languages and ads without usable text may have no detected themes. More pages or changed filters rebuild the map from the current loaded records.

## Earlier companion prototype

The initial unauthenticated public-library collector was blocked by Meta. The production route now uses authorised official ad snapshots, verified with an independent Render browser session. The older source-reviewed companion in `companion/` and its ZIP remain available as historical prototype files; the ad cards no longer require or prompt customers to install it. The new main media route does not invoke it.

## Creative Lab interface

The research UI uses warm paper surfaces, navy display typography, an orange primary action, and lavender/mint/pink/yellow messaging accents. An original inline SVG moodboard and eye mark provide the playful visual identity; the illustration is decorative, not an actual ad or a media preview. Branding remains AD Library Scraper. Responsive layouts were checked at desktop size and 390 px, including theme clicks and the ad detail panel. This visual update does not change API coverage or complete the unverified creative companion.

## Private Meta renewal

Graph API Explorer user tokens are temporary. Use Meta’s long-lived user-token exchange (typically around 60 days), not another unextended Explorer token. Expiry and revocation still require reauthorization; there is no permanent-token guarantee.

For the operator only, run `npm run meta:connect` in an interactive terminal. It asks for the app ID, app secret and fresh user token without echoing credentials. It checks the app/user token, exchanges it with Meta, verifies the returned token and expiry/data-access dates, and tests the actual Ad Library endpoint. It refuses expired/rejected tokens, app mismatches and replacements with less than seven days of access. It writes only the verified replacement plus expiry values into a new ignored `.env.meta-renewal-*` file with owner-only permissions. The app secret stays in memory and is never saved. Do not put secrets in command-line arguments. Optional private process variables are META_APP_ID, META_APP_SECRET and META_FRESH_TOKEN.

Import META_ACCESS_TOKEN, META_TOKEN_EXPIRES_AT (ISO UTC) and META_DATA_ACCESS_EXPIRES_AT (ISO UTC, empty if not supplied by Meta) together into the main Render service. Preserve unrelated variables. Wait for the deployment and verify `/api/health` shows `live-api-verified`, then test advertiser discovery. Remove the local renewal file after installation. Never commit it or send credentials to customers. Alternatively use Meta’s Access Token Debugger to extend the token and inspect the actual expiry values before installing all three privately in Render.

Renewal is intentionally restricted to the operator terminal and hosting dashboard; the public website cannot set or exchange tokens. The operator CLI is an alternative to the owner login flow below. Scheduled notifications remain future work. No app secret needs to be stored in the public web service for this operator workflow. [Meta’s long-lived token documentation](https://developers.facebook.com/documentation/facebook-login/guides/access-tokens/get-long-lived).

## Automatic token capture after owner login

`/connection` provides an owner-only Meta reconnect process. `POST /api/meta/start` requires the exact configured Origin, creates a random ten-minute login state, stores only its hash in Postgres and sets an HttpOnly SameSite=Lax protected cookie. Meta returns a code to `/api/meta/callback`; the callback validates and atomically consumes the state, exchanges the code server-side, checks the configured app and owner, extends the fresh token, verifies replacement expiry and Ad Library access, and stores it using AES-256-GCM. The raw token and app secret never reach browser responses, page props, localStorage or logs. Successful and failed callbacks redirect to a clean URL with a fixed outcome code. Failed verification preserves the previous token; an older login cannot overwrite a newer successful login.

Set these private variables on the main service: META_APP_ID, META_APP_SECRET, META_OWNER_USER_ID (the owner’s app-scoped user ID for this same app), META_SITE_URL (exact HTTPS origin with no trailing slash), META_DATABASE_URL (a dedicated database connection), META_TOKEN_ENCRYPTION_KEY (random 32 bytes as 64 hex characters). Register `https://ad-library-scraper-94t0.onrender.com/api/meta/callback` as a Valid OAuth Redirect URI in the Meta app’s Facebook Login settings. Owner app roles and Ad Library eligibility remain required. No new permissions beyond public_profile are requested by this flow.

The three small `adlibrary_meta_*` tables are created on the first configured connection. Tokens are read from the dedicated database; the old Render META_ACCESS_TOKEN is only a bootstrap fallback when no database record exists. A configured database failure fails closed instead of silently reverting to stale credentials. Updates propagate across server instances within 30 seconds; search caches are separated by token fingerprint. Never rotate or lose META_TOKEN_ENCRYPTION_KEY without a planned reconnection/migration; it protects saved tokens and transient login cookies.

The deployed UI is disabled until all private settings exist. This implementation does not mean live OAuth or database persistence has been activated or verified. A dedicated paid database requires cost approval; the current unrelated database is not reused.

For scheduled validity/expiry checks, configure a separate META_MAINTENANCE_SECRET (at least 32 random characters), then run `npm run meta:check` daily with only META_SITE_URL and that secret in a scheduler. The protected maintenance endpoint checks Ad Library and saves the latest state; the command exits unsuccessfully when the owner must reconnect, so scheduler failure notifications can surface the need for action. It never attempts an unsupported perpetual exchange of a long-lived token and never sends email itself. No scheduler or notification service is activated by adding this code. Automatic token fetching, extension and saving run after owner login; Meta can still require a human sign-in.

References: [Meta’s server-side login flow](https://developers.facebook.com/documentation/facebook-login/guides/advanced/manual-flow), [long-lived user tokens](https://developers.facebook.com/documentation/facebook-login/guides/access-tokens/get-long-lived).

Prepared Render activation: a dedicated Frankfurt Postgres `0.1c-256mb` instance with 1 GB (currently $6/month) and a daily Node cron check (currently $1/month minimum, usage may add charges). The cron needs no Meta token, app secret or database credential: it calls the protected maintenance endpoint using its separate secret. Proposed cron build is `npm ci --omit=dev`, command `npm run meta:check`, schedule daily at 08:00 UTC. The command allows two minutes for a free web service to wake up. Creation and private credential configuration are pending owner approval; neither paid resource has been provisioned.

## Recovering interrupted research

The research page shows a recovery panel for connection and search failures, rather than a bare error. Authentication failures lead to the owner connection desk; its label distinguishes activated login from incomplete setup. Temporary network/server failures get at most two automatic retries (1s, then 3s). Expiry, rejected credentials, permission failures, rate limiting and bad search input never enter that retry loop. Owners can reopen the last successfully displayed research and retain its original timestamp, or continue using their locally saved board. The last displayed research is retained separately in this tab’s sessionStorage so failed discovery does not replace it.

An interrupted authentication-dependent request is stored as validated query/Page/cursor/coverage metadata in sessionStorage, with no credentials. After a verified Meta connection, Resume interrupted research returns to the workspace and reissues that request once; the resume marker is consumed first to prevent a refresh loop. A `result=connected` URL alone does not prove success: the connection page checks current API validity before displaying success or offering resume. These recovery improvements do not activate the private OAuth settings, database or scheduled checks; live searches remain blocked until an authorised, verified token is installed.
