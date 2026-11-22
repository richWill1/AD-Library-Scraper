---
title: "Meta Conversions API Explained: What Advertisers Actually Need to Know"
seoTitle: "Meta Conversions API (CAPI) Explained for Advertisers"
description: "How the Meta Conversions API works with the pixel: server events, deduplication, event match quality, consent and the checks that catch setup mistakes."
category: measurement-profitability
status: published
publishedAt: 2026-11-22
author: AdSnoop Editorial
art: capi-flow
artAlt: "Illustration of a browser window and a server stack sending events that merge into one confirmed conversion"
keywords: [meta conversions api, facebook capi, server-side tracking, event deduplication, event match quality, meta pixel, capi setup]
related: [roas-vs-poas-meta-ads-profitability, how-often-to-refresh-meta-ad-creatives]
cta:
  heading: "Measurement sorted? Now look outward"
  text: "With reliable conversion data in place, see what your competitors are running on Facebook and Instagram, and what they keep investing in."
  label: "Search competitor ads"
  href: "/"
sources:
  - title: "Handling duplicate pixel and Conversions API events"
    url: "https://developers.facebook.com/docs/marketing-api/conversions-api/deduplicate-pixel-and-server-events"
    publisher: "Meta for Developers"
  - title: "Conversions API best practices"
    url: "https://developers.facebook.com/docs/marketing-api/conversions-api/best-practices"
    publisher: "Meta for Developers"
  - title: "Customer information parameters"
    url: "https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/customer-information-parameters"
    publisher: "Meta for Developers"
  - title: "Server event parameters"
    url: "https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/server-event"
    publisher: "Meta for Developers"
  - title: "Conversions API Gateway"
    url: "https://developers.facebook.com/docs/marketing-api/conversions-api/guides/gateway"
    publisher: "Meta for Developers"
  - title: "Guidance on the use of storage and access technologies"
    url: "https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guidance-on-the-use-of-storage-and-access-technologies/"
    publisher: "Information Commissioner's Office"
---

The Meta Conversions API (often shortened to CAPI) is one of those things everyone agrees you should have and few people can explain clearly. Agencies recommend it, Shopify apps promise it in one click, and Events Manager nudges you towards it. Yet many implementations double-count purchases, send poorly matched data, or quietly ignore the consent choices visitors made on the site.

This guide explains what the Conversions API actually does, how it works with the Meta pixel rather than replacing it, and the specific checks that catch most setup problems. It is written for marketers who need to brief, buy or audit an implementation, not just for developers.

:::takeaways
- The Conversions API sends events from your server to Meta. Meta recommends running it **alongside** the pixel, sending the same events through both.
- Duplicate events are removed when the browser and server versions share the same `event_name` and `event_id` and arrive within 48 hours of each other.
- Event match quality, scored out of 10 in Events Manager, reflects how well your events can be matched to Meta accounts. Better matching makes events usable for attribution and optimisation.
- Server-side tracking is not a way around consent. If a visitor declines marketing tracking, that choice should apply to both browser and server events.
:::

## Browser events, server events and why you need both

The **Meta pixel** is JavaScript that runs in the visitor's browser. When someone views a product or completes a purchase, the pixel sends that event to Meta directly from the browser.

The **Conversions API** sends events from your own server, or a server acting for you, straight to Meta's API.

| | Meta pixel (browser) | Conversions API (server) |
| --- | --- | --- |
| Where it runs | In the visitor's browser | On your server or a hosted gateway |
| Affected by ad blockers and browser restrictions | Yes | No, the request does not come from the browser |
| Lost if the page fails to load or the visitor leaves quickly | Often | No, if triggered by your back-end |
| Can send offline or delayed events | No | Yes, for example confirmed orders, phone sales or leads qualified later |
| Collects browser signals automatically | Yes: IP address, user agent, cookies | Only what you pass to it |
| Setup effort | Low | Low to high, depending on platform |

Meta's best-practice documentation recommends a **redundant setup**: the same important events, such as purchases, checkouts and leads, sent through both the pixel and the Conversions API. Each covers gaps in the other, and Meta removes the duplicates.

## Deduplication: the part most setups get wrong

If both the pixel and the server send a purchase and Meta counts both, your reported conversions and ROAS inflate. Deduplication prevents that, but only if you give Meta the information to do it.

:::figure capi-dedup
:::

Meta's recommended method uses two fields:

- **`event_name`** must match. A browser `Purchase` only deduplicates against a server `Purchase`.
- **`event_id`** must match. The pixel sends it as `eventID`; the Conversions API sends it as `event_id`. For purchases, an order or transaction number is a natural choice. For other events, generate a unique ID in the browser and pass the same value to your server.

According to Meta's documentation, when events with the same name and ID reach the same pixel within **48 hours**, the later duplicates are discarded. Meta also notes that when the browser and server versions arrive within about five minutes of each other, the browser event is favoured.

Meta does describe an alternative based on the `fbp` cookie value or `external_id`, but it is more limited: it generally only deduplicates when the browser event arrives first, and does not help where only one source sends an event. Use `event_id` wherever you can.

:::note How to check
In Events Manager, open the event in your dataset and look at the event overview and diagnostics. A healthy redundant setup shows events received from both the browser and the server, with deduplication applied. Purchases that roughly double after a CAPI launch are a strong sign it is not.
:::

## Event match quality: making events usable

Meta can only use an event for attribution and ad optimisation if it can match it to someone on its platforms. Meta's documentation describes **event match quality (EMQ)** as a score out of 10, shown per event in Events Manager, indicating how effectively the customer information you send can be matched. Matched events power attribution and optimisation; unmatched events are still useful for basic measurement.

Browser events carry some matching signals automatically. Server events carry only what you send. The main customer information parameters are:

| Parameter | What it is | Hash with SHA-256? |
| --- | --- | --- |
| `em` | Email address | Yes |
| `ph` | Phone number, including country code | Yes |
| `fn`, `ln` | First and last name | Yes |
| `ct`, `st`, `zp`, `country` | City, region, postcode, country | Yes |
| `db`, `ge` | Date of birth, gender | Yes |
| `external_id` | Your own customer or visitor ID | Recommended |
| `client_ip_address` | Visitor's IP address | **No, never hash** |
| `client_user_agent` | Visitor's browser user agent | **No, never hash** |
| `fbc` | Click ID value from the `_fbc` cookie or `fbclid` | **No, never hash** |
| `fbp` | Browser ID value from the `_fbp` cookie | **No, never hash** |

Values must be normalised before hashing. Meta's rules include lower-casing and trimming email addresses, writing phone numbers as digits with the country code, and writing UK postcodes in lower case without spaces. Getting this wrong means hashes do not match and the data is wasted.

For website events sent through the Conversions API, Meta's documentation treats `client_user_agent` and `event_source_url` as required, and recommends sending `client_ip_address`. Meta also recommends including `external_id` and `event_id` on all events.

## Consent: server-side is not a loophole

In the UK, the Privacy and Electronic Communications Regulations (PECR) and UK GDPR govern this area. The ICO's guidance on storage and access technologies covers cookies and similar technologies, including tracking pixels, and generally expects consent for those used for advertising.

The Conversions API changes *where* an event is sent from. It does not change whether you are allowed to send it. Our reading, which is not legal advice, is that:

- **The visitor's choice should apply to both paths.** If someone declines marketing cookies, suppress both the pixel and the server event for that visitor.
- **Server events still involve personal data.** Hashed emails and phone numbers are still personal data under UK GDPR. You need a lawful basis, a clear privacy notice and a data processing position on sharing them with Meta.
- **Offline and CRM events need the same care.** Sending later-stage events, such as qualified leads or in-store sales, requires the same assessment.

Meta's API supports a `data_processing_options` field for Limited Data Use, which relates to certain US state privacy laws. It is not a UK or EU consent mechanism.

:::verify
UK privacy rules on cookies and similar technologies were updated by the Data (Use and Access) Act 2025, and the ICO has been revising its guidance. Check the [current ICO guidance](https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guidance-on-the-use-of-storage-and-access-technologies/) and take legal advice for your own setup.
:::

## Ways to implement the Conversions API

| Route | Good for | Watch out for |
| --- | --- | --- |
| **Platform integration** (for example Shopify, WooCommerce, BigCommerce apps) | Standard ecommerce stores wanting a quick, maintained setup | Check what events and parameters are sent, how consent is handled and that deduplication is enabled |
| **Conversions API Gateway** | Advertisers who want a Meta-supported, low-code server setup | It runs on cloud hosting you pay for; check costs and who maintains it |
| **Server-side tag management** (for example a server-side Google Tag Manager container) | Teams already running server-side tagging for several platforms | Hosting costs and technical maintenance; consent and deduplication must be configured deliberately |
| **Direct API integration** | Custom stacks, offline events, lead and CRM data | Development time; you own normalisation, hashing, retries and monitoring |

For most small and mid-sized ecommerce brands, a well-configured platform integration is the sensible default. Custom work is justified when you need offline events, unusual funnels or more control over consent and data.

## A practical implementation checklist

Use this to brief a developer or audit an existing setup.

1. **Decide which events matter.** Usually `Purchase` plus key funnel events such as `InitiateCheckout`, `AddToCart` and `Lead`. Send these through both pixel and server.
2. **Send a shared `event_id`** for every redundant event, and use identical `event_name` values on both sides.
3. **Set `action_source` correctly.** Use `website` for website events and the relevant value, such as `physical_store` or `phone_call`, for others.
4. **Include required website fields:** `event_source_url` and `client_user_agent`, plus `client_ip_address`.
5. **Pass `fbp` and `fbc`** from the visitor's cookies without hashing, and refresh them rather than storing them indefinitely.
6. **Normalise and hash customer data** exactly as Meta specifies.
7. **Send events promptly.** Real time is best. Meta rejects events with an `event_time` more than seven days old; if any event in a batch is too old, the whole request fails.
8. **Keep `value` and `currency` consistent** between pixel and server, and decide what value represents (see [ROAS vs POAS](/insights/roas-vs-poas-meta-ads-profitability)).
9. **Respect consent** on both paths.
10. **Test before launch** with the Test Events tool in Events Manager, then monitor diagnostics and EMQ weekly for the first month.

## Common problems and what they look like

| Symptom | Likely cause |
| --- | --- |
| Purchases roughly double after launch | Deduplication failing: missing or mismatched `event_id`, or different `event_name` values |
| Server events received but low match quality | Too few customer parameters, or hashing and normalisation errors |
| Events rejected or missing | `event_time` older than seven days in a batch, or missing required fields |
| Purchase values differ between sources | Pixel and server using different value definitions, such as including VAT on one side |
| Server events for visitors who declined cookies | Consent state not passed to the server |
| Conversions spike, then disappear | Integration token expired or app disconnected |

:::impact
### Who this affects

Any advertiser optimising Meta campaigns for website conversions, especially those relying on the pixel alone, using a platform integration they have never audited, or seeing reported conversions that do not match their own orders.

### What changes

A correct redundant setup gives Meta more complete and better-matched conversion data, which supports attribution and delivery optimisation. A careless one inflates results, wastes matching data or creates privacy risk.

### Recommended action

Audit what you have before adding anything: check deduplication, EMQ, event coverage and consent handling in Events Manager. Fix those, then decide whether offline or CRM events would add value.

### When no action is needed

If Events Manager shows browser and server events with deduplication working, match quality has been stable, consent is respected on both paths and reported conversions reconcile sensibly with your orders, your setup is doing its job. Review it after any site, checkout or consent platform change.
:::
