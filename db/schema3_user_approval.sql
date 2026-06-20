-- ============================================================
-- Estimated Cost Sheet — User & Approval Workflow (Transaction Layer)
-- Migration #3 — รันหลัง schema.sql และ schema2_customer_quotation.sql
-- อ้างอิง: index.html role model (presale/sale/clevel/ceo) + margin-threshold routing
--          (service_type.appv_l1 = Director, appv_l2 = C-Level, ต่ำกว่านั้น = CEO)
-- ขอบเขต: เก็บ "audit trail + สถานะ" — การ route ตาม net margin คำนวณในแอป (มีอยู่แล้ว)
-- หมายเหตุ: ทุกตารางในไฟล์นี้ RLS deny-by-default (ไม่มี policy) เหมือน schema2
--           จะเปิดเป็นราย role เมื่อมี Supabase Auth (Phase 2.4) ผ่าน app_user.auth_uid
-- ============================================================

-- ---------- ผู้ใช้ระบบอนุมัติ (standalone — ยังไม่ผูก Supabase Auth) ----------
create table if not exists app_user (
  user_id      uuid primary key default gen_random_uuid(),
  auth_uid     uuid unique,                     -- เผื่ออนาคต: map กับ auth.users(id) เมื่อเปิด Auth
  email        varchar(160) not null,
  full_name    varchar(120) not null,
  role         varchar(10)  not null
               check (role in ('presale','sale','clevel','ceo')),  -- ตรงกับ ADMIN_ROLES/ROLE_LABELS ในแอป
  c_level_role varchar(10)  check (c_level_role in ('COO','CPO','COS')), -- เฉพาะ role='clevel'
  sale_team    varchar(60)  references sale_team(name),
  title        varchar(120),                    -- ตำแหน่งที่แสดง เช่น 'Head of Sales', 'SA Manager'
  active       boolean      not null default true,
  created_at   timestamptz  not null default now(),
  updated_at   timestamptz  not null default now(),
  -- C-Level/CEO ไม่ต้องผูกทีม; sale ควรมีทีม (เตือนด้วย check แบบหลวม ไม่บังคับ presale)
  constraint chk_user_clevel_role
    check ((role = 'clevel') = (c_level_role is not null))
);
create unique index if not exists idx_app_user_email on app_user (lower(email));
create index if not exists idx_app_user_role on app_user (role);
create index if not exists idx_app_user_team on app_user (sale_team);

-- ---------- เอกสาร Estimated Cost Sheet (สิ่งที่ถูกอนุมัติ → แปลงเป็น quotation) ----------
create table if not exists est_document (
  est_no         varchar(30) primary key,        -- 'EST-202606-0001'
  customer_no    varchar(20) references customer(customer_no),
  project_name   varchar(200) not null,
  service_code   varchar(60)  references service_type(code), -- กำหนดกลุ่ม/threshold การอนุมัติ
  sale_team      varchar(60)  references sale_team(name),
  created_by     uuid         references app_user(user_id),
  -- snapshot ตัวเลขที่ใช้ตัดสินสายอนุมัติ (เก็บไว้เพื่อ audit — แอปเป็นผู้คำนวณ)
  project_value  numeric(18,2) not null default 0,   -- มูลค่าขาย (sale)
  net_profit     numeric(18,2) not null default 0,
  net_margin_pct numeric(7,3)  not null default 0,   -- เช่น 13.300
  required_level varchar(10)   check (required_level in ('director','clevel','ceo')),
  status         varchar(14)   not null default 'draft'
                 check (status in ('draft','pending','approved','rejected','converted','cancelled')),
  quote_no       varchar(30)   references quotation(quote_no), -- set เมื่อแปลงเป็นใบเสนอราคา
  payload        jsonb,                              -- snapshot ฟอร์ม cost sheet ทั้งใบ (est_form_draft v2)
  created_at     timestamptz   not null default now(),
  updated_at     timestamptz   not null default now()
);
create index if not exists idx_est_customer on est_document (customer_no);
create index if not exists idx_est_status on est_document (status);
create index if not exists idx_est_team on est_document (sale_team);

-- ---------- คำขออนุมัติ 1 รายการ ต่อการส่งอนุมัติ 1 ครั้งของ est_document ----------
create table if not exists approval_request (
  request_id     bigserial primary key,
  est_no         varchar(30) not null references est_document(est_no) on delete cascade,
  requested_by   uuid        references app_user(user_id),
  net_margin_pct numeric(7,3) not null default 0,    -- snapshot ตอนส่ง
  required_level varchar(10)  check (required_level in ('director','clevel','ceo')),
  current_step   smallint     not null default 1,    -- ก้าวปัจจุบันในสาย (1..N)
  total_steps    smallint     not null default 1,
  status         varchar(10)  not null default 'pending'
                 check (status in ('pending','approved','rejected','cancelled')),
  opened_at      timestamptz  not null default now(),
  closed_at      timestamptz
);
create index if not exists idx_appreq_est on approval_request (est_no);
create index if not exists idx_appreq_status on approval_request (status);
-- เปิดได้แค่ 1 คำขอที่ยัง pending ต่อ 1 เอกสาร
create unique index if not exists idx_appreq_one_open
  on approval_request (est_no) where status = 'pending';

-- ---------- บันทึกการตัดสิน (audit trail) ของแต่ละก้าวในสายอนุมัติ ----------
create table if not exists approval_log (
  log_id     bigserial primary key,
  request_id bigint      not null references approval_request(request_id) on delete cascade,
  step_no    smallint    not null,
  step_role  varchar(10) not null
             check (step_role in ('presale','sale','clevel','ceo')),
  actor_user uuid        references app_user(user_id),  -- ใครเป็นคนกด (null = ยังไม่ดำเนินการ)
  actor_name varchar(120),                              -- snapshot ชื่อผู้ทำ ณ ตอนนั้น
  action     varchar(12) not null
             check (action in ('submitted','approved','rejected','returned','commented')),
  comment    text,
  acted_at   timestamptz not null default now()
);
create index if not exists idx_applog_request on approval_log (request_id, step_no);

-- ---------- trigger: ปรับ updated_at อัตโนมัติบน est_document ----------
create or replace function trg_touch_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;
drop trigger if exists est_touch_updated on est_document;
create trigger est_touch_updated before update on est_document
  for each row execute function trg_touch_updated_at();
drop trigger if exists user_touch_updated on app_user;
create trigger user_touch_updated before update on app_user
  for each row execute function trg_touch_updated_at();

-- ---------- RLS: deny-by-default (ไม่มี policy สำหรับ anon) ----------
alter table app_user        enable row level security;
alter table est_document    enable row level security;
alter table approval_request enable row level security;
alter table approval_log    enable row level security;
-- ตั้งใจไม่สร้าง policy ใดๆ → publishable key อ่าน/เขียนไม่ได้
-- จะเปิดเป็นราย role เมื่อมี Supabase Auth (Phase 2.4) โดยอิง app_user.auth_uid = auth.uid()

-- ============================================================
-- SEED: app_user — ผู้อนุมัติจริงตาม index.html (sale_team + service_type)
-- email เป็น placeholder (domain @nv.co.th) — แก้ให้ตรงระบบจริงก่อน go-live
-- idempotent: on conflict (lower(email)) do nothing ไม่ได้โดยตรง → ใช้ where not exists
-- ============================================================
insert into app_user (email, full_name, role, c_level_role, sale_team, title)
select v.email, v.full_name, v.role, v.c_level_role, v.sale_team, v.title
from (values
  -- CEO
  ('vasavas.n@nv.co.th',   'Vasavas Nonsopa',          'ceo',     null::varchar, null::varchar,                'CEO'),
  -- C-Level
  ('parinya.s@nv.co.th',   'Parinya Sahabhatsombut',   'clevel',  'COO',         'Account Management 1',       'Chief Operating Officer'),
  ('montree.m@nv.co.th',   'Montree Montreemanee',     'clevel',  'CPO',         null,                         'Chief Product Officer'),
  ('ponpimol.n@nv.co.th',  'Ponpimol Nonsopa',         'clevel',  'COS',         'Center',                     'Chief of Staff'),
  -- Head of Sales (role = sale)
  ('pasu.m@nv.co.th',      'Pasu Markboonsog',         'sale',    null,          'Account Management 1',       'Head of Sales'),
  ('piyanant.a@nv.co.th',  'Piyanant Anukul',          'sale',    null,          'Account Management 2',       'Head of Sales'),
  ('kritpas.v@nv.co.th',   'Kritpas Vorathananon',     'sale',    null,          'Inside & Online',            'Head of Sales'),
  ('weerachai.n@nv.co.th', 'Weerachai Nilnampetch',    'sale',    null,          'Government',                 'Head of Sales'),
  ('jirad.k@nv.co.th',     'Jirad Kachanunyanawut',    'sale',    null,          'Data & Security',            'Head of Sales'),
  ('visanu.c@nv.co.th',    'Visanu Chintanasirikul',   'sale',    null,          'Zound & Workplace',          'Head of Sales'),
  -- Presale / SA (role = presale)
  ('woraphat.l@nv.co.th',  'Woraphat Laohaudomphan',   'presale', null,          null,                         'Solution Architect Manager'),
  ('noppadol.s@nv.co.th',  'Noppadol Sanmaneechai',    'presale', null,          null,                         'Head of Pre-Sales'),
  ('dumrongrit.p@nv.co.th','Dumrongrit Pantaraksakul', 'presale', null,          null,                         'Head of AV (Acting)'),
  ('komen.s@nv.co.th',     'Komen Srithaneschai',      'presale', null,          null,                         'Acoustic Engineer')
) as v(email, full_name, role, c_level_role, sale_team, title)
where not exists (
  select 1 from app_user u where lower(u.email) = lower(v.email)
);
