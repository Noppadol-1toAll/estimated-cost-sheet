# Estimated Cost Sheet — Build Plan (enhance the existing Compass module)

**Date:** 2026-06-21
**Target:** Lovable project `compass-golden-path` ("Sales Compass Foundation"), commit `c45fb29`
**Verdict:** **Enhance, do not rebuild.** A substantial native ECS module already exists in the app and is well-aligned with the standalone. Closing specific gaps is far cheaper and safer than a 9-tab rewrite.

> Read-only review only — nothing has been written to the app or DB.

---

## 1. What already exists (native, in the app)

| Area | Implementation | Maps to standalone tab |
|---|---|---|
| Routing | `/estimated-cost`, `/estimated-cost/:id`, `/presales/estimates`, `/deals/:dealId/estimated-cost`, `/cost-approval` (`src/App.tsx`) | shell |
| List | `pages/EstimatesList.tsx` | document list |
| Editor | `pages/EstimateDetail.tsx` | Tabs 1,3,4,5,6,7,8 |
| Header card | customer/project/sale/presale/type/payment/service/contract/credit/total | Tab 1 |
| OTC + MRC tables | `components/estimates/LineItemsTable.tsx` | Tab 3 / Tab 5 |
| Install + PMCM | `components/estimates/InstallPmTable.tsx` (+ `INSTALL_PM_TEMPLATE`) | Tab 6 |
| Operation cost | `components/estimates/OpexTable.tsx` (13 OPR rows) | Tab 4 |
| P&L summary | `components/estimates/SummaryCard.tsx` + FX + overhead radio + bonds + telecom toggle | Tab 7 |
| Approval | `components/estimates/CostApprovalPanel.tsx`, `useEstimateApprovalLevel`, `submit_estimation_approval` RPC | Tab 8 |
| PDF | `lib/estimatePdf.ts` (`generateEstimatePdf`) | Tab 7 PDF |
| Calc engine | `lib/estimateCalc.ts` (pure: `computeTotals`, `computeOprAmounts`, `recalcLine`) | calc pipeline |
| Persistence | `hooks/useEstimates.ts` → `estimates` + `estimate_lines` (replace-lines) | save/load |
| Deal link | `LinkDealDialog` / `LinkDealConfirmDialog` (imports `deal_products`) | (new capability) |
| Legacy bridge | `pages/EstimatedCostDashboardFrame.tsx` iframes the old app w/ Supabase session postMessage | (to retire) |

The calc engine already implements: line amount = qty × sell × fx; install/PMCM → OPR-100001/100005 override; OPR-100006 = % of CAPEX cost; OPR-100007 interest = 1%/mo × ceil(credit_days/30) × CAPEX cost; bonds/marketing/license = rate × revenue; overhead = rate × revenue; TCV = OTC + MRC×term; GP = TCV − COGS − opex(ex-OH); NP = GP − OH; payback; NPV @ 5%/yr.

---

## 2. Gap analysis vs the standalone (the real work)

### 2A. Calc parity (highest risk — COO-facing financials)
| # | Standalone semantics (from Excel + memory) | Existing `estimateCalc.ts` | Action |
|---|---|---|---|
| C1 | OPR base for interest (OPR-100007) = investment **sale** (ASSUMPTION #1) | uses OTC **cost** | confirm cost vs sale; align |
| C2 | Bonds (OPR-100008/9) base = project value **incl VAT** (`pvVat = pvEx×1.07`) | uses revenue **ex-VAT** | add VAT factor to bonds base |
| C3 | Marketing (OPR-100010) rate = per-service `presales_service_types.rate_marketing` | fixed `0.01` | read rate from service type |
| C4 | Marketing/License/Overhead **C-Level/CEO manual override + reset-to-auto** | only install/pmcm override wired | add role-gated overrides |
| C5 | NPV uses a **configurable discount rate** + credit term (NPV card) | hardcoded 5%/yr | add NPV inputs (discount/credit) |
| C6 | Financial summary = 11 explicit lines (COGS, install+log+train, after-sales, spare, interest, monthly×term, bonds, mkt, license, entertain, salesOps; OH; Net) | aggregate GP/NP | verify SummaryCard + PDF match line breakdown |
| C7 | MRC table = per-month (no ×term in the row) | per-row amount is per-month ✓ | OK — keep |
| C8 | Install/PMCM not double-counted in totals (only via OPR) | install/pmcm excluded from TCV; only override OPR ✓ | OK — verify |

### 2B. Missing features
- **Tab 2 — Service Detail (scope bullet lines)** for the quotation/PDF scope section — not present in `EstimateDetail`. Add (maps to standalone `serviceLines`; could persist in `estimates.notes`/jsonb or a small table).
- **Item catalog search/autocomplete** in line tables — needs `estimate_items` populated (currently **0 rows**). Verify `LineItemsTable` item lookup; seed catalog.
- **Estimated Cost Sheet PDF fidelity** — `generateEstimatePdf` exists; verify it matches the standalone's detailed layout (red header, ONE TIME/Operation/MONTHLY tables, 4-level signature block from `presale_db_sales`/`presale_db_presales`, repeat page header).
- **NPV calculator card** (Tab 5) with discount rate + credit term inputs (ties to C5).
- **Excel paste** into line tables (standalone "วางจาก Excel") — optional nicety.

### 2C. Data seeding (writes — needs go-ahead)
- `estimate_items` ← standalone `item` (**6,221** rows) — catalog empty.
- `estimation_approval_rules` ← routing bands (optional per writeback contract — see §4).
- FX: confirm source — existing reads `exchange_rates`; standalone/CRM also has `presale_db_exchange_rates` (8 date-ranges; Excel had 9). Pick one source.

### 2D. UI fidelity
Existing uses shadcn + gray header chips + gold focus (`#b8972a`). Standalone is "Standard Theme V2" (red `#e8332e`). Decision needed: keep current clean look, or re-skin to match the standalone exactly ("เหมือนเดิม"). See §5 Q1.

---

## 3. Approval model — native vs writeback
Two valid paths (the CRM owner's 2026-06-19 contract anticipated an external app):
- **Native (recommended now we're in-app):** drive `estimation_approvals` + `estimation_approval_steps` directly from the app (manager→mgmt→clevel→ceo), `sync_estimate_status_from_approval` trigger updates `estimates.status`. No cross-app RPC. `estimation_approval_rules` only needed if using `submit_estimation_approval` for routing — otherwise the app sets steps.
- **Writeback (for a separate ECS app):** keep approval external and call `record_external_estimation_decision` (migration `20260619100000`) with a service account.

Since we are building **inside** `compass-golden-path`, the native path is simpler and avoids the service-account/RPC machinery. See §5 Q2.

---

## 4. Build plan (phased; each writes only after go-ahead)

| Phase | Work | Verify |
|---|---|---|
| 0 | Calc parity spec: confirm C1–C6 against Excel; write `estimateCalc.test.ts` with known values (license 1,032; telecom lic 12,000; MRC 3BB 1×1000; routing 56.9%→Director/25%→C-Level/15%→CEO; install/PMCM no double-count) | tests fail first, then pass |
| 1 | Patch `estimateCalc.ts` to close C1–C5; wire marketing rate from `presales_service_types`; add NPV inputs | parity tests green |
| 2 | Seed `estimate_items` (6,221) + verify line-table item search; pick FX source | catalog searchable; counts match |
| 3 | Add Tab 2 Service Detail (scope lines) + Excel paste | scope renders in PDF |
| 4 | PDF fidelity pass vs standalone (header, 3 tables, signatures from `presale_db_sales`/`_presales`, financial 11-line breakdown) | side-by-side match |
| 5 | Approval (native): wire steps/decisions + thread + audit log; (optional) seed rules | submit→approve→status sync round-trip |
| 6 | UI fidelity pass per Q1; responsive + i18n (th/en) | visual diff vs standalone |
| 7 | E2E parity: build a known deal in both apps, diff every total; retire the iframe `EstimatedCostDashboardFrame` | totals match to the sath |

All app changes go through Lovable's agent (`send_message`); DB seeds via migration/SQL — both are **writes**, gated on approval. Use `plan_mode` on Lovable for each phase before it writes code.

---

## 5. Decisions to confirm before building
1. **UI fidelity** — keep the current clean shadcn look, or re-skin to the standalone "Standard Theme V2" (red) exactly?
2. **Approval model** — native in-app (recommended) or external writeback RPC?
3. **Calc base nuances (C1/C2)** — confirm OPR interest base (cost vs sale) and bonds VAT base; I will otherwise match the Excel workbook exactly and surface diffs via tests.
4. **Seed scope** — seed `estimate_items` (6,221) now? Seed `estimation_approval_rules`?
5. **Go-ahead to write** — first write would be Phase 0/1 (calc tests + patch) via Lovable.

---

*Source of truth for the schema: live Compass DB (read-only). Source of truth for calc semantics: the Excel workbook + project memory. This plan touches code/data only after sign-off.*
