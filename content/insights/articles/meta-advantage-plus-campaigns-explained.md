---
title: "Meta Advantage+: Use It, But Don't Trust Its Scorecard"
seoTitle: "Meta Advantage+ in 2026: Is It Worth It? Our Take"
description: "Advantage+ is now Meta's default. Our take after reviewing the tests and practitioner debate: switch it on, but judge it on new customers, not Ads Manager ROAS."
category: strategy-optimisation
status: draft
publishedAt: 2026-11-26
author: AdSnoop Editorial
art: control-dials
artAlt: "Illustration of three glowing switches for budget, audience and placements, all switched on, beside a set of slider controls"
keywords: [meta advantage+, advantage+ sales campaigns, advantage+ vs manual, advantage+ shopping campaigns, meta ads automation, incrementality, new customer acquisition]
related: [roas-vs-poas-meta-ads-profitability, meta-conversions-api-explained]
cta:
  heading: "When Meta picks the audience, creative does the work"
  text: "Search an advertiser to see the concepts, formats and offers their active Meta ads are built on, and which ones they have kept running longest."
  label: "Search competitor ads"
  href: "/"
sources:
  - title: "Advantage+ campaign experience for Sales, App and Leads"
    url: "https://developers.facebook.com/docs/marketing-api/advantage-campaigns"
    publisher: "Meta for Developers"
  - title: "For Meta marketers, automation isn't always the advantage (but it's complicated)"
    url: "https://www.adexchanger.com/measurement/for-meta-marketers-automation-isnt-always-the-advantage-but-its-complicated/"
    publisher: "AdExchanger, October 2025"
    note: "Reports Haus's analysis of 640 incrementality tests."
  - title: "Meta is pushing Advantage+ campaigns relentlessly"
    url: "https://www.wickedreports.com/blog/meta-is-pushing-advantage-campaigns-relentlessly"
    publisher: "Wicked Reports, November 2025"
    note: "Analysis of 55,661 campaigns reconciled against orders."
  - title: "Meta Clarifies Upcoming Placement Control Changes"
    url: "https://www.jonloomer.com/meta-placement-control-changes/"
    publisher: "Jon Loomer"
  - title: "Advantage+ audience (Marketing API)"
    url: "https://developers.facebook.com/docs/marketing-api/audiences/reference/targeting-expansion/advantage-audience/"
    publisher: "Meta for Developers"
---

Ask ten Meta advertisers about Advantage+ and you'll get ten strong opinions. Agencies post split tests where it beats manual campaigns every time. Others say it quietly spends their budget on people who were going to buy anyway. Meta, meanwhile, has made the argument mostly academic: it's now the default.

We went through the independent tests, the agency write-ups and the practitioner debate. Here's where we landed.

:::takeaways
- **Our verdict:** for most UK ecommerce brands, switch Advantage+ on. But don't judge it by the ROAS in Ads Manager. Judge it by how many *new* customers it brings in, using your own sales data.
- Advantage+ is very good at finding people likely to buy. The catch is that some of them would have bought anyway.
- Exclude existing customers from prospecting, and keep a small amount of budget for controlled tests.
- With targeting automated, your creative is now the main thing you control.
:::

## First, what's actually changed

Advantage+ used to be a separate campaign type you chose. Now it's a status. Meta's [documentation](https://developers.facebook.com/docs/marketing-api/advantage-campaigns) says a Sales, Leads or App campaign is Advantage+ when three settings are on: campaign budget, audience and placements. New campaigns start with all three switched on.

In 2026, Meta has also been [removing ad-set placement choices](https://www.jonloomer.com/meta-placement-control-changes/) for Sales, Leads, App and Engagement campaigns. Turning off Reels or Audience Network for one ad set is going away. What's left is account-wide exclusions and bid adjustments called value rules.

So the real question isn't "Advantage+ or manual?" It's "how do I make sure Advantage+ is doing something useful?"

## The case for it

The fans have a point. Meta's machine learning has far more data on who buys than any interest list you could build. Agencies regularly publish tests where Advantage+ beats a matching manual campaign on ROAS. Running one well-funded campaign also beats spreading budget across lots of small ones that never get enough data to learn.

For a brand with decent tracking, a broad UK market and a steady flow of creative, it's also much less work.

## The case against it

The sceptics have better evidence than you might expect.

Measurement firm Haus looked at **640 incrementality tests** over 18 months. These test whether ads caused sales, rather than just being near them. <span class="ins-label">Verified</span> Manual campaigns won 58% of the tests and Advantage+ 42%, according to [AdExchanger's report](https://www.adexchanger.com/measurement/for-meta-marketers-automation-isnt-always-the-advantage-but-its-complicated/). Haus's own strategy chief suggested the algorithm may be *too* good at finding likely buyers, reaching people who would have bought anyway. She also stressed the results were close and pre-date Meta's latest delivery updates.

Wicked Reports went through **55,661 campaigns** and matched them to real orders. It found Advantage+'s cost to acquire a genuinely new customer roughly doubled between May 2024 and May 2025, while manual campaigns got cheaper. Its [conclusion](https://www.wickedreports.com/blog/meta-is-pushing-advantage-campaigns-relentlessly) was that Advantage+ looked like it was capturing existing demand rather than creating new customers.

The recurring complaint in agency write-ups and forums is the same: Advantage+ drifts towards your existing customers, because they're the easiest sales. That makes the ROAS look great while growth stalls. Meta used to offer a cap on spend to existing customers. It removed it in the new set-up.

:::note Read the evidence fairly
None of these studies cover your account. Haus's average brand spent over $1 million a month, and both datasets pre-date some of Meta's 2025 and 2026 changes. Treat them as a reason to measure carefully, not a reason to switch Advantage+ off.
:::

## Our take

Both sides are right, and they're measuring different things. Advantage+ is excellent at *finding sales*. Whether it *creates* sales is a separate question, and Ads Manager can't answer it for you.

So use it, but set it up so it has to earn its keep:

1. **Exclude existing customers from prospecting.** Upload a customer list and add it as an exclusion. Meta treats [exclusions as hard limits](https://developers.facebook.com/docs/marketing-api/audiences/reference/targeting-expansion/advantage-audience/), even with Advantage+ on. Run a separate, smaller campaign for repeat buyers if you want one.
2. **Measure new customers, not ROAS.** Check your Shopify or till data each month. If Meta spend goes up and new customers don't, something's off. Our [ROAS vs POAS guide](/insights/roas-vs-poas-meta-ads-profitability) explains why a good-looking ROAS can still lose money.
3. **Fix tracking first.** Advantage+ optimises towards whatever you send it. If your pixel and [Conversions API](/insights/meta-conversions-api-explained) are patchy, it's learning from bad data.
4. **Block junk placements at account level.** If Audience Network or similar placements bring cheap clicks that never buy, exclude them in your ad account settings. That doesn't break Advantage+ status.
5. **Keep 10–20% for controlled tests.** A small manual or tightly structured campaign gives you something to compare against. If you can, run a holdout test now and then: pause ads in one region and see what happens to sales.
6. **Treat the opportunity score as a suggestion.** It goes up when you switch more automation on. That's not the same as making more money.

:::example When we'd hold back
- **A brand-new ad account** with little purchase data. Give Meta a starting point with audience suggestions first.
- **Lead generation with quality problems.** Advantage+ finds cheap form-fillers brilliantly. Fix what you optimise for first, such as qualified leads sent back through the Conversions API.
- **Very small budgets.** If you can't get anywhere near 50 conversions a week, Meta has little to learn from, automated or not.
:::

## Creative is the new targeting

When Meta chooses the audience, placements and budget split, the one big lever you still hold is the ad itself. A price-comparison ad finds bargain hunters. A founder story finds people who care about the brand. Different concepts reach different people.

That's why the brands doing well with Advantage+ tend to run lots of genuinely different creative, not ten versions of the same image. It's also why it pays to see what your competitors are putting money behind.

:::impact
### Who this affects

Anyone running Meta Sales, Leads or App campaigns, which now default to Advantage+.

### What changes

Less control over targeting and placements, more reliance on Meta's judgement, and a bigger gap between what Ads Manager reports and what actually grows the business.

### Recommended action

Keep Advantage+ on, exclude existing customers from prospecting, and judge results on new customers from your own sales data.

### When no action is needed

If your new-customer numbers are growing in line with Meta spend, leave it alone. That's Advantage+ doing its job.
:::
