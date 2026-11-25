# Category-based modelled media spend

Status: implemented in the Competitor Insights / My competitors overview; deployment is separate.

## Product behaviour

The overview shows a rounded estimate for each tracked brand and an equal-weight competitor average that excludes the user's own brand. A default category applies to the tracked group; each competitor can override it or inherit the default. Category choices persist on the device and round-trip through the existing signed-in account tracker.

The label is **Modelled estimate**. The scope is cumulative UK spend associated with the observed active ads, with each brand's earliest launch date and collection date shown. The UI does not call it monthly spend. Advertisers can cover different launch dates, which limits interpretation of their average.

## Supplied benchmarks

| Category | Currency | CPM | Frequency | Cost per 1,000 ad-level reach |
| --- | --- | ---: | ---: | ---: |
| Fashion (UK & ROW) | GBP | 5.23 | 8.25 | 43.1475 |
| Fashion (US) | USD | 13.05 | 6.99 | 91.2195 |
| Mobility & independent living | GBP | 7.14 | 3.85 | 27.4890 |
| Furniture & beds | GBP | 12.86 | 3.80 | 48.8680 |
| Kitchens | GBP | 15.65 | 4.05 | 63.3825 |
| Other | GBP | 7.76 | 2.77 | 21.4952 |

The unknown-category fallback is the arithmetic mean of the five GBP **combined multipliers**: £40.87644 per 1,000 reach. It is not the product of the separate average CPM and average frequency. It gives each category equal weight, rather than weighting by the benchmark sample's spend. Supplied sample spend totals are not competitor budgets.

US rates are retained separately; the US option is disabled because the available comparison reach is UK reach. The UK & ROW fashion benchmark also includes markets beyond the UK.

```
modelled spend = sum(reported per-ad UK reach) / 1,000 × frequency × CPM
competitor average = sum(eligible competitor estimates) / eligible competitor count
```

The average and individual estimates remain distinct from observed spend. Each row also shows a ±50% sensitivity scenario. This band is an illustrative model variation, not a statistical confidence interval or a calibrated error range.

## Initial calibration

On 25 November 2026, Strachan's complete active-ad dataset contained 58 ads with reach for all 58, totalling 174,518 per-ad UK reach. Earliest launch: 26 October 2026. Applying furniture frequency 3.80 and CPM £12.86 gives £8,528.35 (displayed as approximately £8.5k).

An initial operator spot-check was encouraging, but the actual reporting period and campaign coverage were not independently matched. One advertiser does not establish accuracy across categories. Operator-supplied actual budgets remain private and are not used to fit an accuracy interval.

## Eligibility and missing data

- Require a complete collection, explicit GB coverage and valid collection/launch dates.
- Deduplicate by Meta ad ID.
- Require finite, nonnegative reach for at least 70% of collected ads. Null, missing, negative and non-finite values are unavailable. Reported zero is retained as data.
- Sum only reported reach; never extrapolate missing reach or treat it as measured zero.
- Exclude ineligible estimates from the average and display the included competitor count against the full count. Loading/error states never become a zero budget.
- Partial fallback collections and UK + EU comparisons are excluded from this UK model.
- Category overrides are validated in the account API; legacy trackers remain valid without category fields.

## Interpretation limits

Reach is deduplicated within each ad, but people can appear in several ads. The sum is ad-level reach, not a unique brand audience. Multiplying it by an **ad-level** frequency can approximate impressions even with audience overlap. The supplied frequency's aggregation level (ad, campaign or account) and reporting period are unverified. Using a campaign/account frequency with summed per-ad reach can overstate impressions. This scope assumption is disclosed in the model explanation.

Active-ads queries omit stopped ads. Reach is cumulative over each ad's delivery and may be rounded or delayed. Benchmarks vary by objective, placement, audience, market and season. Complete collection means all accessible active ads were retrieved, not that all historical advertising or actual spend is known.

For monthly budget estimates, obtain period-matched delivery and frequency. Historical snapshots can identify changes, but increases in cumulative unique reach measure newly reached people and miss repeat delivery to people already reached; they do not by themselves recover monthly impressions or spend. Further validation should compare several known budgets over matched dates and scope.

## Implementation and checks

- `public/live/spend.js`: standalone benchmark/calculation model, loaded before the main app.
- `public/live/app.js`: overview panel, selectors, saved choices and explanation.
- `app/api/account/route.ts`: optional category validation and persistence.
- `scripts/check-spend.mjs`: run with Node 22.13+; verifies Strachan, coverage gates, missing/zero reach, duplicates, dates, currencies, averages, rendering and account sanitisation.
