# AD Library Scraper reliability review

Reviewed 9 October 2026. This is a working prototype, not a production reliability certification.

## Recommendation

Keep Meta's official Ad Library API as the primary data source for UK competitor research. Keep our own creative collector separate from search. Add durable permitted media storage, a shared job queue and owner reconnection before inviting paying customers. Do not replace the platform with another ad-research SaaS.

## Verified connections and observations

- GitHub main and Render auto-deployment are connected and working.
- Live Meta health check: connected. Current token expires 7 December 2026 at 17:32 UTC. This is an expiry observation, not a guarantee against early revocation.
- Owner OAuth recovery endpoint reports `ready: false`. The implemented recovery flow has not been activated; it needs private app configuration, encrypted durable token storage and the correct callback configuration.
- Both website and collector are on free Render web-service compute, one instance each, in Frankfurt. Neither has an explicit HTTP health-check path configured.
- Collector memory limit: 512 MiB. Sparse idle observations around 66–73 MB do not demonstrate capacity under browser load or prove out-of-memory failures.
- Fresh public media requests returned a Sharps image in 19 seconds and a Neville Johnson video in 16 seconds. Both returned COLLECTED. This two-ad sample does not establish broad brand coverage.
- Earlier collector logs contain BUSY and META_PREVIEW_UNAVAILABLE. No failures appeared in the queried post-18:08 UTC log window, which is not an availability guarantee.
- Sharps pagination returned 50 records followed by 12 additional unique records. Live interface confirmed 62 loaded ads. The next-page control is now available beside the brand name.
- Current search caches and creative URL caches are process-local and lost on restart. Media files are not stored in an owned object-storage bucket. Signed Meta CDN URLs still expire.
- Research boards and notes remain in browser storage; there is no multi-customer account/billing backend or durable cross-device research database.

## Changes made during this review

- Search returns ad metadata immediately; video/image classification runs through a separate validated endpoint.
- Identical concurrent searches share one upstream request and reuse cached results.
- Concurrent format requests for a brand share one classification job.
- Meta throttling codes and HTTP 429 pause further Graph requests for the credential within the current process. Full X-App-Usage windows are also respected when Meta supplies that header. Throttling no longer triggers the normal temporary-error retry loop.
- Format results only fill unknown formats, preserving classifications observed from actual creatives.
- Existing format scan remains bounded to two 100-record pages per media type. Unmatched formats are explicitly unclassified; this is not a cap on the ads that can be loaded.

## Options considered

| Option | Assessment |
| --- | --- |
| Official Meta Ad Library API | Primary source. Supports ads delivered to UK/EU in the past year and documented snapshot previews. Page-ID selection is more precise than keyword matching. |
| Marketing API / additional ads permissions | Useful for authorised customers' own ad accounts. Not a replacement that grants access to arbitrary competitors' private creatives or performance. |
| Our Render collector on paid compute | Least migration work. Removes free-tier sleeping and permits appropriate browser resources. Needs measured load testing; a larger instance alone does not solve missing previews. |
| Cloudflare Browser Run | A possible managed browser runtime, owned infrastructure rather than an ad-research SaaS. Not connected or tested against our Meta snapshot flow. Evaluate as a separate controlled prototype before any migration; pricing does not establish compatibility. |
| R2 object storage | Recommended for permitted creative assets, served independently of the web/collector processes. Add deduplication, expiry/retention, ownership of keys and delivery controls. |
| Render disk for creative storage | Poor long-term choice for a multi-instance SaaS: disks attach to one instance and prevent horizontal scaling and zero-downtime deploys. |
| Third-party ad intelligence supplier | Not selected. Adds vendor dependency and conflicts with the user's requested ownership model. |

Superscale's public research page advertises a Meta Ad Library connection, but does not disclose enough to establish its media collection or storage architecture.

## Production gates, in order

1. Explicit approval for always-on paid compute and storage; configure health probes without treating a Meta outage as a reason to restart a healthy app.
2. Activate the owner OAuth callback and encrypted durable token store. Verify reconnect with the correct owner and app; never promise perpetual renewal or recovery without possible owner interaction.
3. Durable media cache and asset metadata keyed by ad and underlying creative; serve videos with Range support and thumbnails. Apply Meta's applicable storage terms.
4. Shared queue and rate budgeting, bounded retries with jitter, job deduplication, and customer-level usage limits. Process-local protections alone are insufficient for horizontal scaling.
5. Persistent advertiser identity index from observed verified Page IDs. Do not claim a website-derived search term proves ownership or that keyword discovery finds every UK advertiser.
6. Test 20–30 varied UK brands; record eligible-ad count, creative retrieval success, playback success, first and repeat-load latency, pagination and refresh retention. Separate unavailable source media from infrastructure failures.
7. Run concurrent-user and token/media-expiry recovery tests. Agree service targets based on the measurements, not selected successful examples.
8. Add customer accounts, durable research boards, billing and usage controls before commercial launch.

No paid resources or recurring monitoring were created during this review. No unrelated services or synced source files were changed.

## Official references

- Meta Ad Library scope, filters and snapshot fields: https://br-fr.facebook.com/ads/library/api/?source=onboarding
- Meta-maintained Marketing API collection: https://www.postman.com/meta/facebook-marketing-api/documentation/0zr4mes/facebook-marketing-api-mapi
- Render free service limitations: https://render.com/docs/free
- Render disk constraints: https://render.com/docs/disks
- Render uptime guidance: https://render.com/docs/uptime-best-practices
- Cloudflare R2 pricing: https://developers.cloudflare.com/r2/pricing/
- Cloudflare Browser Run pricing: https://developers.cloudflare.com/browser-run/pricing/
- Superscale's own public description: https://superscale.ai/ad-research
