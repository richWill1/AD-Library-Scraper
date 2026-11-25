# Category-based modelled media spend

## Product behaviour

The My competitors overview compares the user's brand with a named tracked competitor or the average across multiple tracked competitors. Both sides use the same 30 calendar days and one shared UK model. Previously saved category settings do not change the comparison.

For each observed active ad, the model spreads its lifetime reach evenly over the days it has run and allocates the portion inside the 30-day window. Ads launched within the window contribute their observed reach without extrapolation. When snapshots are from different days, the window ends on the oldest eligible snapshot's date. Stopped ads outside the active collection are missing.

The model applies a provisional £22 per 1,000 ad-level reach. The legacy category blend was £40.87644. The revised rate is a rounded calibration choice based on a small number of spot-checks. Matching date ranges and UK-only Meta spend from authorised Ads Manager exports would provide stronger validation.

## Supplied benchmarks

| Category | Currency | CPM | Frequency | Cost per 1,000 ad-level reach |
| --- | --- | ---: | ---: | ---: |
| Fashion (UK & ROW) | GBP | 5.23 | 8.25 | 43.1475 |
| Fashion (US) | USD | 13.05 | 6.99 | 91.2195 |
| Mobility & independent living | GBP | 7.14 | 3.85 | 27.4890 |
| Furniture & beds | GBP | 12.86 | 3.80 | 48.8680 |
| Kitchens | GBP | 15.65 | 4.05 | 63.3825 |
| Other | GBP | 7.76 | 2.77 | 21.4952 |

The previous blended benchmark was the arithmetic mean of the five GBP **combined multipliers**: £40.87644 per 1,000 reach. It is not the product of the separate average CPM and average frequency. It gives each category equal weight, rather than weighting by the benchmark sample's spend. Supplied sample spend totals are not competitor budgets.

The UK benchmark excludes US rates. The UK & ROW fashion benchmark also includes markets beyond the UK.

```
modelled spend = sum(allocated 30-day UK reach per ad) / 1,000 × £22
competitor average = sum(eligible competitor estimates) / eligible competitor count
```

The calculation models spend for the active ads observed during the window.

## Initial calibration

On 25 November 2026, Strachan's complete active-ad dataset contained 58 ads with reach for all 58, totalling 174,518 per-ad UK reach. Earliest launch: 26 October 2026. Applying furniture frequency 3.80 and CPM £12.86 gave £8,528.35 in the initial category-specific test. The previous blended rate gave about £7.1k across the observed ads. The provisional 30-day rate gives about £3.7k, which shows the sensitivity to the assumed rate.

An initial operator spot-check was encouraging, but the actual reporting period and campaign coverage were not independently matched. One advertiser does not establish accuracy across categories. Operator-supplied actual budgets remain private and are not used to fit an accuracy interval.

## Eligibility and missing data

- Require a complete collection, explicit GB coverage and valid collection/launch dates.
- Deduplicate by Meta ad ID.
- Require finite, nonnegative reach for at least 70% of collected ads. Null, missing, negative and non-finite values are unavailable. Reported zero is retained as data.
- Sum only reported reach; never extrapolate missing reach or treat it as measured zero.
- Exclude ineligible estimates from the average and display the included competitor count against the full count. Loading/error states never become a zero budget.
- Partial fallback collections and UK + EU comparisons are excluded from this UK model.
- The account API preserves legacy category settings for compatibility.

## Interpretation limits

Reach is deduplicated within each ad, but people can appear in several ads. The sum is ad-level reach, not a unique brand audience. Multiplying it by an **ad-level** frequency can approximate impressions even with audience overlap. The supplied frequency's aggregation level (ad, campaign or account) and reporting period are unverified. Using a campaign/account frequency with summed per-ad reach can overstate impressions. This scope assumption is disclosed in the model explanation.

Active-ads queries omit stopped ads. Reach is cumulative over each ad's delivery and may be rounded or delayed. Benchmarks vary by objective, placement, audience, market and season. Complete collection means all accessible active ads were retrieved, not that all historical advertising or actual spend is known.

For monthly budget estimates, obtain period-matched delivery and frequency. Historical snapshots can identify changes, but increases in cumulative unique reach measure newly reached people and miss repeat delivery to people already reached; they do not by themselves recover monthly impressions or spend. Further validation should compare several known budgets over matched dates and scope.

## Implementation and checks

- `public/live/spend.js`: standalone benchmark/calculation model, loaded before the main app.
- `public/live/app.js`: 30-day comparison card.
- `app/api/account/route.ts`: optional category validation and persistence.
- `scripts/check-spend.mjs`: run with Node 22.13+; verifies Strachan, coverage gates, missing/zero reach, duplicates, dates, currencies, averages, rendering and account sanitisation.
