---
title: "ROAS vs POAS: Why Profitable-Looking Meta Campaigns Can Still Lose Money"
seoTitle: "ROAS vs POAS: Break-Even ROAS and Profit on Meta Ads"
description: "A 4.0 ROAS can lose money while a 2.5 ROAS makes it. How to work out break-even ROAS, contribution margin and POAS for Meta campaigns, with worked examples."
category: measurement-profitability
status: published
publishedAt: 2026-11-22
author: AdSnoop Editorial
featured: true
art: roas-poas
artAlt: "Illustration of tall revenue bars beside much shorter profit bars, with a dashed break-even line"
keywords: [roas, poas, break-even roas, contribution margin, profit on ad spend, meta ads profitability, mer]
cta:
  heading: "Margins decide what's worth advertising"
  text: "See which products, offers and discounts your competitors keep putting money behind on Facebook and Instagram."
  label: "Search competitor ads"
  href: "/"
sources:
  - title: "Ads Insights reference: purchase_roas and related fields"
    url: "https://developers.facebook.com/docs/marketing-api/reference/ads-insights/"
    publisher: "Meta for Developers"
  - title: "Conversions API: custom data parameters (value and currency)"
    url: "https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/custom-data"
    publisher: "Meta for Developers"
  - title: "Conversions API: server event parameters"
    url: "https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/server-event"
    publisher: "Meta for Developers"
---

Return on ad spend is the number most Meta advertisers live by. It is in every Ads Manager view, it is what value-based bidding optimises towards, and it is easy to explain to a client or a finance director: for every pound we spent, we got £X back.

The problem is the word "back". ROAS measures **revenue** returned, not money kept. Two campaigns with identical ROAS can produce very different profit, and a campaign that looks healthy in Ads Manager can be quietly losing money on every order. This guide explains why, shows how to calculate your real break-even point, and sets out practical ways to bring profit into how you judge and optimise Meta campaigns.

:::takeaways
- ROAS ignores what it costs to fulfil an order. Your break-even ROAS is **1 ÷ contribution margin**, so a business with a 30% margin needs a 3.33 ROAS just to stand still.
- POAS (profit on ad spend) divides profit by ad spend. Above 1.0 the advertising paid for itself on the attributed orders; below 1.0 it did not.
- Mixed-margin catalogues are where ROAS misleads most: a lower-ROAS campaign selling high-margin products can be the more profitable one.
- You can adopt POAS in reporting first, without changing what you send to Meta. Passing profit as conversion value is a bigger decision with real trade-offs.
:::

## What ROAS actually measures

ROAS is attributed conversion value divided by ad spend. In Meta's reporting, "purchase ROAS" is the purchase conversion value Meta attributes to your ads under your attribution setting, divided by the amount spent.

Three things are worth being precise about:

1. **The value is whatever you send.** Meta does not know your revenue; it uses the `value` parameter your pixel or Conversions API sends with each purchase. Depending on how your site was set up, that figure may include VAT, shipping charges, or be calculated before discount codes. Check before comparing ROAS across stores or platforms.
2. **The value is attributed, not incremental.** A purchase credited to an ad under a 7-day click, 1-day view window might have happened anyway. ROAS says nothing about what the ads *caused*.
3. **Revenue is not margin.** A £100 order selling a product that cost you £70 to buy and ship generates very different profit from a £100 order with a 70% gross margin. ROAS scores them identically.

The third point is the one this article is about.

## The break-even ROAS formula

Before thinking about POAS, work out the ROAS you need to *not lose money* on attributed orders. That depends on your **contribution margin before advertising**: the share of each pound of revenue left after the variable costs of making and delivering the sale.

> **Break-even ROAS = 1 ÷ contribution margin (before ad costs)**

If 40p of every £1 of revenue is left after product, fulfilment, payment and returns costs, you need £2.50 of revenue for every £1 of ad spend to break even (1 ÷ 0.40 = 2.5).

| Contribution margin before ads | Break-even ROAS | What a 3.0 ROAS means |
| --- | --- | --- |
| 20% | 5.00 | Losing money on every attributed order |
| 30% | 3.33 | Still slightly below break-even |
| 40% | 2.50 | Profitable, with 20p of contribution per £1 spent |
| 50% | 2.00 | Comfortably profitable |
| 60% | 1.67 | Very profitable on attributed orders |
| 70% | 1.43 | Very profitable on attributed orders |

This is why ROAS targets copied from another business, a forum or an agency deck are close to meaningless. A 3.0 ROAS is excellent for a brand with 60% margins and a loss-maker for one with 25%.

## From revenue to profit: a worked example

:::figure poas-waterfall
:::

Here is the order from the chart in detail. The numbers are illustrative, but the cost lines are the ones most ecommerce businesses need to account for.

:::example A single £100 order
- Revenue, excluding VAT: **£100**
- Cost of goods sold: £42
- Pick, pack and delivery: £9
- Payment processing: £2
- Expected cost of returns and refunds, averaged across orders: £7
- **Contribution before advertising: £40 (40%)**

With a 3.0 ROAS, Meta spend attributed to this order is about £33. That leaves **£7 of contribution** to cover fixed costs such as salaries, rent and software. At a 2.5 ROAS, the order breaks even. At 2.0, it loses £10.
:::

The figure that matters is the £7, and it is invisible in Ads Manager.

## What POAS is, and the two ways people define it

POAS, or profit on ad spend, replaces revenue with profit:

> **POAS = profit from attributed orders ÷ ad spend**

A POAS of 1.0 means the attributed orders generated exactly as much profit as you spent on ads, so you broke even. Above 1.0, the ads paid for themselves; below 1.0, they did not.

Be explicit about which "profit" you use, because practitioners use the term in two ways:

| Version | Profit figure used | Break-even point | Best for |
| --- | --- | --- | --- |
| Gross-profit POAS | Revenue minus cost of goods only | 1.0 (but flatters results) | Quick comparisons when other costs are flat |
| Contribution POAS | Revenue minus all variable costs: goods, fulfilment, fees, returns, discounts | 1.0 | Decisions about budget and scaling |

Contribution POAS is more work but more honest. Gross-profit POAS ignores shipping, fees and returns, which can easily be 15–25 percentage points of revenue for a typical online retailer. If you use it, raise your target accordingly.

## Where ROAS misleads most: mixed margins

When every product carries a similar margin, a ROAS target set from your break-even point does most of the job. The trouble starts with a catalogue where margins vary widely: own-brand versus branded stock, bundles versus single items, full-price versus clearance.

:::example Two campaigns, same spend
| | Campaign A: branded electronics | Campaign B: own-brand accessories |
| --- | --- | --- |
| Ad spend | £2,500 | £2,500 |
| Attributed revenue | £10,000 | £7,500 |
| ROAS | **4.0** | **3.0** |
| Contribution margin before ads | 30% | 60% |
| Contribution before ads | £3,000 | £4,500 |
| Contribution after ads | **£500** | **£2,000** |
| POAS (contribution) | 1.2 | 1.8 |

Judged on ROAS, Campaign A wins and probably gets more budget. Judged on profit, Campaign B produces four times as much contribution from the same spend.
:::

The same thing happens inside a single campaign. If Meta's delivery leans towards low-margin best-sellers because they convert easily, revenue-based ROAS can rise while profit falls. Value-based bidding makes this more likely, not less, because the system is doing exactly what you asked: maximising the value you send.

## What belongs in contribution margin

Include costs that rise and fall with each order. Leave out costs you would pay regardless of how many orders you take this month.

| Include | Usually exclude |
| --- | --- |
| Cost of goods (landed, including import duty) | Salaries and freelancer retainers |
| Packaging, pick-and-pack, delivery | Rent and utilities |
| Payment processing and BNPL fees | Software subscriptions |
| Discounts and promotional codes applied | Brand and content production |
| Returns, refunds and write-offs (as an expected rate) | Agency management fees, unless tied to spend |
| Marketplace or affiliate commission on the order | |

Returns deserve special attention. Fashion and footwear brands in particular can see a meaningful share of revenue come back, and Meta's reported conversion value is captured at checkout, before any return. A campaign aimed at a promotion that attracts serial returners can look strong at the checkout and weak in the bank account.

## First orders, repeat customers and payback

POAS on first orders is not the whole story. Many subscription and repeat-purchase businesses deliberately accept a POAS below 1.0 on the first order because customers come back.

That is a legitimate strategy, but it needs to be made explicitly rather than used to excuse weak numbers:

- **Know your payback period.** How many months of repeat purchases does it take for a new customer to cover the contribution you gave up on the first order?
- **Separate new from returning customers.** A campaign that mostly re-acquires existing customers should be held to a higher standard than one that genuinely finds new ones. Look at whether your attributed purchasers are new to the business before accepting a low first-order POAS.
- **Use cohort data, not hope.** Base repeat-purchase assumptions on what past cohorts actually did, ideally by acquisition channel.

## Platform ROAS versus blended efficiency

Even a perfect contribution-margin POAS still uses Meta's attributed conversions. Two checks keep that honest:

- **Blended or marketing efficiency ratio (MER):** total revenue divided by total marketing spend across channels. If Meta-reported ROAS climbs while MER is flat, Meta may be claiming credit for sales that other channels or organic demand would have generated.
- **Incrementality testing:** holdout tests, geographic tests or Meta's own lift studies estimate what the ads caused rather than what they were credited with. They take planning and budget, but they are the only direct way to answer the causal question.

## How to bring POAS into your Meta workflow

There are three realistic approaches, in increasing order of effort and risk.

### 1. Report on POAS, optimise on revenue

Keep sending revenue as conversion value. Export spend and attributed revenue by campaign (or by product set, if you run catalogue campaigns), join them to margin data in a spreadsheet or BI tool, and review POAS weekly alongside ROAS.

This changes nothing in Meta, carries no risk to delivery, and is enough for most advertisers to make better budget decisions. Start here.

### 2. Set ROAS targets from margin, per campaign

If you use minimum ROAS bidding or judge campaigns against a target, set the target from the break-even ROAS of the products that campaign actually sells, plus your desired profit cushion. A campaign for 60%-margin products and a campaign for 30%-margin products should not share a target.

### 3. Send profit as conversion value

Some advertisers pass profit (or a margin-weighted value) as the purchase `value`, so that Meta's value optimisation pursues profit directly. It can work well for catalogues with very uneven margins, but weigh the trade-offs carefully:

- **You are sharing commercially sensitive margin data** with an ad platform. Decide deliberately whether that is acceptable.
- **Reporting changes meaning.** "ROAS" in Ads Manager becomes POAS, which will not reconcile with your revenue and can confuse anyone who is not aware of the change.
- **Historical comparisons break.** Performance before and after the switch is no longer like-for-like, and the delivery system has to relearn what a valuable conversion looks like.
- **Accuracy matters more.** Profit values that are calculated wrongly, or that omit returns, will steer delivery wrongly at scale.

:::note Implementation detail
The purchase value Meta optimises towards is the `value` (with `currency`) in the event's custom data, sent by the pixel and/or the Conversions API. If you change what that value represents, change it consistently on both, or deduplicated events can report inconsistent values.
:::

:::impact
### Who this affects

Any advertiser judging Meta performance mainly on ROAS, and especially ecommerce brands with mixed-margin catalogues, heavy discounting, high return rates or significant shipping costs.

### What changes

Nothing about Meta's platform changes. What changes is the question you ask of it: not "how much revenue did the ads drive?" but "how much profit did the ads leave us with?"

### Recommended action

Calculate your contribution margin before advertising, derive your break-even ROAS, and add a POAS column to your weekly reporting. Only consider sending profit as conversion value once reporting shows that revenue-based optimisation is genuinely steering spend towards low-margin sales.

### When no action is needed

If you sell one product, or products with near-identical margins, and your ROAS targets are already set from your break-even point, ROAS and POAS will rank campaigns the same way. A spreadsheet check each quarter is enough.
:::

## A short checklist

- Confirm what your purchase `value` includes: VAT, shipping, discounts.
- Calculate contribution margin before advertising, including returns.
- Derive break-even ROAS, then set targets above it with a deliberate profit cushion.
- Group products or campaigns by margin band before comparing performance.
- Track POAS alongside ROAS, and MER alongside both.
- Treat first-order losses as an investment only when cohort data supports the payback.
