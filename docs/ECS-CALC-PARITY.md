# ECS Calc Parity Spec — authoritative formulas from Rev.2.4.7 workbook

**Date:** 2026-06-21
**Source of truth:** `(Rev.2.4.7) Feasibility 1toAll (Draft).xlsx` — sheets `Summary`, `4) CF`, `0) Reference` (read-only extraction).
**Purpose:** lock the exact cost formulas before patching the live calc in `compass-golden-path` (`src/lib/estimateCalc.ts`).

> ⚠️ Please verify the formulas in §2 against your workbook before I change production calc — I reverse-engineered them from the cells.

---

## 1. Inputs / named ranges (resolved)

| Name | Cell | Meaning | Default |
|---|---|---|---|
| `rev.otc` | Summary!AB60 | OTC sale, ex-VAT (Σ qty×sell) | — |
| `rev.mrr` | Summary!AB77 | MRC sale per month, ex-VAT | — |
| `rev.total` | CF!C20 | OTC + MRC×contract (total revenue ex-VAT) | — |
| `capex.total` | Summary!V46 | Σ investment **cost** (V34:W44) | — |
| `contract` | Summary!AC11 | contract months | 12 |
| `imp.duration` | Summary!AC9 | install/delivery months | 0 |
| `credit` | Summary!AC10 | credit term / interest-free months | 0 |
| `imp.bidbond` | Summary!AC15 | bid-bond periods | 1 |
| `rate.mkt` | Ref!H3 = `VLOOKUP(service,…,4)` | marketing rate **per service** | 0.01 (0.03 Zound) |
| `rate.nbtc` | Summary!R57 = `IF(telecom,2%,0%)` | telecom license rate | 0/0.02 |
| `rate.oh` | Summary!R59 = `IF(oh,Ref!L3,0)` | overhead rate (per selection) | 0.05 |
| `rate.discount` | Summary!B94 | **NPV discount (annual)** | **0.06** |
| `gp.clevel` | Ref!I3 = Appv.L1 | C-Level margin threshold per service | 0.30 |
| `gp.ceo` | Ref!J3 = Appv.L2 | CEO margin threshold per service | 0.20 |
| project value incl VAT | Summary!N10 = `N9×1.07` | `rev.total × 1.07` | — |

Overhead tiers (`tbl.oh`, Ref!K5:L13): ซื้อมาขายไป 3% · ปกติ 5% · ใหญ่ 7% · พิเศษ 9% · Zoom 5% · Internet 5% · Cloud 5% · **ซับซ้อน/complex 15%**.

---

## 2. OPR formulas (Summary column V = Total Cost)

| OPR | Name | Authoritative formula |
|---|---|---|
| 100001 | Install & Mgmt | `'1) Install'!E19` (install subtotal) |
| 100002 | Logistics | manual amount |
| 100003 | Training/Doc | manual amount |
| 100004 | Sale/Presale mgmt | manual amount |
| 100005 | Onsite (MA/CM/PM) | `'2) PMCM'!E19` (pmcm subtotal) |
| 100006 | Spare (% CAPEX) | `capex_cost(V34:W43) × R52` (R52 = spare %) |
| 100007 | Interest | `capex_cost(V34:W44) × 1% × (imp.duration − credit)` |
| 100008 | Bid Bond | `projectValue_inclVAT × 5% × 1% × imp.bidbond × bidBondEnabled` |
| 100009 | Performance Bond | `projectValue_inclVAT × 5% × 1% × contract × perfBondEnabled` |
| 100010 | Marketing | `rate.mkt(service) × rev.total` |
| 100011 | Telecom License | `rate.nbtc × rev.total` (2% if enabled) |
| 100012 | Entertainment/Gift | manual amount |
| 100013 | Overhead | `rate.oh × rev.total` |

Notes:
- `projectValue_inclVAT = rev.total × 1.07`; `rev.total = rev.otc + rev.mrr × contract`.
- Bonds = a **bank guarantee fee** (bond size 5% × fee 1% × periods), *not* 5% of revenue.
- Interest accrues over `(install duration − credit term)` months on CAPEX **cost**.

## 3. P&L / routing (sheet `4) CF`)
- Monthly cash-flow spread over `contract` months; OTC in month 1, MRC monthly.
- Marketing/License/Overhead each = `rate × monthly revenue`, summed → `rate × rev.total`.
- **Net Profit (NPV)** = `NPV(rate.discount/12, monthlyCashFlowWithOH)` where monthly CF = revenue − opex − overhead − capex (CF row 47).
- **Margin (routing)** = `NetProfitNPV / rev.total` (CF!C13).
- **Approval level:** margin ≥ `Appv.L1`(0.30) → Manager/Director · `Appv.L2`(0.20) ≤ margin < L1 → C-Level · margin < `Appv.L2` → CEO. (Per service type.)
- **Payback** = month index where cumulative CF turns positive.

---

## 4. Discrepancies in the current `estimateCalc.ts` (to fix)

| # | Item | Current (live app) | Correct (Excel) | Severity |
|---|---|---|---|---|
| **D1** | **Bonds (OPR-100008/9)** | `5% × revenue` (ex-VAT) | `revInclVAT × 5% × 1% × periods` | **Major (~100× over)** |
| D2 | Marketing (OPR-100010) | fixed `1% × revenue` | `rate.mkt(service) × revenue` | Medium |
| D3 | Interest (OPR-100007) | `cost × 1% × ceil(credit/30)` | `cost × 1% × (imp.duration − credit)` | Medium |
| D4 | Overhead tiers | 4 tiers (3/5/7/9) | 8 tiers incl Zoom/Internet/Cloud 5%, **complex 15%** | Medium |
| D5 | NPV discount | hardcoded 5%/yr | `rate.discount` (default **6%**, configurable) | Medium |
| D6 | Margin for routing | `np_pct = (gp−oh)/tcv` (undiscounted) | `NPV_net / revenue` (discounted CF) | Medium (model) |
| D7 | Project value incl VAT | not modeled | `× 1.07` (needed for bonds) | (part of D1) |

**Tier 1 (this patch — localized, verifiable):** D1, D2, D3, D4, D5, D7.
**Tier 2 (follow-up — model change):** D6 (discounted-CF margin + payback via monthly cash-flow). Until D6, keep `np_pct` but expose NPV at `rate.discount`.

---

## 5. Known-value test anchors (for `estimateCalc.test.ts`)
Scenario A (telecom, 1 OTC item): cost 100,000, sell 120,000, qty 1; MRC sell 10,000/mo cost 6,000; contract 12; service "Communication | UC" (rate.mkt 1%); overhead normal 5%; telecom on; bid+perf bond on; imp.duration 2, credit 1, imp.bidbond 1.
- revenue = 120,000 + 10,000×12 = **240,000**; inclVAT = 256,800
- marketing = 1% × 240,000 = **2,400**
- license = 2% × 240,000 = **4,800**
- overhead = 5% × 240,000 = **12,000**
- bid bond = 256,800 × 5% × 1% × 1 = **128.40**
- perf bond = 256,800 × 5% × 1% × 12 = **1,540.80**
- interest = 100,000 × 1% × (2−1) = **1,000**
- spare (R52=0) = 0
These exact numbers become assertions; they expose D1 (current app would output bid 12,000 / perf 12,000 instead of 128.40 / 1,540.80).

*After you confirm §2, I implement the Tier-1 patch + tests, verify in a sandbox, then push to Lovable.*
