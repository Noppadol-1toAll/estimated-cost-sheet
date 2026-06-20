-- ============================================================
-- Estimated Cost Sheet — Customer & Quotation (Transaction Layer)
-- Migration #2 — รันหลัง schema.sql
-- อ้างอิง: product-system-blueprint M04 Vendor/Customer + M08 Sales
-- หมายเหตุ: ตารางธุรกรรม/ข้อมูลลูกค้า "ปิด" การอ่านสาธารณะ (ต่างจาก master)
--           จนกว่าจะมี Supabase Auth (Phase 2.4) — เข้าถึงผ่าน service role เท่านั้น
-- ============================================================

-- ---------- M04: Customer Master ----------
create table if not exists customer (
  customer_no   varchar(20) primary key,        -- รูปแบบ [PREFIX]-[YYMM]-[SEQ4] ตาม blueprint เช่น 'CUST-2606-0001'
  name          varchar(200) not null,
  tax_id        varchar(20),                    -- เลขผู้เสียภาษี (unique เมื่อมีค่า)
  address       text,
  contact_name  varchar(120),
  contact_email varchar(120),
  contact_phone varchar(40),
  sale_team     varchar(60) references sale_team(name),
  crm_ref       varchar(60),                    -- id ฝั่ง CRM (เช่น Account Id) สำหรับ sync
  blocked       boolean not null default false, -- BR-M08: ลูกค้า blocked ห้ามออกใบเสนอราคาใหม่
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index if not exists idx_customer_taxid on customer (tax_id) where tax_id is not null;
create index if not exists idx_customer_crm on customer (crm_ref);

-- ---------- M08: Quotation Header ----------
create table if not exists quotation (
  quote_no       varchar(30) primary key,       -- 'QT-202605-002'
  est_no         varchar(30),                   -- อ้างใบ Estimated Cost Sheet ต้นทาง
  customer_no    varchar(20) not null references customer(customer_no),
  project_name   varchar(200) not null,
  quote_type     varchar(10) not null default 'onetime'
                 check (quote_type in ('onetime','recurring','zoom')),
  status         varchar(10) not null default 'draft'
                 check (status in ('draft','sent','accepted','expired','cancelled')),
  quote_date     date not null default current_date,
  valid_until    date not null,
  amount_ex_vat  numeric(18,2) not null default 0,
  discount       numeric(18,2) not null default 0,
  vat_pct        numeric(5,2)  not null default 7,
  amount_inc_vat numeric(18,2) not null default 0,
  pay_terms      varchar(120),
  salesperson    varchar(120),
  remark         text,
  crm_ref        varchar(60),                   -- id ฝั่ง CRM (เช่น Deal/Opportunity Id)
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint chk_quote_valid    check (valid_until >= quote_date),
  constraint chk_quote_discount check (discount >= 0)
);
create index if not exists idx_quotation_customer on quotation (customer_no);
create index if not exists idx_quotation_status on quotation (status);
create index if not exists idx_quotation_crm on quotation (crm_ref);

-- ---------- M08: Quotation Lines ----------
create table if not exists quotation_line (
  quote_no    varchar(30) not null references quotation(quote_no) on delete cascade,
  line_no     smallint    not null,
  item_no     varchar(30) references item(item_no),  -- nullable: บรรทัดบริการ/ข้อความอิสระ
  description text        not null,
  qty         numeric(18,4) not null default 1,
  unit_price  numeric(18,2) not null default 0,
  line_total  numeric(18,2) not null default 0,
  is_mrc      boolean     not null default false,    -- บรรทัดรายเดือน (unit_price = ราคา/เดือน × term แล้ว)
  primary key (quote_no, line_no)
);

-- BR-M08-006 (blueprint): ห้ามออกใบเสนอราคาด้วย item ที่ blocked/discontinued — บังคับที่ DB
create or replace function trg_qline_check_item() returns trigger language plpgsql as $$
begin
  if new.item_no is not null and exists (select 1 from item where item_no = new.item_no and blocked) then
    raise exception 'Item % is blocked - cannot quote (BR-M08-006)', new.item_no;
  end if;
  return new;
end $$;
drop trigger if exists qline_check_item on quotation_line;
create trigger qline_check_item before insert or update on quotation_line
  for each row execute function trg_qline_check_item();

-- BR ลูกค้า blocked ห้ามออกใบใหม่ — บังคับที่ DB เช่นกัน
create or replace function trg_quote_check_customer() returns trigger language plpgsql as $$
begin
  if exists (select 1 from customer where customer_no = new.customer_no and blocked) then
    raise exception 'Customer % is blocked - cannot create quotation', new.customer_no;
  end if;
  return new;
end $$;
drop trigger if exists quote_check_customer on quotation;
create trigger quote_check_customer before insert on quotation
  for each row execute function trg_quote_check_customer();

-- ---------- RLS: deny-by-default (ไม่มี policy สำหรับ anon) ----------
alter table customer enable row level security;
alter table quotation enable row level security;
alter table quotation_line enable row level security;
-- ตั้งใจไม่สร้าง policy ใดๆ → publishable key อ่าน/เขียนไม่ได้
-- จะเปิดเป็นราย role เมื่อมี Supabase Auth (Phase 2.4)
