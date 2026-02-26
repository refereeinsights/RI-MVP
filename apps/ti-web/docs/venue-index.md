# TI Venue Index

The **TI Venue Index** is a composite 0-100 venue quality signal derived from aggregate venue review metrics.

It is an aggregate index, not a single rating field.

## Inputs

- `restroom_cleanliness_avg`
- `parking_convenience_score_avg`
- `shade_score_avg`
- `vendor_score_avg`
- `review_count`
- `reviews_last_updated_at`

## Component Weights

- Restrooms: **30%**
- Parking: **25%**
- Shade: **20%**
- Vendors: **15%**
- Freshness: **10%**

## Score Normalization

- Average component inputs are treated as `1-5` by default and normalized to `0-100`.
- If a component value is already above `5`, it is treated as already `0-100`.
- Missing component averages are omitted and weights are renormalized across available components.

## Freshness Buckets

`days_since_update = now - reviews_last_updated_at`

- `<=30 days`: `100`
- `31-90`: `85`
- `91-180`: `70`
- `181-365`: `55`
- `>365` or null: `40`

## Confidence Buckets

Confidence factor reduces early scores until review volume is stronger.

- `review_count <= 2`: `0.85`
- `3-4`: `0.90`
- `5-9`: `0.95`
- `>=10`: `1.00`

## Final Formula

- `weighted_base_score` = weighted average of available normalized components + freshness
- `index_raw = weighted_base_score`
- `index = round(clamp(index_raw * confidence_factor, 0, 100))`

If `review_count` is null/zero (or too little component data), TI returns **Not enough data**.

## UI Interpretation

- Label thresholds:
  - `85+`: **High**
  - `70-84`: **Good**
  - `55-69`: **Fair**
  - `<55`: **Low**
- Bars:
  - 0 to 5 bars based on index bands (20-point increments)
- If review count is under 5, UI shows:
  - `Early data — score stabilizes as reviews increase.`
