# ECS port — staged Phase 0-1 (calc parity)

Staging area for the Estimated Cost Sheet migration into the Lovable app `compass-golden-path`.
These files are **staged for review** — not yet pushed. Verified locally (Node): **19/19 checks pass**.

## Files
| File | Target in Lovable project | Purpose |
|---|---|---|
| `estimateCalc.ts` | `src/lib/estimateCalc.ts` (replaces) | Tier-1 calc parity fixes (D1–D5, D7) |
| `estimateCalc.test.ts` | `src/lib/estimateCalc.test.ts` (new) | vitest anchors + D1 bonds regression |

## What changed (vs the live app) — see `../ECS-CALC-PARITY.md`
- **D1 Bonds** = bank fee `projectValue(inclVAT) × 5% × 1% × periods` (was 5% × revenue ≈ 100× too high).
- **D2 Marketing** = `header.marketing_rate × revenue` (per-service; was fixed 1%).
- **D3 Interest** = `capexCost × 1% × max(0, impl_duration_months − creditMonths)`.
- **D4 Overhead** = 8 tiers + optional `header.overhead_rate` (from `presale_db_overhead`).
- **D5 NPV** = configurable `discount_rate_annual` (default 6%).
- **D7** project value incl VAT (×1.07) modeled for bonds.

## New optional header inputs (must be wired on push)
`marketing_rate` (← `presales_service_types.rate_marketing` by service) ·
`overhead_rate` (← `presale_db_overhead.percent_oh`) ·
`impl_duration_months` (new "install/delivery duration" field) ·
`discount_rate_annual` (default 6%).
Backward-compatible: if unset, sensible defaults apply (marketing 1%, overhead by type, interest 0, discount 6%).

## Push scope (Phase 1, when approved)
1. Replace `src/lib/estimateCalc.ts` + add the test.
2. Wire inputs in `EstimateDetail.tsx` / `OpexTable.tsx` / `useEstimates.ts` (pass marketing_rate, overhead_rate, impl_duration, discount).
3. Add an "install/delivery duration (months)" field to the summary tab.
4. Run `npm run test` (vitest) in CI.

## Not in this patch (Tier-2)
Discounted-cash-flow margin & payback from a monthly CF model (workbook `4) CF`). Until then `np_pct` stays undiscounted; NPV uses the 6% rate.
