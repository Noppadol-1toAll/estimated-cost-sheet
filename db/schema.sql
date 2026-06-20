-- ============================================================
-- Estimated Cost Sheet — Master Data Schema (Phase 1)
-- Target: Supabase (PostgreSQL 15+)
-- อ้างอิง: product-system-blueprint M02 Item Master / M04 Vendor-Customer
-- ที่มาข้อมูล: "(Rev.2.4.7) Feasibility 1toAll (Draft).xlsx" — sheet "Item" + "0) Reference"
-- Phase 1 = master data อ่านอย่างเดียวจากแอป (เขียนผ่าน Supabase dashboard/service role)
-- ============================================================

create extension if not exists pg_trgm;

-- ---------- M02: Item Master (subset ที่ cost sheet ใช้) ----------
create table if not exists item (
  item_no               varchar(30) primary key,          -- 'BOM-ITEM-00004' / 'ITEM-002372'
  description           text        not null,
  vendor_name           varchar(120),                     -- parse จาก prefix "VENDOR - ..." (nullable)
  base_uom              varchar(20) not null default 'PCS',
  unit_price            numeric(18,2) not null default 0, -- MSRP (THB)
  unit_price_ex_vat_old numeric(18,2),
  promo_price           numeric(18,2),
  promo_start           date,
  promo_end             date,
  allow_line_disc       boolean,
  allow_invoice_disc    boolean,
  price_includes_vat    boolean not null default false,
  blocked               boolean not null default false,   -- BR: blocked = ห้ามเลือกใช้ในเอกสารใหม่
  source_rev            varchar(20) not null default '2.4.7',
  updated_at            timestamptz not null default now()
);
create index if not exists idx_item_desc_trgm on item using gin (description gin_trgm_ops);
create index if not exists idx_item_vendor on item (vendor_name);
create index if not exists idx_item_blocked on item (blocked);

-- ---------- Service Type + เกณฑ์อนุมัติ (Reference R6-R22) ----------
create table if not exists service_type (
  code           varchar(60) primary key,   -- 'Communication | UC'
  category       varchar(40) not null,      -- 'Communication' / 'Audio Visual' / 'Data & Security' / 'System Integration'
  head_role      varchar(80),
  head_name      varchar(100),
  mkt_rate       numeric(6,4) not null default 0.01,  -- Rate.Mkt → OPR-100010
  appv_l1        numeric(6,4) not null,               -- Director threshold (เช่น 0.30)
  appv_l2        numeric(6,4) not null,               -- C-Level threshold (เช่น 0.20)
  approval_group varchar(40)  not null,               -- 'AV/Zoom/Voice/Zound' | 'SI/Internet/Cloud'
  sort           smallint
);

-- ---------- Sale Team → C-Level routing ----------
create table if not exists sale_team (
  name         varchar(60) primary key,
  head_name    varchar(100),
  c_level_role varchar(20),     -- 'COO' / 'CPO' / 'COS'
  c_level_name varchar(100),
  sort         smallint
);

-- ---------- Overhead (Reference คอลัมน์ OH) ----------
create table if not exists overhead_type (
  id         smallserial primary key,
  label      varchar(80) not null unique,   -- 'โครงการปกติ (5%)'
  pct        numeric(6,4) not null,         -- 0.05
  is_default boolean not null default false,
  sort       smallint
);

-- ---------- ค่าใช้จ่ายอื่นๆ (Reference คอลัมน์ OTHER) ----------
create table if not exists other_expense_type (
  id   smallserial primary key,
  name varchar(120) not null unique,
  sort smallint
);

-- ---------- Project / Payment Type ----------
create table if not exists project_type (
  name varchar(40) primary key,
  sort smallint
);
create table if not exists payment_type (
  name varchar(40) primary key,
  sort smallint
);

-- ---------- FX Rate ตามรอบประกาศฝ่ายการเงิน (Reference R37+) ----------
create table if not exists fx_rate (
  id         smallserial primary key,
  start_date date not null,
  end_date   date not null,
  usd        numeric(10,4) not null,
  cny        numeric(10,4) not null,
  constraint chk_fx_range check (end_date >= start_date)
);

-- ---------- รายการมาตรฐาน Install / PMCM (sheet "1) Install" / "2) PMCM") ----------
create table if not exists install_pmcm_standard (
  code       varchar(20) primary key,  -- 'STD-01'
  name       varchar(150) not null,
  meta       varchar(150),
  unit_price numeric(18,2) not null default 0,
  sort       smallint
);

-- ---------- MRC Catalog (ที่มา: แอป — ไม่มีใน Excel rev นี้) ----------
create table if not exists mrc_catalog (
  code         varchar(30) primary key,
  vendor       varchar(80) not null,
  description  varchar(200) not null,
  default_cost numeric(18,2) not null default 0,
  default_sale numeric(18,2) not null default 0
);

-- ---------- บุคลากร (dropdown Sale Person / Pre-Sales) ----------
create table if not exists staff (
  id        smallserial primary key,
  full_name varchar(120) not null,
  nickname  varchar(60),
  role      varchar(10) not null check (role in ('sale','presale')),
  sale_team varchar(60) references sale_team(name),
  sort      smallint
);

-- ============================================================
-- Row Level Security — Phase 1: ทุก master เปิด "อ่าน" สาธารณะ (anon key)
-- การเขียนทำได้เฉพาะ service role (ไม่มี insert/update/delete policy)
-- ============================================================
do $$
declare t text;
begin
  foreach t in array array['item','service_type','sale_team','overhead_type',
    'other_expense_type','project_type','payment_type','fx_rate',
    'install_pmcm_standard','mrc_catalog','staff']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "anon read" on %I', t);
    execute format('create policy "anon read" on %I for select using (true)', t);
  end loop;
end $$;
