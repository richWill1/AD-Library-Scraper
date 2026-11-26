---
title: "Meta Advantage+ Explained: What to Automate and What to Keep Control Of"
seoTitle: "Meta Advantage+ Campaigns Explained (2026)"
description: "Advantage+ is now a setting, not a campaign type. What Meta automates, what you still control, the 2026 placement changes and when to keep a manual hand."
category: strategy-optimisation
status: draft
publishedAt: 2026-11-26
author: AdSnoop Editorial
art: control-dials
artAlt: "Illustration of three glowing switches for budget, audience and placements, all switched on, beside a set of slider controls"
keywords: [meta advantage+, advantage+ sales campaigns, advantage+ audience, advantage+ placements, advantage+ shopping campaigns, meta ads automation, audience controls, value rules]
related: [meta-conversions-api-explained, meta-ads-video-vs-static-vs-carousel]
cta:
  heading: "When targeting is automated, creative does the work"
  text: "Search an advertiser to see the concepts, formats and offers their active Meta ads are built on, and which ones they have kept running longest."
  label: "Search competitor ads"
  href: "/"
sources:
  - title: "Advantage+ campaign experience for Sales, App and Leads"
    url: "https://developers.facebook.com/docs/marketing-api/advantage-campaigns"
    publisher: "Meta for Developers"
    note: "Defines the three settings that give a campaign Advantage+ status, and the API deprecation timeline."
  - title: "Advantage+ campaign experience for sales and app"
    url: "https://developers.facebook.com/blog/post/2025/06/03/advantage-plus-campaign-experience-for-sales-and-app/"
    publisher: "Meta for Developers blog, June 2025"
  - title: "Advantage+ audience (Marketing API)"
    url: "https://developers.facebook.com/docs/marketing-api/audiences/reference/targeting-expansion/advantage-audience/"
    publisher: "Meta for Developers"
  - title: "Meta Clarifies Upcoming Placement Control Changes"
    url: "https://www.jonloomer.com/meta-placement-control-changes/"
    publisher: "Jon Loomer"
    note: "Practitioner analysis of the 2026 placement changes and the remaining controls."
  - title: "Advantage+ Campaign Setup is Here"
    url: "https://www.jonloomer.com/qvt/advantage-plus-campaign-setup-is-here/"
    publisher: "Jon Loomer"
    note: "Practitioner walkthrough, including opportunity score behaviour."
  - title: "About the learning phase"
    url: "https://www.facebook.com/business/help/112167992830700"
    publisher: "Meta Business Help Centre"
---

If you learned Meta advertising a couple of years ago, you probably think of Advantage+ as a campaign type: the "Advantage+ shopping campaign" you chose instead of a manual one. That choice no longer exists. Since 2025, Meta has merged its manual and Advantage+ set-up flows into one, and **Advantage+ is now a status a campaign earns from its settings**, not a box you tick at the start.

That change matters because most of the useful decisions have moved. The question is no longer "manual or Advantage+?" It is which of a handful of levers you hand to Meta, which ones you keep, and which ones Meta has quietly taken away. This guide covers all three, with a focus on what a UK advertiser running Sales or Leads campaigns actually sees in Ads Manager today.

:::takeaways
- A Sales, Leads or App campaign counts as Advantage+ when three settings are on: Advantage+ campaign budget, Advantage+ audience and Advantage+ placements. Turn one off and the campaign loses its Advantage+ status.
- With Advantage+ audience, a few inputs are hard limits that Meta respects: location, minimum age, language and excluded custom audiences. Age range, gender, interests and included audiences are only suggestions.
- In 2026 Meta began removing ad-set placement choices for Sales, Leads, App promotion and Engagement campaigns. Account-level exclusions, placement value rules and per-placement creative are what remain.
- Automation works best with reliable conversion data, enough volume and a steady supply of distinct creative. Without those, keeping a manual hand on the levers that are still available is reasonable.
:::

## What "Advantage+" means now

Meta's [developer documentation](https://developers.facebook.com/docs/marketing-api/advantage-campaigns) describes a single campaign set-up for the Sales, App promotion and Leads objectives. Whether the campaign is treated as Advantage+ depends on three levers:

| Lever | What Meta automates | What breaks Advantage+ status |
| --- | --- | --- |
| **Advantage+ campaign budget** | Moves one campaign budget between ad sets towards the best results | Setting budgets at ad set level instead |
| **Advantage+ audience** | Finds people to reach, using your inputs as a starting point | Turning it off and setting strict targeting in every ad set |
| **Advantage+ placements** | Spreads delivery across Facebook, Instagram, Messenger, Threads and Audience Network | Excluding placements or devices at ad set level |

<span class="ins-label">Verified</span> Meta's documentation states that all three must be enabled for a campaign to carry Advantage+ status, and that placement exclusions set at ad account level do not break it.

The "Advantage+" name also appears on features that automate only one part of an ad, such as Advantage+ creative enhancements and Advantage+ catalogue ads. Those are settings within a campaign, not a campaign type, which is a common source of confusion when people compare notes.

### How we got here

- **Early 2025:** Meta began testing a streamlined set-up that removed the choice between a manual campaign and an Advantage+ shopping campaign.
- **29 May 2025:** Meta [extended the new set-up](https://developers.facebook.com/blog/post/2025/06/03/advantage-plus-campaign-experience-for-sales-and-app/) to more advertisers for sales and app campaigns. Advantage+ shopping campaigns are now described as Advantage+ sales campaigns.
- **Marketing API v24 to v26:** the old way of creating Advantage+ shopping campaigns through the API is being switched off in stages, and legacy campaigns have to be migrated to the new structure.
- **August to October 2026:** Meta began removing manual placement choices from ad sets for most conversion-focused objectives (covered below).

## What you still control

The most useful thing to understand about Advantage+ audience is the difference between **controls** and **suggestions**. Meta's [Advantage+ audience documentation](https://developers.facebook.com/docs/marketing-api/audiences/reference/targeting-expansion/advantage-audience/) says the "non-negotiable business constraints" are not expanded. Everything else can be.

| Type | Examples | How Meta treats it |
| --- | --- | --- |
| **Audience controls** | Locations, minimum age, languages, excluded custom audiences | Hard limits. Ads will not be shown outside them |
| **Audience suggestions** | Age range, gender, included custom audiences, lookalikes, interests | A starting point. Meta can and will go beyond them |
| **Account-level controls** | Account-wide location limits, minimum age, placement exclusions, excluded employees | Hard limits applied across every campaign in the ad account |

In practice this means:

- **Use controls for real business constraints.** If you only deliver to Great Britain, set the location. If you sell alcohol, set the minimum age. These are respected.
- **Don't expect suggestions to fence anything in.** An age range of 35 to 55 or an interest in "home improvement" is a hint about where to start. If you need people outside a group never to see the ad, it has to be an exclusion or a control.
- **Exclusions are your main precision tool.** Excluding existing customers, recent purchasers or employees is respected even with Advantage+ on.

:::note Minimum age
The minimum-age control in Advantage+ audience accepts a value up to 25. If your product legally requires a higher age, or you must exclude people outside an age band entirely, check what your campaign set-up allows before relying on it, and consider whether Advantage+ audience is appropriate for that campaign.
:::

### What's gone: the existing-customer budget cap

Advantage+ shopping campaigns used to let you cap the share of budget spent on existing customers. That setting has been removed in the new set-up. Meta's documentation suggests a workaround: build a custom audience of existing customers, then run two ad sets in the same campaign, one including that audience with a spend limit and one excluding it, using the same creative in both.

<span class="ins-label-interp">Interpretation</span> If you mainly care about acquiring new customers, the simpler route is often to exclude existing customers from your prospecting campaign and run a separate, smaller campaign aimed at them. You lose some of Meta's flexibility, but you gain a clean read on what each group costs.

## The 2026 placement changes

The biggest change of the year is to placements. For campaigns using the Sales, Leads, App promotion and Engagement objectives, Meta has been removing the option to choose or exclude placements at ad set level. Awareness and Traffic campaigns keep manual placements for now. Jon Loomer's [analysis of the change](https://www.jonloomer.com/meta-placement-control-changes/) notes that Meta's own documentation widened the list beyond Sales and Leads.

Meta points advertisers to three replacements:

1. **Account-level placement exclusions by objective.** Found in the ad account's controls, these block placements for every campaign with a given objective. They are a blunt tool, but they are a true exclusion.
2. **Placement value rules.** These let you raise or lower your bid for a placement, device platform or operating system. They steer spend rather than stop it, and only a limited set of placements is available.
3. **Creative customised for each placement.** Supplying vertical video for Stories and Reels and square or 4:5 assets for feeds makes the ads that do appear in those places work better.

:::verify
Meta is rolling the placement change out gradually, so two ad accounts can show different options on the same day. Check what your own Ads Manager offers, and Meta's Business Help Centre page on placement settings, before you restructure campaigns around it.
:::

<span class="ins-label-interp">Interpretation</span> If you used to exclude Audience Network because it produced cheap, low-quality clicks or leads, the account-level exclusion is the closest replacement. If you just preferred feeds over Reels, a value rule is a gentler way to express that, and worth testing before you exclude anything.

:::cta heading="See where competitors build for" label="Search an advertiser" href="/" placement="inline_placements"
AdSnoop shows whether a competitor's active Meta ads are video or static, so you can see who is producing vertical video for Reels and Stories and who is relying on feed images.
:::

## When to lean into Advantage+

Meta's automation is only as good as what it learns from. It tends to suit you when most of these are true:

| Condition | Why it matters |
| --- | --- |
| **Reliable conversion tracking** | Meta optimises towards the events you send. Gaps or duplicates mislead it. See our guide to the [Conversions API](/insights/meta-conversions-api-explained) |
| **Enough conversion volume** | Meta's learning phase typically needs around 50 optimisation events per ad set in a week. One well-funded campaign learns faster than five thin ones |
| **A broad or national market** | A UK-wide ecommerce brand gives Meta plenty of room. A single-postcode service business does not |
| **A steady flow of distinct creative** | With targeting automated, creative is the main way you tell Meta who the ad is for |
| **An optimisation event that reflects value** | Purchases or qualified leads, not cheap proxies like landing page views |

## When to keep more control

Automation is the default, but it is not always the right answer. Keeping some settings manual is reasonable when:

- **You have little data.** A new pixel or ad account gives Meta nothing to learn from. Audience suggestions, such as a customer list or a lookalike, can give it a starting point.
- **Lead quality is the problem.** Advantage+ will find people who fill in forms cheaply. If your sales team says the leads are poor, fix the optimisation event first, for example by sending qualified leads back through the Conversions API, rather than only tightening targeting.
- **You have legal or operational limits.** Age-restricted products, regulated sectors and businesses that only serve certain areas should set those as controls or account-level settings, and check them after every change.
- **You need a clean test.** Comparing two audiences or two offers is hard when Meta is free to blur them together. A short, deliberately structured test can be worth losing Advantage+ status for.
- **New and existing customers need separating.** With the budget cap gone, exclusions and separate campaigns are how you keep acquisition and retention spend apart.

:::example A simple structure for a UK ecommerce brand
A hypothetical homeware brand spending a few thousand pounds a month might run:

- **One Advantage+ Sales campaign for prospecting**, with UK location as a control, existing customers excluded and several distinct creative concepts in rotation.
- **One smaller campaign for existing customers**, aimed at a customer list, focused on new ranges and repeat purchase.
- **Account-level exclusions** only for placements they have evidence against.

The structure and spend level are illustrative. The point is to consolidate where Meta needs data and separate only where you need a clear answer.
:::

## Opportunity score is a guide, not a goal

Ads Manager gives campaigns an **opportunity score**, and Meta's recommendations to raise it usually involve switching more automation on. Practitioners such as Jon Loomer have [noted](https://www.jonloomer.com/qvt/advantage-plus-campaign-setup-is-here/) that a campaign starts with a high score when every Advantage+ setting is applied, and that most customisations lower it.

<span class="ins-label-interp">Interpretation</span> Treat the score as a list of things to consider, not a measure of how well your campaign is performing. A lower score caused by a deliberate exclusion that protects your margin is a fine trade. Judge each recommendation on your own results, ideally by testing it against what you have now.

## Creative is the new targeting

When Meta chooses the audience, budget split and placements, the main thing you still fully control is the ad itself. Different concepts, formats and messages reach different people. An ad built around a price comparison finds bargain hunters, while a founder story finds people who care about the brand.

That is why creative volume and variety have become the real levers in an Advantage+ account. It is also why it pays to know what your competitors are running. Our guides to [video, static and carousel formats](/insights/meta-ads-video-vs-static-vs-carousel) and [how often to refresh creative](/insights/how-often-to-refresh-meta-ad-creatives) cover the practical side.

:::impact
### Who this affects

Anyone running Meta campaigns with the Sales, Leads, App promotion or Engagement objectives, and especially advertisers who built their accounts on manual targeting, placement exclusions or the old Advantage+ shopping campaign.

### What changes

Advantage+ status now comes from three settings rather than a campaign choice. Several manual controls have been removed or turned into suggestions, and ad-set placement choices are being phased out for most conversion objectives.

### Recommended action

Audit each active campaign: which of the three Advantage+ levers is on, which audience inputs are controls and which are only suggestions, and which placement exclusions you relied on. Move true business limits to controls or account-level settings, and put your effort into conversion tracking and creative.

### When no action is needed

If your campaigns already use broad targeting with sensible controls, your conversion tracking is sound and results are stable, there is no need to restructure. Check your account-level placement settings once, then leave Meta to optimise.
:::
