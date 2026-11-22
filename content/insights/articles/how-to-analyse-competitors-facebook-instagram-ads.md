---
title: "How to Analyse Your Competitors' Facebook and Instagram Ads"
seoTitle: "How to Analyse Competitors' Facebook & Instagram Ads"
description: "A practical method for researching competitor Meta ads: what the Ad Library shows and hides, how to read formats and messaging, and turn it into tests."
category: competitor-intelligence
status: published
publishedAt: 2026-11-22
author: AdSnoop Editorial
art: competitor-lens
artAlt: "Illustration of a wall of ad cards with the AdSnoop eyes scanning across them, three cards highlighted"
keywords: [facebook ads competitor analysis, meta ad library, competitor ads, instagram ads research, ad library alternative, creative research]
related: [meta-ads-video-vs-static-vs-carousel, how-often-to-refresh-meta-ad-creatives]
cta:
  heading: "Start with one competitor"
  text: "Search an advertiser to see their active Meta ads, how long each has been running, their creative mix and the messages they repeat."
  label: "Explore competitor ads"
  href: "/"
sources:
  - title: "Ad Library API (ads_archive) reference"
    url: "https://developers.facebook.com/docs/graph-api/reference/ads_archive/"
    publisher: "Meta for Developers"
  - title: "Archived Ad fields: what is available for EU and UK ads"
    url: "https://developers.facebook.com/docs/marketing-api/reference/archived-ad/"
    publisher: "Meta for Developers"
  - title: "Meta Ad Library"
    url: "https://www.facebook.com/ads/library/"
    publisher: "Meta"
---

Every advertiser on Facebook and Instagram publishes its active ads to the Meta Ad Library. That makes Meta one of the most transparent ad platforms to research: you can see the creative, the copy, the start date and, for ads shown in the UK and EU, an estimate of how many people they reached.

What you cannot see is just as important. There is no spend for ordinary commercial ads, no click-through rate, no conversion data and no view of the audience settings behind the delivery. Competitor research done well works within those limits. Done badly, it ends in copying ads that may not have been working in the first place.

This guide sets out a repeatable method, from choosing who to study to turning observations into tests you can run.

:::takeaways
- The Ad Library shows what a competitor is *willing to keep paying for*, not what is performing. Treat every observation as a hypothesis.
- Ads delivered in the UK and EU carry extra transparency data, including reach estimates and the age, gender and location breakdown of who saw them.
- The most useful signals come from patterns over time: launch cadence, which concepts get iterated, and which messages keep returning.
- Record what you see with dates. A single look tells you very little; a monthly snapshot tells you a lot.
:::

## What the Meta Ad Library shows, and what it doesn't

The public [Ad Library](https://www.facebook.com/ads/library/) and its API expose different levels of detail depending on the type of ad and where it was delivered.

| Available | Details |
| --- | --- |
| Creative and copy | Images, videos, carousel cards, primary text, headlines and link descriptions |
| Start date and status | When the ad began delivering, and whether it is active |
| Platforms | Which Meta technologies it ran on, such as Facebook, Instagram, Messenger or Audience Network |
| Multiple versions | Whether the ad has several creative or text variations |
| **UK and EU delivery only:** reach | An estimate of how many accounts the ad reached in those locations |
| **UK and EU delivery only:** audience breakdown | Reach split by age, gender and location, plus the targeting age range, gender and locations |

| Not available for commercial ads | Why it matters |
| --- | --- |
| Spend and impressions | These are published for political and social issue ads, not ordinary commercial ones |
| Clicks, conversions, CPA, ROAS | You cannot see performance, only exposure |
| Detailed targeting and custom audiences | Interests, lookalikes and retargeting lists are not shown |
| Campaign structure and bidding | You see ads, not how they are organised or optimised |

:::verify
Meta's documentation for the Ad Library API states that reach and demographic breakdown fields are limited to ads delivered to the EU and UK, and that spend and impressions ranges apply to political and issue ads. Coverage and field availability can change; check the current [Archived Ad reference](https://developers.facebook.com/docs/marketing-api/reference/archived-ad/) if you rely on a specific field.
:::

## Step 1: Choose who to study

Most teams pick their three most obvious rivals and stop there. A broader set produces better ideas:

- **Direct competitors:** same product, same customer. Useful for offers, pricing language and objection handling.
- **Aspirational competitors:** larger brands in your category. Useful for creative production standards and how they structure a launch.
- **Adjacent advertisers:** different product, same audience. A mattress brand can learn a great deal from how a premium bedding brand sells comfort and trust.
- **Category newcomers:** fast-growing challengers often test more aggressively, so they show you what is being tried right now.

Five to eight advertisers is a manageable set for a monthly review.

## Step 2: Make sure you are looking at the right advertiser

Searching by brand name in the Ad Library returns ads from every Page that mentions it, including resellers, affiliates and marketplaces. Before drawing conclusions:

- Confirm the Facebook Page actually belongs to the brand. Check the Page name and the destination domain in the ads.
- Look for **multiple Pages**. Some brands run separate Pages for regions, sub-brands or product lines.
- Note the **countries** you are viewing. A brand's UK activity can look very different from its US activity.

## Step 3: Capture a dated snapshot

The Ad Library shows what is live *now*. If you want to understand strategy, you need to see how that changes, which means recording it.

For each advertiser, capture at least: number of active ads, the start date of each, format, primary message, offer, and destination. A spreadsheet works; so does a research tool that keeps a history for you. What matters is that the next snapshot can be compared with this one.

## Step 4: Classify every ad the same way

Consistent tagging is what turns a scroll through a library into analysis. A simple scheme:

| Dimension | Example tags |
| --- | --- |
| Format | Video, static image, carousel, catalogue or collection |
| Hook or angle | Problem-first, product demo, social proof, founder story, comparison, seasonal |
| Offer | None, percentage discount, free delivery, bundle, free trial, gift |
| Proof | Reviews or ratings, press mentions, guarantees, numbers, user-generated content |
| Funnel role (your estimate) | Introducing the brand, explaining the product, prompting a purchase |
| Landing destination | Homepage, collection, product page, quiz, lead form |

Funnel role is always a judgement. Label it as your estimate rather than a fact about the advertiser's campaign setup.

## Step 5: Read the signals, not the single ads

Individual ads tell you very little. Patterns across ads and over time are where the insight is.

| Question | Signal to look for | Caveat |
| --- | --- | --- |
| What are they testing? | Several ads launched on the same day sharing a concept but varying the hook, visual or headline | Variation may come from Meta's automated creative options rather than deliberate tests |
| What might be working? | Ads that stay active for weeks or months while others come and go | Long-running ads may have low spend, or be evergreen ads nobody has reviewed |
| What are they investing in? | Concepts that keep reappearing in new versions | Iteration suggests confidence, not proof of results |
| How fast do they refresh? | The rate of new ads launched each week or month | Ad counts are not spend; one ad can carry most of the budget |
| Who are they reaching? | UK or EU reach estimates, and age or gender breakdowns | Reach reflects delivery, not necessarily the intended target |
| What's seasonal? | Messaging that changes around peaks such as Black Friday or Christmas | Compare with the same period last year where possible |

### Ad longevity: useful, but easy to over-read

The idea that "the longest-running ads are the winners" is popular and partly true. Advertisers rarely leave clearly unprofitable ads running for months. But longevity also reflects neglect, small budgets, brand or awareness ads with different goals, and ads kept on for compliance or retargeting.

:::example Reading longevity in context
A home-furnishings competitor has 40 active ads. Three have been running for over 120 days; the rest are under 30 days old.

A reasonable reading: the three long-runners are probably proven performers or core evergreen ads, and the rest are the current test pipeline. A better reading also checks whether new versions of the long-runners' concept keep appearing. If they do, the concept is being actively invested in. If not, the long-runners may simply have been left alone.
:::

## Step 6: Analyse messaging, not just visuals

Creative gets most of the attention, but copy often reveals more strategy. For each advertiser, pull the primary text from their active ads and look for:

- **Repeated benefits:** what they say about the product most often, and in what order.
- **Objections handled:** delivery times, returns, sizing, price justification, setup effort.
- **Proof devices:** star ratings, review counts, press logos, guarantees, specific numbers.
- **Offers:** how often they discount, and whether discounts are evergreen or event-led.
- **Language:** the words customers would use versus internal jargon.

Comparing this across competitors shows where the category's messaging is crowded and where there is room to say something different.

## Step 7: Turn observations into tests

The output of competitor research should be a short list of hypotheses for your own account, not a mood board.

:::example From observation to hypothesis
**Observation:** Two of five competitors launched UGC-style videos opening with a customer complaint about a common problem, and both have kept iterating that format for six weeks.

**Hypothesis:** A problem-first UGC video will outperform our current product-demo video for cold audiences.

**Test:** Produce two problem-first videos using our own customers and claims we can substantiate. Run them against the current best performer, holding the offer and landing page constant.
:::

Never copy competitor creative or claims. Apart from the legal and brand risks, an ad that works for an established brand with a known reputation may not work for yours, and their ad may not be working at all.

## How often to repeat the analysis

| Situation | Suggested review |
| --- | --- |
| Stable category, steady spend | Monthly snapshot, quarterly deeper review |
| Competitive launch or new entrant | Weekly for the first month |
| Approaching a seasonal peak | Weekly from around six weeks before |
| Planning a creative refresh | A focused review before the briefing |

These are working suggestions rather than rules. The right cadence depends on how quickly your competitors change their ads, which is itself something your snapshots will reveal.

:::cta heading="Do this research in minutes, not hours" label="Search an advertiser" href="/" placement="inline_method"
AdSnoop searches Meta's Ad Library for you, then sorts ads by UK reach, longest running or newest, and maps the messaging themes across them.
:::

## Benchmarking: comparing competitors fairly

When you compare several advertisers, normalise what you can:

- **Use the same countries and date range** for every advertiser.
- **Compare shares, not counts.** "60% of active ads are video" is more comparable than "24 video ads", because ad volumes vary enormously.
- **Separate brand-new ads from long-runners** so you can see both the test pipeline and the proven core.
- **Note what you could not classify.** Some ads will not have a clear format or theme. Excluding them silently skews the comparison.

:::impact
### Who this affects

Any brand or agency planning Meta creative, particularly in competitive categories where messaging and offers move quickly.

### What it changes

Competitor analysis replaces guesswork about what the market is doing with evidence of what competitors are publicly running, how long they keep it live and how quickly they refresh. It does not replace your own testing, because the Ad Library cannot tell you what is performing.

### Recommended action

Set up a monthly snapshot of five to eight advertisers, classify ads with a consistent scheme and finish every review with two or three testable hypotheses for your own account.

### When no action is needed

If you are in a niche with few active advertisers, or your growth is limited by stock, operations or budget rather than creative, a quarterly look is likely enough.
:::

## Using AdSnoop for competitor research

AdSnoop is built on the same public Meta Ad Library data, organised for this workflow:

- **Advertiser search** finds the right Facebook Page by brand name, website or Page ID before loading ads, so you are not mixing resellers into your analysis.
- **Sorting** by UK reach (where Meta provides it), longest running and newest helps separate the proven core from the current tests.
- **The creative mix** shows the share of loaded ads that are video, static or both, with unclassified ads counted rather than hidden.
- **The messaging map** groups hooks, benefits, offers, proof and calls to action across loaded ads, with the exact text that supports each theme.
- **My competitors** keeps a set of advertisers to return to, so the monthly review starts from where you left off.

The same caveats apply: reach is an estimate available for UK and EU delivery, counts are not spend, and the messaging map detects themes in text using rules rather than measuring performance.
