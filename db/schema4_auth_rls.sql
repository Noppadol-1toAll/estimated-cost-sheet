-- ============================================================
-- Estimated Cost Sheet — Auth + RLS Policies (Phase 2.4)
-- Migration #4 — รันหลัง schema.sql / schema2 / schema3
-- เป้าหมาย: ปลดล็อก write path ให้เฉพาะผู้ใช้ภายในที่ login (Supabase Auth)
--           โดยอิง mapping app_user.auth_uid = auth.uid()
--
-- โมเดลสิทธิ์ (ตรงกับ role ในแอป presale/sale/clevel/ceo):
--   - master data           : anon read เดิม (schema.sql) — ไม่แตะ
--   - transaction tables     : เห็น/เขียนได้เฉพาะผู้ใช้ภายในที่ valid (app_role() not null)
--                              ลบได้เฉพาะ clevel/ceo
--   - approval_log           : IMMUTABLE — read + insert เท่านั้น (ไม่มี update/delete) [Phase 2.3]
--   - app_user               : ทุกคนอ่านได้ (เพื่อแสดงผู้อนุมัติ), แก้ได้เฉพาะตนเอง/ceo/clevel,
--                              เพิ่ม/ลบได้เฉพาะ ceo
--
-- ปลอดภัยต่อระบบที่ใช้งานอยู่: ก่อนผูก auth_uid → app_role() คืน null ทุกคน
--   ⇒ transaction ยังปิดสนิท, master anon read ยังทำงานปกติ (publishable key)
-- ============================================================

-- ---------- helper: อ่าน role/user_id ของผู้ใช้ปัจจุบันจาก app_user ----------
-- SECURITY DEFINER → รันด้วยสิทธิ์เจ้าของฟังก์ชัน เลี่ยง RLS recursion บน app_user
create or replace function app_role() returns text
  language sql stable security definer set search_path = public as $$
  select role from app_user where auth_uid = auth.uid() and active limit 1;
$$;

create or replace function app_user_id() returns uuid
  language sql stable security definer set search_path = public as $$
  select user_id from app_user where auth_uid = auth.uid() and active limit 1;
$$;

-- ---------- transaction tables ที่ "เขียนได้" (customer/quotation/quotation_line/est_document/approval_request) ----------
-- read: ผู้ใช้ภายในที่ valid · insert/update: เช่นกัน · delete: clevel/ceo
do $$
declare t text;
begin
  foreach t in array array['customer','quotation','quotation_line',
                           'est_document','approval_request']
  loop
    execute format('alter table %I enable row level security', t);

    execute format('drop policy if exists "internal read" on %I', t);
    execute format($f$create policy "internal read" on %I
      for select to authenticated using (app_role() is not null)$f$, t);

    execute format('drop policy if exists "internal insert" on %I', t);
    execute format($f$create policy "internal insert" on %I
      for insert to authenticated with check (app_role() is not null)$f$, t);

    execute format('drop policy if exists "internal update" on %I', t);
    execute format($f$create policy "internal update" on %I
      for update to authenticated using (app_role() is not null)
                                  with check (app_role() is not null)$f$, t);

    execute format('drop policy if exists "admin delete" on %I', t);
    execute format($f$create policy "admin delete" on %I
      for delete to authenticated using (app_role() in ('clevel','ceo'))$f$, t);
  end loop;
end $$;

-- ---------- approval_log: IMMUTABLE audit trail (read + insert เท่านั้น) ----------
alter table approval_log enable row level security;
drop policy if exists "internal read" on approval_log;
create policy "internal read" on approval_log
  for select to authenticated using (app_role() is not null);
drop policy if exists "internal insert" on approval_log;
create policy "internal insert" on approval_log
  for insert to authenticated with check (app_role() is not null);
-- ตั้งใจไม่มี update/delete policy → แก้/ลบ log ไม่ได้ (immutable)

-- ---------- app_user ----------
alter table app_user enable row level security;
drop policy if exists "user read" on app_user;
create policy "user read" on app_user
  for select to authenticated using (app_role() is not null);

drop policy if exists "user self update" on app_user;
create policy "user self update" on app_user
  for update to authenticated
  using      (auth_uid = auth.uid() or app_role() in ('ceo','clevel'))
  with check (auth_uid = auth.uid() or app_role() in ('ceo','clevel'));

drop policy if exists "ceo insert user" on app_user;
create policy "ceo insert user" on app_user
  for insert to authenticated with check (app_role() = 'ceo');

drop policy if exists "ceo delete user" on app_user;
create policy "ceo delete user" on app_user
  for delete to authenticated using (app_role() = 'ceo');

-- ============================================================
-- STEP สุดท้าย (รันหลังจากสร้าง/เชิญ user ใน Authentication ครบแล้ว):
-- ผูก auth_uid ของ app_user เข้ากับ auth.users ตาม email (idempotent)
--   *** ส่วนนี้ comment ไว้ — รันแยกหลัง user accounts ถูกสร้าง ***
-- ============================================================
-- update app_user u
--    set auth_uid = a.id
--   from auth.users a
--  where lower(a.email) = lower(u.email)
--    and u.auth_uid is distinct from a.id;
