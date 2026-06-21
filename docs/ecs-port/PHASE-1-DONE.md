# Phase 0-1 — DONE (calc parity) · 2026-06-21

## Where it landed
- **Lovable account:** Noppadol (noppadol.s@1-to-all.com)
- **Workspace:** vasavas's Lovable (`ZUb4L8UevLHL0KQU8xHz`)
- **Project:** EstiMate Compass / EstCostPilot (`31e4a13f-9090-4794-a60e-79e2f5aa7f83`)
- **GitHub:** `github.com/komsanwong/estimate-compass-85b97990`
- **Commit:** `4d818ba2ac6e95de7bf980c2f85fb50202ce5409` — "feat(estimate): add verified cost-calc engine + vitest parity tests"
- **Stack:** TanStack Start + Tailwind v4 + shadcn/ui + React 19; own Lovable Cloud DB (copies the Compass schema standard).

## What was added (surgical — nothing else touched)
| File | Purpose |
|---|---|
| `src/lib/estimateCalc.ts` | Pure calc engine (verbatim from staged) |
| `src/lib/estimateCalc.test.ts` | vitest, 19 anchor/regression tests |
| `vitest.config.ts` | node env, `src/**/*.test.ts` |
| `package.json` | + `vitest`, `vite-tsconfig-paths` (dev) · `"test": "vitest run"` |

`bun run test` → **19/19 pass**.

## Formulas implemented (authoritative — from Excel Rev.2.4.7; see ECS-CALC-PARITY.md)
- Line amount = qty × sell × fx (OTC/MRC); install/PMCM = qty × sell (THB).
- OPR-100001/100005 ← install / PMCM subtotals (override).
- OPR-100006 spare = rate × CAPEX cost.
- OPR-100007 interest = CAPEX cost × 1% × max(0, install_months − credit_months).
- OPR-100008 bid bond = projectValue(incl VAT) × 5% × 1% × bid periods.
- OPR-100009 perf bond = projectValue(incl VAT) × 5% × 1% × contract months.
- OPR-100010 marketing = marketing_rate (per service) × revenue.
- OPR-100011 license = 2% × revenue (if telecom).
- OPR-100013 overhead = overhead_rate × revenue (8 tiers incl complex 15%).
- TCV = OTC + MRC×term; project value incl VAT = TCV × 1.07.
- GP = TCV − COGS − opex(ex-OH); NP = GP − OH; NPV at configurable annual discount (default 6%).

## Verified anchors (Scenario A: OTC 100k→120k, MRC 6k→10k/mo, 12 mo, telecom+bonds, install 2 mo, credit 1 mo)
revenue 240,000 · incl VAT 256,800 · marketing 2,400 · license 4,800 · overhead 12,000 · interest 1,000 · bid bond 128.40 · perf bond 1,540.80. (Old buggy app would show bonds = 12,000 each.)

## New optional calc inputs (engine accepts; UI/DB wiring = Phase 2+)
`marketing_rate` (← presales_service_types.rate_marketing) · `overhead_rate` (← presale_db_overhead.percent_oh) · `impl_duration_months` (new field) · `discount_rate_annual` (default 6%). Backward-compatible defaults if unset.

## NOT done yet
- Phase 2: BOQ editor UI (`/estimates/$id`) wired to the engine.
- Tier-2: discounted-CF margin/payback from a monthly cash-flow model.
- Seed `estimate_items` (6,221) into this project's DB.
- `compass-golden-path` still computes bonds as 5%×revenue (separate project — not fixed here).

## How the push was done
Lovable MCP `send_message` (wait=false, then poll `get_message`). Note: `plan_mode` blocking call hits a 180s tool timeout — use wait=false + poll for code-writing tasks.
