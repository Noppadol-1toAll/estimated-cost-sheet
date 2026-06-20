# CRM Integration Plan — Single Source of Truth (Sale Compass)

> เป้าหมาย: ให้ Estimated Cost Sheet ใช้ฐานข้อมูล **CRM "Sale Compass Foundation"** เป็นแหล่งเดียว
> ไม่มีข้อมูล 2 แหล่ง · Customer/Organization ยึด CRM เป็นหลัก
>
> Supabase ref: `lzuxhvpdruaiacfhaqqh` · Lovable: `compass-golden-path`
> (`d0345f53-5e8c-48da-b90d-97eb076cfc15`, workspace *vasavas's Lovable*)

---

## 0. ข้อสรุปหลัก (TL;DR)

1. **อย่า deploy `db/*.sql`** ลง Supabase ตัวนี้ — ทุกตารางในนั้นมีของจริงใน CRM อยู่แล้ว (ออกแบบดีกว่า/ข้อมูลจริงครบ) การ deploy = สร้าง schema ขนานซ้ำ ผิดเป้าหมาย "แหล่งเดียว"
2. **Customer = `organizations`** (ไม่ใช่ `accounts`, ไม่ใช่ folder `customer`). `accounts` เป็น mirror เก่า ไม่มี FK ชี้เข้า — ห้ามเขียน/ห้ามอ้าง
3. แอปนี้ทำหน้าที่เป็น **"ตัวกรอก estimate"** ของ CRM: **อ่าน** master/customer จาก CRM, **เขียน** เฉพาะ `estimates` + `estimate_lines` (+ approval) ซึ่งตอนนี้ **ว่างเปล่า** (greenfield)
4. identifier ภายในใช้ **CRM uuid** เป็นหลัก ส่วนเลขเอกสาร `estimate_no` ออกผ่าน `estimate_no_seq` ของ CRM (ห้ามออกเลขเองที่ฝั่ง client)

---

## 1. Customer / Organization — ของซ้ำ ยึด CRM

| ประเด็น | คำตัดสิน |
|---|---|
| Canonical customer table | **`organizations`** (11,095 แถว) |
| `accounts` | โครงสร้าง+จำนวนแถวเหมือน `organizations` เป๊ะ แต่ **ไม่มี inbound FK** → legacy mirror. **อย่าใช้** |
| คอลัมน์ที่ชื่อ `account_id` ใน `quotations`/`estimation_approvals`/`projects`/`presales_tasks` | FK จริงไปที่ **`organizations`** (ชื่อหลอก) |
| ผู้ติดต่อ | `contacts` (FK `organization_id` → organizations) — ตอนนี้ 0 แถว |

**ฟิลด์ลูกค้าที่แอปต้องใช้ → อ่านจาก `organizations`:**
`id` (uuid, ใช้เป็น FK), `name`, `tax_id`, `branch_code`, `branch_name`, `billing_address`,
`email`, `phone`, `customer_code`, `customer_prefix`, `payment_terms_code`

➡️ ใน cost sheet **ห้ามเก็บชื่อ/เลขภาษีลูกค้าเป็น master ของตัวเอง** ให้เก็บแค่ `organization_id` (uuid) แล้ว join เอา
(field `estimates.customer_name` ที่เป็น text ให้ถือเป็น **snapshot ตอนสร้างเอกสาร** เท่านั้น ไม่ใช่ master)

---

## 2. Mapping: db/*.sql (เดิม) → CRM (ของจริง)

### Reference / Master data → **READ-ONLY จาก CRM**

| folder `db/*.sql` | CRM table | หมายเหตุ field |
|---|---|---|
| `fx_rate` | **`presale_db_exchange_rates`** | `start_date/finish_date/usd/cny` (มี `exchange_rates` อีกตัวแบบ per-currency ด้วย) |
| `overhead_type` | **`presale_db_overhead`** | `label`, `percent_oh` |
| `service_type` (mkt_rate, appv_l1/l2, head) | **`presale_db_service_types`** | `service_type, heading, designation, rate_mkt, appv_l1, appv_l2` |
| `staff` (presale) | **`presale_db_presales`** | `presale_name, presale_signature` |
| `staff` (sale) + `sale_team` routing | **`presale_db_sales`** | `sale_name, signature, sale_team, head_of_sales, head_signature, c_level, c_level_signature` |
| `item` | **`estimate_items`** (item master) + **`products`** (3,032 SKU) | `estimate_items`: item_code/description/uom/unit_price/promotion_price/vat_included/blocked |
| `payment_type` | **`payment_terms`** | `code, label_en, label_th, credit_days, is_default` |
| `project_type` | enum/text ใน `estimates.project_type` / `project_type2` | ไม่ต้องมีตารางแยก |
| `install_pmcm_standard`, `mrc_catalog`, `other_expense_type` | ใช้เป็น `estimate_lines` ที่ `line_type in (install,pmcm,mrc,opex)` | ดูข้อ 3 |

### Transaction → **WRITE ลง CRM (ตารางว่าง = greenfield)**

| folder `db/*.sql` | CRM table | สถานะ |
|---|---|---|
| `customer` | `organizations` | 11,095 แถว (อ่าน) |
| `est_document` | **`estimates`** | 0 แถว |
| (line items ทุกแท็บ) | **`estimate_lines`** | 0 แถว |
| `quotation` / `quotation_line` | `quotations` / `quotation_lines` | 1 แถว |
| `app_user` | `profiles` (Supabase Auth) + `presale_db_*` สำหรับชื่อ/ลายเซ็น | — |
| `approval_request` | **`estimation_approvals`** | 0 แถว |
| `approval_log` | **`estimation_approval_steps`** + `estimation_audit_log` | 0 แถว |
| service_type thresholds (appv_l1/l2) | **`estimation_approval_rules`** (margin/value/payback × ecd_department) | engine จริง |

---

## 3. Field mapping: cost sheet tabs → `estimates` / `estimate_lines`

**Header / Summary (1 แถวต่อใบ) → `estimates`:**
`deal_id` (→ deals), `organization_id` ผ่าน deal/approval, `revision_no`, `estimate_no`, `estimate_date`,
`project_name`, `sale_name`, `presales_name`, `project_type`/`project_type2`, `payment_terms`,
`service_type`, `contract_term_months`, `budget_thb`, `usd_rate`, `cny_rate`, `overhead_type`,
`bid_bond_enabled/months`, `performance_bond_enabled`, `other_costs_enabled`, `telecom_license_enabled`,
**ผลลัพธ์คำนวณ:** `total_otc`, `total_mrc`, `total_tcv`, `gp_pct`, `np_pct`, `payback_months`, `npv_thb`, `project_value_thb`

**ทุกบรรทัดของทุกแท็บ → `estimate_lines` (แยกด้วย `line_type`):**

| แท็บในแอป | `estimate_lines.line_type` |
|---|---|
| Investment (CAPEX) | `otc` |
| Monthly (MRC/NPV) | `mrc` |
| Operation (OPEX) | `opex` |
| Install | `install` |
| PMCM | `pmcm` |

field ต่อบรรทัด: `seq, category, supplier, item_code, item_description, unit, quantity,
unit_price_msrp, discount_pct, cost_price, sell_price, currency, fx_rate, amount_thb, remark,
warranty_years, lead_time_days, credit_term_days, opex_code`

**Enum ที่ต้องใช้ให้ตรง:**
- `estimate_status`: `draft | submitted | approved | rejected`
- `estimate_line_type`: `otc | mrc | opex | install | pmcm`
- `est_approval_level`: `manager | mgmt | clevel | ceo`
- `est_approval_status`: `draft | pending | returned | rejected | approved | acknowledged`
- `est_step_status`: `pending | verified | approved | returned | skipped`

---

## 4. Best Practices สำหรับ Table/Field อื่นๆ

1. **อ่านผ่าน View ถ้ามี** — ใช้ `v_organizations_with_deal_counts`, `v_deal_enriched` ฯลฯ แทน join เองเมื่อทำได้ ลดการผูกกับโครงสร้างดิบ
2. **FK ด้วย uuid เสมอ ไม่ใช่ชื่อ/โค้ด** — เก็บ `organization_id`, `deal_id`, `estimate_id` แล้ว join เอาชื่อ ห้าม denormalize ชื่อเป็น master (กันข้อมูล 2 แหล่ง). ที่เป็น `*_name` ใน `estimates` ให้ถือเป็น snapshot อย่างเดียว
3. **เลขเอกสารออกฝั่ง DB** — `estimate_no` ผ่าน `estimate_no_seq`, quote ผ่าน `quote_number_sequences` (ทำใน edge function/RPC) ห้าม generate ที่ client เพื่อกัน race/เลขชน
4. **ฟิลด์ที่แอปมีแต่ CRM ไม่มี** → อย่าสร้างตาราง master ขนาน เลือกตามลำดับ:
   (a) ใส่ใน field ข้อความที่มีอยู่ (`estimates.notes`, `estimate_lines.remark`),
   (b) ถ้าจำเป็นต้องเก็บ snapshot ฟอร์มทั้งใบเพื่อ reproduce ให้คุยกับเจ้าของ CRM เพิ่ม 1 คอลัมน์ `jsonb` (เช่น `estimates.app_payload`),
   (c) ถ้าเป็น dimension ใหม่จริงๆ ให้ **ขอเพิ่มใน CRM ผ่าน Lovable agent** ไม่ใช่สร้างที่อื่น
5. **DDL ทุกอย่างผ่านเจ้าของ CRM (Lovable agent)** — เรามีแค่ anon key, รัน migration ไม่ได้ และไม่ควรแก้ schema ที่ทีมอื่นใช้ร่วมโดยตรง
6. **RLS / Auth** — เขียน estimate ต้อง login ผ่าน Supabase Auth (`profiles`/`auth.uid()`) ไม่ใช่ anon. master/customer อ่านได้ตาม policy ที่ CRM ตั้งไว้แล้ว
7. **localStorage → CRM** — คงไว้เป็น offline draft/auto-save ได้ แต่ "source of truth" คือ row ใน `estimates`. ใช้ `revision_no` ทำ versioning แทนการเก็บหลายไฟล์
8. **อย่าแตะ `accounts` / `stg_organizations_import`** — mirror/staging ของ pipeline import ฝั่ง CRM

---

## 5. ลำดับงานที่แนะนำ (เมื่อพร้อมลงมือ)

1. เพิ่ม supabase-js (CDN) + `organization_id`/`deal_id` selector ใน Header tab (อ่าน `organizations`, `deals`)
2. โหลด reference จาก `presale_db_*` แทนค่า hardcode ในแอป
3. map ปุ่ม Save → upsert `estimates` + replace `estimate_lines` (ตาม `estimate_id` + `revision_no`)
4. ต่อ Approval → `estimation_approvals` (+ rules engine) ภายหลัง
5. `db/*.sql` + `seed.sql` → เก็บเป็น reference ของ data model เดิมเท่านั้น (ไม่ deploy)
