# Estimated Media Spend: assessment and safe future approach

Status: **not published in the dashboard** (November 2026).

## Proposed model

```
estimated impressions = reach × assumed frequency     (frequency 1.5–3)
estimated spend       = estimated impressions ÷ 1,000 × CPM   (CPM £7, editable)
```

## Why it isn't live

The reach figures Meta's Ad Library API gives us don't satisfy the conditions the model needs.

1. **Reach is per ad, and audiences overlap.** `total_reach_by_location` is the reach of one ad. The same people see many ads from one advertiser, so summing ad reach overstates the brand's audience, often several times over. We'd need unique brand reach, which the API doesn't provide.
2. **The reporting period is undefined.** The figure covers the ad's whole delivery so far: a few days for a new ad, more than a year for a long-runner. Adding them gives a number that belongs to no period, so it can't be read as monthly or weekly spend.
3. **Coverage is uneven.** Reach is reported only for ads delivered in the UK/EU under transparency rules, and it's missing or zero for a share of active ads. Ads that stopped are absent from an active-ads query, so recent spend that has finished is invisible.
4. **CPM and frequency are assumptions, not observations.** UK Meta CPMs vary several-fold by objective, placement, audience and season. Combined with an assumed frequency range, the output range would be wide and easy to mistake for a measurement.

Publishing it would create a figure that looks precise but isn't defensible, and AdSnoop's credibility depends on not doing that.

## Safe future approach

The prerequisites:

- **Historical snapshots.** Store each tracked advertiser's active ads, with per-ad reach, at regular intervals (daily or weekly). The change in an ad's reach between two snapshots is the reach it gained in that period. That gives the model a defined period.
- **Per-period increments only.** Sum each ad's *increase* in reach within the period, never lifetime totals. Label this "ad-level reach gained (overlapping)", not unique audience.
- **Ranges, not points.** Show a low–high band using the frequency range (1.5–3) and a CPM range the user can edit (default £7 as a stated assumption). Never show a single spend figure.
- **Labelling.** Always label it "Modelled spend estimate", show the formula and inputs beside it, and state that it isn't actual spend. Show the share of ads with reach data and suppress the estimate when coverage is low (for example under 70% of active ads).
- **Comparisons.** Use it for relative comparisons between brands over the same period and coverage, where shared assumptions affect every brand alike, rather than as an absolute budget.

The Compare dataset already keeps per-ad reach (`r`) and each browser stores which ad IDs were active at each check (`adsnoop-cmp-snap-v1:*`). Server-side snapshots, which belong with future accounts and watchlists, are the missing piece.
