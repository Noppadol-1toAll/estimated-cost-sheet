# Integration Execution Plan — Estimated Cost Sheet → CRM Sale Compass

> SA execution plan สำหรับเชื่อมแอปเข้ากับฐานข้อมูล CRM เป็น **แหล่งเดียว**
> อ่านคู่กับ [`CRM_INTEGRATION.md`](CRM_INTEGRATION.md) (field-level mapping)
> Supabase ref `lzuxhvpdruaiacfhaqqh` · Lovable `compass-golden-path`

## ข้อเท็จจริงที่กำหนดรูปแบบแผน (verified)

- **ทุกตารางเปิดให้เฉพาะ role `authenticated` — ไม่มี anon policy** ⇒ anon key อ่าน/เขียนไม่ได้ → **ต้อง login เป็นเฟสแรก**
- `estimates.created_by` = `auth.uid()` NOT NULL ⇒ เขียนได้เฉพาะผู้ใช้ที่ login
- **Business logic อยู่ใน DB เป็น RPC แล้ว** — ใช้ผ่าน `supabase.rpc(...)` อย่าเขียนซ้ำ:
  `assign_estimate_no` / `next_estimate_no`, `compute_estimate_approval_level(service_type, np_pct)`,
  `submit_estimation_approval(estimate_id)`, `acknowledge/reject/return_estimation_approval`,
  `sync_estimate_status_from_approval`, `duplicate_estimate(id)`, `next_quote_number`,
  `submit_quotation_for_approval`, `recalc_quotation_totals`
- `organizations` read = "All authenticated view accounts" (ทุก user ที่ login อ่านได้ ✅)
- ⚠️ `presale_db_service_types` read = **managers/admins เท่านั้น** (presale/sale ทั่วไปอาจอ่านไม่ได้) → ต้องเคลียร์กับเจ้าของ CRM

---

## Phase 0 — Governance & Pre-requisites  *(blockers, งานประสาน ไม่ใช่โค้ด)*

| # | งาน | ผู้รับผิดชอบ | Output |
|---|---|---|---|
| 0.1 | ยืนยัน change process: **DDL/policy ทุกอย่างทำผ่าน Lovable agent ของ CRM** (เรามีแค่ anon key) | SA + เจ้าของ CRM | ข้อตกลงเป็นลายลักษณ์ |
| 0.2 | Provision ผู้ใช้แอป (presale/sale/clevel/ceo) ใน **Supabase Auth + `profiles`** ของ CRM | เจ้าของ CRM | บัญชีทดสอบ ≥1 ราย/role |
| 0.3 | Map role แอป (presale/sale/clevel/ceo) → `profiles.role` + `est_approval_level` (manager/mgmt/clevel/ceo) + `ecd_department` ใน `estimation_approval_rules` | SA | ตาราง role mapping |
| 0.4 | แก้ read policy ให้ผู้ใช้แอปอ่าน reference ได้: `presale_db_*` (โดยเฉพาะ service_types), `products`, `payment_terms`, `exchange_rates` | เจ้าของ CRM | policy `authenticated read` |
| 0.5 | Environment สำหรับทดสอบเขียน: ใช้ **Supabase branch** (dev) หรือ flag `is_demo_data`/estimate ทดสอบ แล้วค่อย merge | SA + CRM | dev branch / convention |
| 0.6 | Sign-off mapping ใน `CRM_INTEGRATION.md` | ทุกฝ่าย | อนุมัติ go |

**Gate:** ผ่านครบ → เริ่ม Phase 1 (ถ้า 0.2/0.4 ไม่ผ่าน Phase 2+ ทำไม่ได้)

---

## Phase 1 — Connectivity & Auth  *(foundation)*

1. เพิ่ม `@supabase/supabase-js@2` (CDN/esm.sh) + ไฟล์ config (url + anon key)
2. หน้า/โมดัล **Login (Supabase Auth)** กั้นก่อนโหลดข้อมูล + persist session (autoRefresh)
3. แสดงผู้ใช้ปัจจุบัน, ปุ่ม logout; ดึง `profiles` ของตนเอง (role/ชื่อ/ทีม)

**Acceptance:** login แล้ว `supabase.from('organizations').select('id').limit(1)` คืนแถวได้
**Rollback:** ไม่มี (เพิ่ม layer ใหม่ ไม่แตะ logic เดิม) — แอปยังเปิดแบบ localStorage ได้ถ้าปิด flag

---

## Phase 2 — Read integration (masters, low risk)

1. แทนค่า hardcode ด้วยการอ่านจาก CRM:
   - FX → `presale_db_exchange_rates` (หรือ `exchange_rates`)
   - Overhead → `presale_db_overhead` · Service/threshold → `presale_db_service_types`
   - Sale/Presale/ลายเซ็น → `presale_db_sales`, `presale_db_presales`
   - Payment terms → `payment_terms` · Item/product → `estimate_items` + `products`
2. **Customer/Deal picker** ใน Header: dropdown อ่าน `organizations` (+ค้น), แล้ว `deals` ของ org นั้น
3. เก็บ `organization_id` / `deal_id` (uuid) ในสถานะฟอร์ม (ยังไม่เขียน DB)

**Acceptance:** dropdown มาจาก CRM จริง, ค่า FX/overhead/rate มาจาก DB; ปิดการ hardcode
**Rollback:** fallback ค่า default เดิมถ้า query ล้ม (degrade ไม่ล่ม)

---

## Phase 3 — Write integration: estimates  *(core)*

1. ปุ่ม Save → **upsert `estimates`** (header/summary; `created_by` auto, `status='draft'`)
2. บรรทัดทุกแท็บ → **replace `estimate_lines`** ตาม `estimate_id`:
   Investment→`otc`, Monthly→`mrc`, Operation→`opex`, Install→`install`, PMCM→`pmcm`
   (กลยุทธ์: delete-by-estimate_id + bulk insert ใน transaction/RPC เดียว)
3. เลขเอกสาร: เรียก `rpc('assign_estimate_no')` ตอน submit (ห้าม gen ที่ client)
4. Versioning: `revision_no` / `rpc('duplicate_estimate', {p_id})` สำหรับแก้รอบใหม่
5. โหลดกลับ: เปิดเอกสารเดิม = อ่าน `estimates`+`estimate_lines` มาเติมฟอร์ม

**Acceptance:** สร้างใบ → refresh/อ่านจาก DB → ค่าตรงกับที่กรอก 100%; localStorage เหลือเป็น cache เท่านั้น
**Rollback:** ฟีเจอร์เขียนอยู่หลัง feature-flag; ปิด flag = กลับไป localStorage; ข้อมูลทดสอบลบด้วย estimate_id

---

## Phase 4 — Approval workflow

1. Submit → `rpc('submit_estimation_approval', {_estimate_id})`
2. สายอนุมัติคำนวณโดย `compute_estimate_approval_level` + `estimation_approval_rules` (margin/value/payback × ecd_department)
3. ปุ่มอนุมัติ/ตีกลับ/ปฏิเสธ → `acknowledge/return/reject_estimation_approval`
4. สถานะ estimate sync อัตโนมัติ (`sync_estimate_status_from_approval`); audit อยู่ใน `estimation_audit_log`

**Acceptance:** ยอด margin ต่างกัน → route ไป level ถูกตาม rule; log ครบ
**Rollback:** ปิดปุ่ม submit (estimate ยัง draft ได้ปกติ)

---

## Phase 5 — Quotation  *(optional / ภายหลัง)*

- `quotations` (FK `account_id`→organizations) + `quotation_lines`; เลขผ่าน `next_quote_number`;
  อนุมัติผ่าน `submit_quotation_for_approval`; ยอดด้วย `recalc_quotation_totals`

---

## Phase 6 — Data migration & cutover

1. **localStorage drafts → estimates** (one-time ต่อผู้ใช้): มี mapper อ่าน `est_form_draft` แล้ว upsert; ของที่ migrate แล้ว mark ไว้
2. **db/*.sql + seed.sql → ห้าม deploy** ถาวร; เก็บเป็น reference ของ data model เดิม
3. Parallel-run 1–2 สัปดาห์ (เขียนทั้ง localStorage + CRM) → ยืนยันตรงกัน → ตัด localStorage เป็น cache
4. ปิดเป้าหมาย: **CRM = single source of truth**, ไม่มีข้อมูล 2 แหล่ง

**Acceptance:** ทุก estimate ใหม่อยู่ใน CRM, ไม่มี master ลูกค้า/สินค้าซ้ำในแอป

---

## Cross-cutting

- **Security:** รัน `get_advisors` (security/perf) หลัง Phase 3–4; ตรวจ RLS ว่า user เห็นเฉพาะของทีมตน
- **Identity:** ผูก `profiles`/`auth.uid()` กับ role แอป (เลิกใช้ app_user ใน db/*.sql)
- **Resilience:** ทุก query มี error/empty handling; เขียนเป็น transaction/RPC กัน partial write
- **Testing:** ต่อ branch dev ก่อนเสมอ; มี estimate ทดสอบที่ลบได้
- **No-go:** ห้ามเขียน `accounts`, `stg_organizations_import`; ห้ามออกเลขเอกสารเอง; ห้ามสร้าง master ขนาน

## เส้นทางวิกฤต (critical path)
`0.2 + 0.4 (provision user + read policy)` → `Phase 1 (auth)` → `Phase 2 (read)` → `Phase 3 (write)` → `Phase 4`
Phase 0 คือคอขวดจริง เพราะ auth/policy เป็นของเจ้าของ CRM
