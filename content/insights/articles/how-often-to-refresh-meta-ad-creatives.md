---
title: "How Often Should You Refresh Meta Ad Creatives?"
seoTitle: "How Often to Refresh Meta Ad Creatives"
description: "There's no universal refresh schedule. How to spot creative fatigue on Meta, rule out other causes and set a refresh rhythm that fits your spend."
category: strategy-optimisation
status: published
publishedAt: 2026-11-22
author: AdSnoop Editorial
art: fatigue-curve
artAlt: "Illustration of a performance line that declines over time and is lifted by each creative refresh"
keywords: [creative fatigue, facebook ad fatigue, meta ads frequency, creative refresh, creative testing cadence, creative limited]
related: [meta-ads-video-vs-static-vs-carousel, how-to-analyse-competitors-facebook-instagram-ads]
cta:
  heading: "How quickly do your competitors refresh?"
  text: "Sort any advertiser's active Meta ads by newest to see their launch rhythm, and by longest running to find the creative they keep."
  label: "Investigate competitor creative"
  href: "/"
sources:
  - title: "Creative fatigue webhook (Marketing API)"
    url: "https://developers.facebook.com/documentation/ads-commerce/marketing-api/ads-webhooks/creative-fatigue"
    publisher: "Meta for Developers"
  - title: "Creative Fatigue: What It Is and How to Prevent It"
    url: "https://www.jonloomer.com/creative-fatigue-meta-ads/"
    publisher: "Jon Loomer"
    note: "Practitioner analysis, including how Ads Manager labels fatigue."
  - title: "About the learning phase"
    url: "https://www.facebook.com/business/help/112167992830700"
    publisher: "Meta Business Help Centre"
---

"Refresh your creative every two weeks" is advice you will see repeated with great confidence. It is not supported by any published Meta guidance, and it is wrong for most accounts in one direction or the other. A brand spending £500 a month against a broad UK audience can run the same strong ad for months. A brand spending £50,000 a month against a narrow audience may see a new ad decline within days.

The better question is not *how often* but *how will we know*, and *how fast can we replace what is tiring?* This guide covers how creative fatigue shows up in Meta data, how to separate it from other causes of decline, and how to set a refresh rhythm based on your own spend and results.

:::takeaways
- Creative fatigue is a pattern in the data: the same people see an ad repeatedly, engagement falls and the cost of each result rises. It is not a calendar event.
- Meta itself signals fatigue. Its Marketing API reports a creative fatigue level of low, medium or high, and Ads Manager can show fatigue-related delivery labels.
- Before refreshing, rule out the market (seasonal costs), the offer, the landing page and tracking. Fatigue affects individual ads; market effects hit everything at once.
- Refresh rhythm should scale with spend and audience size. Build a pipeline of new concepts and iterations rather than replacing everything at once.
:::

## What creative fatigue actually is

Creative fatigue is what happens when the people most likely to respond to an ad have already seen it, often more than once, and the remaining audience responds less. Delivery continues, but each result costs more.

Meta describes the same thing in its developer documentation. Its [creative fatigue webhook](https://developers.facebook.com/documentation/ads-commerce/marketing-api/ads-webhooks/creative-fatigue) notifies apps when an ad's fatigue level changes between **low, medium and high**, and explains that fatigue builds as an audience sees the same creative repeatedly, usually showing as a falling click-through rate and a rising cost per action. Meta does not publish the thresholds behind those levels.

In Ads Manager, practitioners report that fatigue can also surface in the Delivery column with labels such as "Creative fatigue" or "Creative limited". Jon Loomer's analysis of these labels describes them as being based on cost per result rising compared with the ad's own history. Meta does not document the exact calculation, so treat the labels as a prompt to investigate, not a verdict.

## The signals to watch

No single metric proves fatigue. Look for several moving together on the same ad, over the same period:

| Signal | What fatigue looks like | What else could cause it |
| --- | --- | --- |
| Frequency | Rising steadily for the ad or ad set | A small audience, a budget increase or retargeting by design |
| Click-through rate | Falling from the ad's own earlier level | Placement mix shifting, for example more Audience Network |
| Cost per result | Rising for this ad while others hold steady | Auction costs rising for everyone, or a conversion tracking problem |
| Conversion rate after the click | Usually steady; fatigue is mainly an engagement problem | A drop here points to the landing page, price, stock or offer |
| CPM | Can rise as engagement falls | Seasonal competition, especially from October to December |
| Comments and reactions | More negative or "seen this already" responses | Organic sentiment about the brand itself |

### Frequency is context, not a threshold

You will see frequency caps quoted as rules: "never go above 3", "fatigue starts at 5". There is no universal figure, and Meta does not publish one. A retargeting ad set aimed at basket abandoners should have high frequency. A prospecting campaign reaching millions of people can hold a low frequency for months. What matters is whether rising frequency coincides with worsening results on that ad.

## Is it fatigue, or something else?

Before changing creative, rule out causes that a new ad will not fix. The quickest check is to ask: **is this one ad, or everything?**

:::example Diagnosing a drop
Cost per purchase across an account rises 35% in the second week of November.

- **If every ad, including brand-new ones, gets more expensive at the same time:** this is probably the market. Competition for attention around Black Friday typically pushes costs up. New creative will not reverse it.
- **If the oldest, highest-frequency ads decline while newer ads hold steady:** this looks like fatigue. Refreshing those ads is the right move.
- **If click-through rate is steady but conversion rate falls:** look at the landing page, prices, stock and the checkout before touching creative.
- **If reported conversions fall but orders in your own systems do not:** check tracking first. A broken pixel or Conversions API connection can look exactly like a performance collapse.

The 35% figure and timings are illustrative.
:::

## Iterate, replace or leave alone

Not every tired ad needs a brand-new concept. Matching the response to the problem saves production time.

| Situation | Response |
| --- | --- |
| Strong concept, opening has worn out | **Iterate:** new hook, first frame or headline on the same body |
| Concept is tiring but the message still matters | **Re-format:** turn the video into statics or a carousel, or the reverse |
| Concept has stopped working across iterations | **Replace:** a new angle, proof point or offer |
| Ad is old but still meeting targets | **Leave it.** Add new ads alongside rather than switching it off |
| Whole account declining at once | **Hold creative.** Investigate market, offer, site and tracking |

Long-running ads that still perform are an asset, not a problem. Pausing a winner purely because of its age is one of the more common and expensive mistakes in Meta accounts.

## How refreshing interacts with delivery

Adding and removing ads changes what Meta's delivery system has to work with:

- **Add before you remove.** Launch new ads while the declining ones are still running, then pause the old ones once the new ones have enough delivery to judge.
- **Give the system distinct options.** Several genuinely different concepts usually give Meta more to work with than many small variations of one image.
- **Avoid constant churn.** Making significant changes every few days can keep ad sets from stabilising.

:::verify
Meta's help centre describes a learning phase after a new ad set launches or after a significant edit, typically lasting until the ad set has gathered around 50 optimisation events. Edits that count as significant, including creative changes, are listed in Meta's [About the learning phase](https://www.facebook.com/business/help/112167992830700) article. Check the current list before planning a large refresh, as Meta has adjusted it over time.
:::

## Setting a refresh rhythm for your account

Rather than a calendar rule, build a rhythm from three inputs: how much you spend, how large your audience is, and how quickly your ads have declined in the past.

1. **Look back.** For your last 10 to 20 ads with meaningful spend, note how many days it took for cost per result to rise noticeably above its early level. That is your typical creative lifespan.
2. **Plan to have replacements ready before that point.** If ads usually decline after around six weeks, new concepts need to be briefed, produced and launched before then.
3. **Keep a steady pipeline.** A regular flow of a few new concepts and iterations is easier to sustain, and easier to learn from, than a quarterly overhaul.
4. **Review weekly at higher spend, monthly at lower spend.** Check frequency, click-through rate and cost per result for each ad against its own history.

:::example A refresh rhythm by spend
| Monthly Meta spend | Possible rhythm |
| --- | --- |
| Under £5,000 | One or two new concepts a month; iterate winners when they tire |
| £5,000 to £50,000 | A few new concepts and several iterations each month; weekly review |
| Over £50,000 | A continuous production pipeline with weekly launches and twice-weekly review |

These tiers are illustrative starting points, not benchmarks. Adjust them using your own historical creative lifespan.
:::

:::cta heading="Learn from competitors' refresh rhythm" label="Search an advertiser" href="/" placement="inline_rhythm"
AdSnoop shows how many of an advertiser's active ads launched this week, which ads have been running longest, and how their creative mix is changing.
:::

## What competitors' refresh rhythm can tell you

Your competitors' ads are public, so their refresh rhythm is partly visible too. A competitor that launches new ads every week, iterates the same concepts and keeps a small core running for months is running a disciplined testing programme. One whose ads all launch on the same day each quarter is probably refreshing on a calendar.

Two cautions. First, you cannot see their spend, so you cannot tell which ads carry the budget. Second, a high launch rate is not proof of success; it may be a sign that nothing is working. Use the rhythm as context for your own planning rather than a target to match.

:::impact
### Who this affects

Any advertiser whose creative is reviewed on a fixed schedule, or whose ads are paused because of their age rather than their results.

### What it changes

Moving from a calendar to signals means refreshing tired ads sooner and keeping proven ones longer. It also stops creative changes being used to "fix" problems that are actually seasonal, technical or commercial.

### Recommended action

Measure your own typical creative lifespan from recent ads, set a weekly or monthly review based on spend, and keep new concepts in production ahead of when you expect current ads to tire. Treat Meta's fatigue signals as prompts to investigate.

### When no action is needed

If your ads' cost per result is stable against their own history and Meta is showing no fatigue signals, there is no reason to refresh for the sake of it. Keep adding new tests alongside, but leave what is working alone.
:::
