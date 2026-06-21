# ADR-001: Migrate Estimated Cost Sheet to Lovable on the Compass schema

**Status:** Revised after live Compass DB access (2026-06-21) — see Addendum at top; DB-target decision changed
**Date:** 2026-06-21
**Deciders:** Asst. Director (Technical Presales) · SA Specialist · DevOps Specialist
**Supersedes:** standalone single-file architecture (`index.html`) + standalone `estimated-cost-db` schema

---

## Addendum (2026-06-21) — live Compass DB accessed; direction revised

Read-only access to the real Compass DB (SELECT-only via the Lovable project) updated two things below.

**Compass is already a Lovable app.** Project `compass-golden-path` / "Sales Compass Foundation" (workspace `ZUb4L8UevLHL0KQU8xHz`, https://compass-golden-path.lovable.app), DB = Supabase `lzuxhvpdruaiacfhaqqh` (108 tables, 11,100 organizations, 89 profiles, live). The ECS schema already exists and aligns almost 1:1 with the current app.

**Revised decision (supersedes §2/§3 Option B):** do **not** create a new Supabase or author a new schema. **Build the ECS module into the existing `compass-golden-path` app, against the existing Compass DB.** This is the original "connect to existing Compass" intent — now confirmed reachable (read-only) via the Lovable connection.

**State of the ECS module (row counts):** `estimates` 7 · `estimate_lines` **0** · `estimation_approvals` **0** · `estimation_approval_rules` **0** · `estimate_items` **0** · `presales_service_types` 18 · `presale_db_service_types` 17 · `presale_db_overhead` 8 · `presale_db_exchange_rates` 8 · `presale_db_sales` 24 · `presale_db_presales` 24. → Only a header-capture stub exists; detailed lines, calc, approval workflow, and item catalog are not built/seeded yet.

**Verified mapping — `estimates` (header):**
| Standalone | `estimates` column |
|---|---|
| custName / projectName | `customer_name` / `project_name` |
| salePerson / preSales | `sale_name` / `presales_name` |
| projectType (+2nd) | `project_type` / `project_type2` |
| paymentType / serviceType | `payment_terms` / `service_type` |
| globalContractTerm / credit | `contract_term_months` / `credit_term_days` |
| FX usd / cny | `usd_rate` / `cny_rate` |
| overhead radio | `overhead_type` (def `normal_5`) |
| chkTelecomLicense | `telecom_license_enabled` |
| OPR bonds (8/9) | `bid_bond_enabled` / `bid_bond_months` / `performance_bond_enabled` |
| other expense toggle | `other_costs_enabled` |
| __projectValue | `project_value_thb` |
| summary OTC / MRC / TCV | `total_otc` / `total_mrc` / `total_tcv` |
| GP% / NP% / payback / NPV | `gp_pct` / `np_pct` / `payback_months` / `npv_thb` |
| est_no | `estimate_no` (+ `estimate_no_seq.year_month/last_seq`) |
| status (draft/…) | `status` enum `estimate_status` [draft, submitted, approved, rejected] |
| created_by / deal link | `created_by` (=`auth.uid()`) / `deal_id` (**nullable** — §6.5 resolved) |

**Verified mapping — `estimate_lines` (all rows; discriminated by `line_type`):**
| Standalone rows | `line_type` | Key columns |
|---|---|---|
| investmentRows (CAPEX) | `otc` | `supplier`←vendor, `item_code`←code, `item_description`←desc, `quantity`←unit, `unit_price_msrp`←MSRP, `cost_price`←costPerUnit, `sell_price`←salePerUnit, `discount_pct`, `currency`/`fx_rate`, `amount_thb` |
| MRC rows | `mrc` | as above; `cost_price`←costPerMonth, `sell_price`←salePerMonth; `credit_term_days`, `warranty_years`, `lead_time_days` |
| Install detail (Tab 6) | `install` | supplier / desc / qty / cost / sell |
| PMCM detail (Tab 6) | `pmcm` | supplier / desc / qty / cost / sell |
| OPR-100001…100013 | `opex` | `opex_code`←OPR code, `item_description`←OPR label, `amount_thb`←computed |

**Verified — catalog & approvals:** `estimate_items` (`item_code` PK, `description`, `uom`, `unit_price`, `promotion_price`, `vat_included`, `blocked`) ← standalone `item`. Approvals: `estimation_approvals` (header + snapshot: `margin`, `project_value`, `payback_months`, `contract_months`, `ecd_department`, `service_type`, `current_step_index`, `status`) + `estimation_approval_steps` (`step_index`, `level` [manager/mgmt/clevel/ceo], `approver_id`, `status` [pending/verified/approved/returned/skipped], `return_to_level`, `signed_at`) + `estimation_approval_rules` (data-driven routing by `ecd_department` × `min/max_margin` × `min/max_value` × `max_payback_months`) + `estimation_audit_log` (`event_type`, `by_id`, `by_level`, `details` jsonb). Signatures/people: `presale_db_sales` (sale/head/c_level + signatures), `presale_db_presales`. Rates/refs: `presales_service_types` (`rate_marketing`, `rate_appv_l1/l2`, `presale_head`, `signer`), `presale_db_overhead` (`label`, `percent_oh`), `presale_db_exchange_rates` (`start_date`/`finish_date`/`usd`/`cny`).

**Revised gaps / action items:**
- Seed `estimate_items` from standalone `item` (6,221 rows) — catalog currently empty.
- Seed `estimation_approval_rules` (routing bands) + confirm `ecd_department_map` coverage — currently empty.
- Reconcile FX ranges: `presale_db_exchange_rates` has 8; standalone Excel had 9.
- Decide snapshot strategy: `estimates` has structured totals + `notes`; optionally add `calc_snapshot jsonb` for byte-exact PDF/quote reproduction (a schema *addition*, needs write approval) — else reproduce from `estimate_lines` + totals.
- Review the existing "Estimate Cost" UI already in the app → enhance vs rebuild to full 9-tab parity.
- All of the above are **writes** (code, seeds, migration) — gated on your go-ahead; nothing written yet.

*The original proposal below remains valid as background. The DB-target decision (§2/§3) is replaced by this Addendum; §4 mappings are now confirmed against the live schema above; §6.5 `deal_id` concern is resolved (already nullable).*

---

## 1. Context

**Current system** — `C:\GitHub\estimated-cost-sheet`
- One file: `index.html` (~5,200 lines) — vanilla HTML + CSS + JS, no framework, no build step.
- Design system: **"Standard Theme V2"** (CSS variables, CSS-grid rows `.data-row` / `.opr-row`, primary red). The project's own rules say *do not use Tailwind*.
- 9 interconnected tabs (Header → Service → Investment → Operation/OPR → Monthly/MRC+NPV → Install/PMCM → Summary+PDF → Approval → Quotation).
- A tightly-coupled calc engine: `recalcAll()` → `updateInstallPmcmKpi → updateOprTotal → recalcSummary → recalcNPV`, driven by global mutable arrays and DOM `id`s. Semantics are derived from the Excel "(Rev.2.4.7) Feasibility 1toAll (Draft).xlsx" and **must be preserved exactly**.
- Backend: Supabase project `estimated-cost-db` (`qdwhkfhwlcnuhghdfgga`) — an **18-table standalone schema** (`item`, `customer`, `quotation`, `quotation_line`, `est_document`, `app_user`, `approval_request`, `approval_log`, `fx_rate`, `service_type`, `sale_team`, `install_pmcm_standard`, `mrc_catalog`, …). Auth + RLS + a client-side `DbWrite` module are live.

**Goal** — migrate to **Lovable** (React + TypeScript + Tailwind + shadcn/ui, Supabase) so that:
1. The web UX/UI stays the same.
2. The code is rewritten to Lovable conventions (component-based React, not single-file vanilla).
3. The data model follows `compass_full_erd.html` — the **Compass CRM** ERD (~100 tables, 9 domains).

**Where the Estimated Cost Sheet lives in Compass** — the `presales` domain:
`estimates` · `estimate_lines` · `estimate_items` · `estimate_no_seq` · `estimation_approvals` · `estimation_approval_steps` · `estimation_approval_rules` · `estimation_audit_log` · `presales_service_types` · `presale_db_exchange_rates` / `_overhead` / `_presales` / `_sales` / `_service_types` · `ecd_department_map` — plus `organizations`, `profiles`, `products`, `payment_terms`, `exchange_rates` (core) and `quotations` / `quotation_lines` (quote).

### Critical finding (verified 2026-06-21)
The user's Supabase account contains **only** `estimated-cost-db` and an inactive `RoomDB`. **The Compass schema is not deployed in this account.** The ERD's row counts (`organizations` 11,095, `profiles` 88) describe a *real Compass CRM that lives elsewhere*. Therefore "connect Lovable directly to the existing Compass DB" is **not currently possible** — the Compass (presales-subset) schema must be **deployed into a Supabase project** as part of this migration, designed to stay FK-compatible so it can later merge with / connect to the full Compass CRM.

### Forces
- Calc fidelity is non-negotiable (COO-facing financials, Excel parity).
- UI must look the same ("เหมือนเดิม").
- Compass alignment is required now, but the real Compass DB isn't reachable yet.
- The current calc engine is DOM-coupled and not directly portable; it must be re-expressed as pure functions.

---

## 2. Decision (proposed)

Rebuild the **Estimated Cost Sheet module only** as a Lovable React/TS app:

1. **Data model** — author a **Compass-aligned presales-subset schema** (same table names, `uuid` PKs, same FK targets and `ON DELETE` rules as the ERD) and deploy it to a **Supabase project managed by Lovable**. It is forward-compatible: when the real Compass DB becomes reachable, migration is a *connection swap + data backfill*, not a redesign.
2. **Persistence** — write **normalized** `estimate_lines` (for CRM reporting) **and** keep a **calc snapshot (`jsonb`)** on the estimate row, so the PDF / quotation reproduce byte-exact figures regardless of schema drift. (Hybrid — see §5.4.)
3. **Calc engine** — port `recalcAll` and all formulas into a **pure, unit-tested `calc/` TypeScript module**. This is the parity guarantee. UI components read derived values from a single typed store.
4. **UI** — reproduce Standard Theme V2 by porting its CSS variables into Tailwind theme tokens; build with shadcn/ui components skinned to V2 (not default shadcn look).
5. **Delivery** — phased (§7). Plan/ADR reviewed and signed off **before** any scaffold.

---

## 3. Decision point that needs sign-off: the target database

Because Compass is not in-account, this is the one fork that changes everything downstream.

### Option A — Connect to the existing Compass CRM Supabase
| Dimension | Assessment |
|---|---|
| Complexity | Low *if reachable* |
| Cost | None extra |
| Compass alignment | Perfect (it *is* Compass) |
| Feasibility now | **Blocked** — not in this account; no credentials |

**Pros:** zero schema work; shares real customers/users.
**Cons:** not currently possible; writing the ECS module straight against the production CRM is also riskier for a first cut.

### Option B — New Lovable-managed Supabase, Compass-aligned subset *(recommended)*
| Dimension | Assessment |
|---|---|
| Complexity | Medium (author + deploy subset DDL) |
| Cost | Free tier / nano |
| Compass alignment | High — identical names/keys, FK-compatible |
| Feasibility now | **Yes** |

**Pros:** clean start; Lovable wires it automatically; safe to iterate; later merges into real Compass via matching PKs + `crm_ref`.
**Cons:** temporary second DB; master data must be seeded.

### Option C — Migrate the existing `estimated-cost-db` to the Compass schema
| Dimension | Assessment |
|---|---|
| Complexity | High (rename/restructure 18 tables → Compass) |
| Cost | None extra |
| Compass alignment | High after rework |
| Feasibility now | Yes, but invasive |

**Pros:** keeps the 7 est_documents / 92 quotation_lines already there; one DB.
**Cons:** destructive rewrite of a live schema; the standalone transaction rows are mostly test data anyway (greenfield was chosen).

**Recommendation: Option B**, with the schema authored to mirror Compass exactly so Option A becomes a future connection swap. Master/reference data (item 6,221 · fx 9 · service types · sale teams · install/pmcm · mrc) is seeded from `estimated-cost-db`.

---

## 4. Current → Compass feature & data mapping

### 4.1 Tab inventory (UX to preserve)
| Tab | Name | Core content | Calc role |
|---|---|---|---|
| 1 | Header | customer, project, type, payment, service, sale group, sale/presale, contract term | inputs / drivers |
| 2 | Service | service detail bullet lines (`serviceLines`), overhead %, marketing % | drives OPR % + quotation scope |
| 3 | Investment | CAPEX rows (`investmentRows`: vendor, code, desc, unit, cost/unit, sale/unit) | investment cost/sale base |
| 4 | Operation (OPR) | OPR-100001…100013 (install/pmcm auto, spare, interest, bonds, marketing, license, entertainment, overhead) | operation cost |
| 5 | Monthly (MRC) + NPV | recurring rows (`mrc`: unit, cost/mo, sale/mo) + NPV calculator (term/credit/discount) | recurring + NPV |
| 6 | Install/PMCM | install + PMCM detail → feeds OPR-100001 / 100005 | feeds OPR (no double count) |
| 7 | Summary | KPI grid, Estimated Cost Sheet **PDF**, approval routing/decision matrix | derived totals + routing |
| 8 | Approval | pipeline, thread, decisions | approval workflow |
| 9 | Quotation | convert → quotation, print, list | commercial output |

### 4.2 Table mapping (standalone → Compass)
| Standalone (now) | Compass (target) | Notes |
|---|---|---|
| `est_document` | `estimates` (+ snapshot of routing in `estimation_approvals`) | header + totals; `estimates.deal_id` FK — see §6.5 (deal optional for now) |
| investment / MRC / install / PMCM / OPR rows | `estimate_lines` | one table, discriminated by a `line_kind` (investment \| mrc \| install \| pmcm \| opr); `estimate_lines` has 23 cols — confirm names from DDL |
| `item` (6,221) | `estimate_items` (PK `item_code`) and/or `products` | presales catalog = `estimate_items`; CRM product = `products` |
| `customer` | `organizations` | customer identity; keep `crm_ref` / matching id for sync |
| `app_user` (15) | `profiles` | `profiles.id` = `auth.users.id`; role + `est_department` (→ `ecd_department_map`) |
| `approval_request` | `estimation_approvals` | approval header + snapshot (margin, required level) |
| `approval_log` | `estimation_approval_steps` + `estimation_audit_log` | per-step + immutable audit |
| routing rules (in-app) | `estimation_approval_rules` (by `ecd_department`) | move routing thresholds into data |
| `quotation` / `quotation_line` | `quotations` / `quotation_lines` | quote domain; `account_id` → organizations |
| `fx_rate` (9) | `exchange_rates` / `presale_db_exchange_rates` | presales-scoped rates in `presale_db_exchange_rates` |
| `service_type` (17) | `presales_service_types` / `presale_db_service_types` | service config + thresholds |
| `sale_team` (8) | `sales_teams` + `ecd_department_map` | team + ECD routing map |
| `overhead_type` / `other_expense_type` / `project_type` / `payment_type` | `presale_db_overhead` / `deal_lookups` / `payment_terms` | reference/lookup |
| `install_pmcm_standard` (14) / `mrc_catalog` (20) | seed into `estimate_items` (typed) or dedicated reference | presets for tabs 5/6 |
| `est_no` (localStorage) | `estimate_no_seq` (PK `year_month`) | server-side running number |

### 4.3 est_document fields (confirmed in code) → estimates
`est_no` → `estimates.estimate_no` · `customer (customer_no)` → `account_id`(org) · `service_code` → service type FK · `sale_team` → team FK · `project_value` → snapshot/derived · `net_profit` → snapshot · `net_margin_pct` → snapshot · `required_level` (director\|clevel\|ceo) → `estimation_approvals` · `status` (draft/pending/approved/rejected/converted/cancelled) → `estimates.status` · `payload` (jsonb whole form) → **calc snapshot jsonb** (§5.4) · `created_by` → `profiles` · `quote_no` → link to `quotations`.

### 4.4 Known gap
The ERD encodes table names, FK columns, and column **counts** — not every non-FK column name (e.g. `estimates` has 37 cols / 35 non-FK; `estimate_lines` 23 / 21). **Exact non-FK column names must be confirmed from the Compass DDL** (or authorized to be authored from the ERD + the standalone field list). Flagged in Action Items.

---

## 5. Target architecture (Lovable)

### 5.1 Stack
React 18 + TypeScript + Vite · Tailwind CSS + shadcn/ui · Supabase (Postgres + Auth + RLS + generated types). Lovable default stack — no selector needed.

### 5.2 Structure
```
src/
  features/estimate/
    tabs/            Tab1Header … Tab9Quotation (one component per tab)
    components/      DataRow, OprRow, KpiGrid, MoneyInput …
    state/           estimateStore.ts (Zustand) — header, lines, opr, fx, npv
    calc/            calc.ts (pure) + calc.test.ts (parity tests)
    pdf/             EstCostSheet.tsx, Quotation.tsx (print views)
  lib/supabase/      client.ts, queries.ts (estimates, lines, approvals, quotations)
  lib/format/        fmtNum/parseNum (comma formatting, inputmode=decimal)
  types/             supabase.ts (generated)
  theme/             tokens from Standard Theme V2 → tailwind.config
```

### 5.3 Calc engine (the crux)
The vanilla `recalcAll` pipeline becomes **pure functions** in `calc/`: given `{header, investmentRows, mrcRows, install, pmcm, oprInputs, fx, npvParams}` they return `{investmentTotals, oprTotals, summary, npv, routing}`. The Zustand store holds inputs; a selector runs `calc()` and feeds every tab. No DOM ids in the calc layer. This preserves Excel semantics *and* makes them unit-testable.

**Parity tests** seed known values already documented in project memory, e.g. license `1,032.00`; telecom-deal license `12,000`; per-month MRC `3BB 1×1000=1000` (not ×term); routing bands 56.9%→Director / 25%→C-Level / 15%→CEO; OPR base = investment sale; install/PMCM not double-counted. Green tests = parity.

### 5.4 Persistence model — hybrid
- **Normalized:** `estimates` (header + status) + `estimate_lines` (every row) → enables CRM reporting/joins.
- **Snapshot:** a `calc_snapshot jsonb` (the current `payload`/`buildDraftState`) stored on the estimate → guarantees the PDF and quotation reproduce exact figures even if normalization or rounding ever drifts. Load path prefers normalized; PDF path can use snapshot. This mirrors today's `payload` jsonb so nothing is lost in translation.

### 5.5 Theming / fidelity
Port Standard Theme V2 variables (`--primary`, `--border`, `--success-*`, red header `#e8332e`, etc.) into `tailwind.config` tokens; build `DataRow`/`OprRow` as CSS-grid components matching the existing `grid-template-columns`. Use shadcn for dialogs/inputs/toasts but skinned to V2. Reference screenshots of the current app are the acceptance bar. (We intentionally override shadcn defaults to avoid an off-brand look.)

### 5.6 Auth & RLS
Supabase Auth + `profiles` (role: presale/sale/clevel/ceo; `c_level_role` COO/CPO/COS; `est_department`). RLS deny-by-default with `SECURITY DEFINER` helpers (`app_role()`, `app_user_id()`) — same bootstrap-safe pattern proven in the standalone (transaction tables closed until `auth_uid` linked). Master/reference tables = authenticated read.

---

## 6. Trade-off analysis

1. **Snapshot jsonb vs full normalization** → **hybrid.** Snapshot buys fidelity immediately; normalized lines buy reporting. Cost: write both on save.
2. **Zustand vs Redux vs Context+reducer** → **Zustand.** Single-document store, minimal boilerplate, easy selectors for the calc pipeline.
3. **New Supabase (B) vs reuse (C)** → **B.** Clean Compass alignment now; data continuity wasn't required (greenfield chosen).
4. **Faithful V2 theme vs shadcn default** → **faithful.** User requirement is "same UI"; we accept extra theming work.
5. **`deal_id` dependency** → in Compass, `estimates.deal_id` → `deals (CASCADE)`. Standalone has no deal. For ECS-only scope, make the estimate→deal link **optional/nullable** (or auto-create a lightweight deal) until the sales domain is in scope. Confirm in Action Items.

---

## 7. Phasing plan

| Phase | Deliverable | Verify |
|---|---|---|
| 0 | Compass presales-subset DDL authored (FK-compatible) + deployed to Supabase + TS types generated + master data seeded (item/fx/service/team/install-pmcm/mrc) | `list_tables` shows Compass names; seed counts match (item 6,221 / fx 9) |
| 1 | Lovable app scaffold + V2 theme tokens + 9-tab shell + Supabase client + Auth gate | app loads, login works, tabs render empty |
| 2 | `calc/` pure port + parity unit tests | all known-value tests green |
| 3 | Tabs 1–6 wired to store (Header, Service, Investment, OPR, MRC+NPV, Install/PMCM) | live recalc matches vanilla app on sample deal |
| 4 | Tab 7 Summary + Est Cost Sheet PDF; Tab 8 Approval (routing + steps); Tab 9 Quotation (+print) | PDF/quote byte-match vanilla output |
| 5 | Persistence (estimates/estimate_lines + snapshot), multi-doc New/Load, autosave, RLS, two-way approval sync | round-trip a full estimate; RLS denies anon |
| 6 | Parity E2E, optional data migration, go-live hardening (reset passwords, email confirm) | sign-off vs Excel + current app |

---

## 8. Consequences

**Easier:** future CRM integration (shared Compass schema), maintainability (typed + modular + tested calc), multi-user, server-side numbering/approval routing.
**Harder:** ~5,200 lines of intricate calc must be re-ported and parity-tested; two databases exist temporarily; theme fidelity needs deliberate effort.
**Revisit later:** connect to real Compass DB (swap + backfill); FX-based item pricing (current Phase 2.6); commission / lead / project / activity domains; CRM sync of customers via `crm_ref`.

---

## 9. Risks & mitigations
- **Calc parity regressions** → port memory's known-value cases as unit tests; diff against vanilla app per tab.
- **Unknown Compass non-FK columns** → confirm DDL before finalizing Phase 0; until then design against ERD + standalone fields.
- **Lovable agent drifting from V2 look** → lock theme tokens, supply reference screenshots, review each tab's diff.
- **RLS lockout / Auth bootstrap** → reuse proven deny-by-default + `app_role()` pattern; link `auth_uid` last.
- **`est_no` semantics** → move to `estimate_no_seq` (server) but keep `EST-YYYYMM-NNNN` format users expect.
- **deal_id NOT NULL/CASCADE** → make optional for ECS-only scope (§6.5).

---

## 10. Action items
1. [ ] **Confirm DB target** — Option B recommended (new Lovable Supabase, Compass-aligned).
2. [ ] **Compass DDL** — provide the real presales+core DDL, *or* authorize authoring FK-compatible DDL from the ERD + standalone field list.
3. [ ] **Approve `deal_id` = optional** for ECS-only scope.
4. [ ] **Approve phasing** (§7) and Phase 0 start.
5. [ ] **Authorize Lovable project** creation in the workspace.
6. [ ] **Confirm theme-fidelity** acceptance bar (screenshots of current app).
7. [ ] (If real Compass access exists) share project ref so we design straight against it.

---

*Once §10 items 1–5 are confirmed, Phase 0 (schema) and Phase 1 (scaffold) can begin in the same working session.*
