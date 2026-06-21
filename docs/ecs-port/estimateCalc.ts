// Pure calculation helpers for the Estimate Cost form.
// Mirrors the Thai feasibility workbook (Rev.2.4.7).
//
// STAGED PATCH (2026-06-21) — Tier-1 calc parity fixes. Target: compass-golden-path src/lib/estimateCalc.ts
// Changes vs current app (see docs/ECS-CALC-PARITY.md):
//   D1 Bonds  : bank-guarantee FEE = projectValue(inclVAT) × 5% × 1% × periods   (was 5% × revenue)
//   D2 Mktg   : marketing = header.marketing_rate (per service) × revenue          (was fixed 1%)
//   D3 Interest: capexCost × 1% × max(0, impl_duration_months − creditMonths)      (was cost × 1% × creditMonths)
//   D4 Overhead: 8 tiers + optional header.overhead_rate (from presale_db_overhead) (was 4 hardcoded)
//   D5 NPV    : discount = header.discount_rate_annual (default 0.06)               (was hardcoded 0.05)
//   D7 VAT    : projectValue incl VAT = revenue × 1.07 (used by bonds)
// Tier-2 (NOT in this patch): discounted-CF margin/payback from a monthly cash-flow model (CF rows).

export type LineType = "otc" | "mrc" | "opex" | "install" | "pmcm";

export const INSTALL_PM_TEMPLATE: Array<{ pic: string; item: string; unit_price: number; remark?: string }> = [
  { pic: "CP11", item: "Professional Service", unit_price: 2000, remark: "PM Service / Design / Config / Service" },
  { pic: "1-TO-ALL", item: "Car", unit_price: 500 },
  { pic: "1-TO-ALL", item: "Hotel", unit_price: 2000 },
  { pic: "1-TO-ALL", item: "Flight (Back-Forth)", unit_price: 0 },
  { pic: "1-TO-ALL", item: "Manday/perday", unit_price: 2000, remark: "Config / Install ZP by 1-TO-ALL" },
  { pic: "1-TO-ALL", item: "Manday/perday Project Co (AE)", unit_price: 1000, remark: "Config / Install ZP by 1-TO-ALL" },
  { pic: "1-TO-ALL", item: "Manday/perday PM", unit_price: 2500, remark: "Config / Install ZP by 1-TO-ALL" },
  { pic: "1-TO-ALL", item: "Manday/perday ENG", unit_price: 1500, remark: "Config / Install ZP by 1-TO-ALL" },
  { pic: "1-TO-ALL", item: "Installation & Configuration: Desk Phone/ATA", unit_price: 20 },
  { pic: "1-TO-ALL", item: "Training Manday", unit_price: 10000, remark: "Installation & training" },
  { pic: "1-TO-ALL", item: "Numbering Installation", unit_price: 1000 },
  { pic: "1-TO-ALL/SUB", item: "Professional Service", unit_price: 2000, remark: "Data networking and others" },
  { pic: "1-TO-ALL/SUB", item: "Car & Installation & Configuration", unit_price: 2000, remark: "Data networking and others" },
  { pic: "Ribbon", item: "Installation SBC / E1 / ATA", unit_price: 30000, remark: "Installation SBC / E1 / ATA" },
  { pic: "1-TO-ALL/SUB", item: "Others", unit_price: 0, remark: "ปรับประมาณการณ์ตามเหมาะสม" },
];

export type Currency = "THB" | "USD" | "CNY";

export type EstimateLine = {
  id?: string;
  line_type: LineType;
  seq: number;
  category?: string | null;
  supplier?: string | null;
  item_code?: string | null;
  item_description?: string | null;
  unit?: string | null;
  quantity: number;
  unit_price_msrp: number;
  discount_pct: number;
  cost_price: number;
  sell_price: number;
  currency: Currency;
  fx_rate: number;
  amount_thb: number;
  remark?: string | null;
  warranty_years?: number | null;
  lead_time_days?: number | null;
  credit_term_days?: number | null;
  opex_code?: string | null;
};

// D4: overhead tiers extended to mirror the workbook `tbl.oh` (Reference!K5:L13).
export type OverheadType =
  | "buy_resell_3" | "normal_5" | "large_7" | "special_9"
  | "zoom_5" | "internet_5" | "cloud_5" | "complex_15";
export const OVERHEAD_RATE: Record<OverheadType, number> = {
  buy_resell_3: 0.03,
  normal_5: 0.05,
  large_7: 0.07,
  special_9: 0.09,
  zoom_5: 0.05,
  internet_5: 0.05,
  cloud_5: 0.05,
  complex_15: 0.15,
};
export const OVERHEAD_LABEL: Record<OverheadType, string> = {
  buy_resell_3: "ซื้อมาขายไป (3%)",
  normal_5: "โครงการปกติ (5%)",
  large_7: "โครงการใหญ่ (7%)",
  special_9: "โครงการพิเศษ (9%)",
  zoom_5: "บริการ Zoom (5%)",
  internet_5: "บริการ Internet (5%)",
  cloud_5: "บริการ Cloud Service (5%)",
  complex_15: "โครงการซับซ้อน (15%)",
};

export const VAT_RATE = 0.07;
export const DEFAULT_DISCOUNT_RATE = 0.06; // rate.discount (Summary!B94)
export const DEFAULT_MARKETING_RATE = 0.01; // Reference!H default
export const BOND_SIZE_PCT = 0.05; // bond amount = 5% of project value
export const BOND_FEE_PCT = 0.01; // bank fee = 1% of bond amount per period

export type EstimateHeader = {
  contract_term_months: number;
  budget_thb: number;
  bid_bond_enabled: boolean;
  bid_bond_months: number;
  performance_bond_enabled: boolean;
  other_costs_enabled: boolean;
  telecom_license_enabled?: boolean;
  overhead_type?: OverheadType;
  credit_term_days?: number;
  // New optional calc inputs (UI/DB wired separately):
  overhead_rate?: number;        // D4: authoritative rate from presale_db_overhead.percent_oh
  marketing_rate?: number;       // D2: presales_service_types.rate_marketing for the service
  impl_duration_months?: number; // D3: install/delivery duration (Summary AC9 imp.duration)
  discount_rate_annual?: number; // D5: rate.discount
};

export type OprKind = "amount" | "rate_of_capex" | "auto_revenue" | "auto_overhead" | "auto_interest" | "auto_bidbond" | "auto_perfbond";
export type OprRow = {
  code: string;
  label_en: string;
  label_th: string;
  kind: OprKind;
  rate?: number;
  conditional?: "bid_bond" | "perf_bond" | "telecom_license";
};

export const OPR_ROWS: OprRow[] = [
  { code: "OPR-100001", label_en: "Install & Material / Project Mgmt.", label_th: "ค่าติดตั้งและบริหารงาน", kind: "amount" },
  { code: "OPR-100002", label_en: "Logistics & Warehouse", label_th: "ค่าขนส่งและเก็บรักษา", kind: "amount" },
  { code: "OPR-100003", label_en: "Training & Documentation", label_th: "ค่าฝึกอบรม", kind: "amount" },
  { code: "OPR-100004", label_en: "Sale and Presale Management & Acceptance", label_th: "Sale and Presale Management & Acceptance", kind: "amount" },
  { code: "OPR-100005", label_en: "Onsite Service (MA, CM/PM)", label_th: "ค่าบริการหลังการขาย Onsite Service (MA, CM/PM)", kind: "amount" },
  { code: "OPR-100006", label_en: "Spare parts (% of CAPEX)", label_th: "ค่าอุปกรณ์สำรอง (% ของงบลงทุน)", kind: "rate_of_capex" },
  { code: "OPR-100007", label_en: "Interest 1%/month × (duration − credit)", label_th: "ค่าดอกเบี้ย 1%/เดือน × (ระยะติดตั้ง − Credit)", kind: "auto_interest" },
  { code: "OPR-100008", label_en: "Bid Bond fee (5% × 1% × periods)", label_th: "ค่าธรรมเนียม Bid Bond", kind: "auto_bidbond", conditional: "bid_bond" },
  { code: "OPR-100009", label_en: "Performance Bond fee (5% × 1% × contract)", label_th: "ค่าธรรมเนียม Performance Bond", kind: "auto_perfbond", conditional: "perf_bond" },
  { code: "OPR-100010", label_en: "Marketing (% of revenue, per service)", label_th: "ค่าการตลาด (% ของรายได้ ตาม service)", kind: "auto_revenue" },
  { code: "OPR-100011", label_en: "Telecom License Fee 2%", label_th: "ค่าธรรมเนียมใบอนุญาตโทรคมนาคม 2%", kind: "auto_revenue", rate: 0.02, conditional: "telecom_license" },
  { code: "OPR-100012", label_en: "Customer Entertainment / Gifts", label_th: "ค่าเลี้ยงรับรองลูกค้า/ของขวัญ", kind: "amount" },
  { code: "OPR-100013", label_en: "Overhead Cost (3 / 5 / 7 / 9 / 15 %)", label_th: "Overhead Cost (3 / 5 / 7 / 9 / 15 %)", kind: "auto_overhead" },
];

export const OPEX_CATEGORIES = OPR_ROWS.map((r) => ({
  code: r.code,
  label_en: r.label_en,
  label_th: r.label_th,
  kind:
    r.kind === "amount" ? "amount" :
    r.kind === "rate_of_capex" ? "pct_of_otc" : "pct_of_revenue",
}));

export function emptyLine(line_type: LineType, seq: number): EstimateLine {
  return {
    line_type, seq, category: null, supplier: null, item_code: null,
    item_description: null, unit: null, quantity: 0, unit_price_msrp: 0,
    discount_pct: 0, cost_price: 0, sell_price: 0, currency: "THB",
    fx_rate: 1, amount_thb: 0, remark: null, warranty_years: null,
    lead_time_days: null, credit_term_days: null,
  };
}

export function recalcLine(l: EstimateLine): EstimateLine {
  if (l.line_type === "opex") return l;
  if (l.line_type === "install" || l.line_type === "pmcm") {
    const amt = (l.quantity || 0) * (l.sell_price || 0);
    return { ...l, fx_rate: 1, currency: "THB", amount_thb: Number(amt.toFixed(2)) };
  }
  const amount = (l.quantity || 0) * (l.sell_price || 0) * (l.fx_rate || 1);
  return { ...l, amount_thb: Number(amount.toFixed(2)) };
}

export function makeInstallPmLine(line_type: "install" | "pmcm", seq: number, t: typeof INSTALL_PM_TEMPLATE[number]): EstimateLine {
  return recalcLine({
    line_type, seq, category: null, supplier: t.pic, item_code: null,
    item_description: t.item, unit: null, quantity: 0, unit_price_msrp: t.unit_price,
    discount_pct: 0, cost_price: t.unit_price, sell_price: t.unit_price,
    currency: "THB", fx_rate: 1, amount_thb: 0, remark: t.remark ?? null,
  });
}

export type Totals = {
  total_otc: number; total_mrc: number; total_tcv: number;
  total_cogs: number; total_opex: number;
  total_otc_cost: number; total_mrc_cost: number;
  revenue_otc: number; revenue_mrc: number;
  project_value_incl_vat: number;
  gp_thb: number; gp_pct: number; np_thb: number; np_pct: number;
  payback_months: number; npv_thb: number;
  opr: Record<string, number>;
};

function overheadRate(header: EstimateHeader): number {
  if (typeof header.overhead_rate === "number") return header.overhead_rate;
  return OVERHEAD_RATE[header.overhead_type ?? "normal_5"] ?? 0.05;
}

/** Compute auto-driven OPR amounts based on header + lines + manual amounts. */
export function computeOprAmounts(
  header: EstimateHeader,
  otcLines: EstimateLine[],
  mrcLines: EstimateLine[],
  manualAmounts: Record<string, number>,
  overrides?: Partial<Record<string, number>>,
): Record<string, number> {
  const total_otc_cost = otcLines.reduce((a, l) => a + (l.cost_price || 0) * (l.quantity || 0) * (l.fx_rate || 1), 0);
  const total_otc = otcLines.reduce((a, l) => a + (l.amount_thb || 0), 0);
  const total_mrc = mrcLines.reduce((a, l) => a + (l.amount_thb || 0), 0);
  const term = Math.max(1, header.contract_term_months || 12);
  const revenue = total_otc + total_mrc * term;            // rev.total (ex-VAT)
  const revenueVat = revenue * (1 + VAT_RATE);             // N10 (incl VAT)
  const oh_rate = overheadRate(header);
  const mkt_rate = typeof header.marketing_rate === "number" ? header.marketing_rate : DEFAULT_MARKETING_RATE;
  const credit_months = (header.credit_term_days ?? 0) / 30;
  const impl_months = header.impl_duration_months ?? 0;
  const interest_months = Math.max(0, impl_months - credit_months);
  const bid_periods = Math.max(0, header.bid_bond_months ?? 0) || 1;

  const out: Record<string, number> = {};
  for (const r of OPR_ROWS) {
    if (r.conditional === "bid_bond" && !header.bid_bond_enabled) { out[r.code] = 0; continue; }
    if (r.conditional === "perf_bond" && !header.performance_bond_enabled) { out[r.code] = 0; continue; }
    if (r.conditional === "telecom_license" && !header.telecom_license_enabled) { out[r.code] = 0; continue; }
    if (overrides && overrides[r.code] != null) { out[r.code] = round2(overrides[r.code] as number); continue; }
    switch (r.kind) {
      case "amount":
        out[r.code] = manualAmounts[r.code] ?? 0;
        break;
      case "rate_of_capex": {
        const rate = manualAmounts[r.code] ?? 0; // R52 spare %
        out[r.code] = rate * total_otc_cost;
        break;
      }
      case "auto_interest": // OPR-100007
        out[r.code] = total_otc_cost * 0.01 * interest_months;
        break;
      case "auto_bidbond": // OPR-100008 — bank fee
        out[r.code] = revenueVat * BOND_SIZE_PCT * BOND_FEE_PCT * bid_periods;
        break;
      case "auto_perfbond": // OPR-100009 — bank fee over contract
        out[r.code] = revenueVat * BOND_SIZE_PCT * BOND_FEE_PCT * term;
        break;
      case "auto_revenue":
        // OPR-100010 marketing uses per-service rate; others use their fixed rate (e.g. license 2%).
        out[r.code] = (r.code === "OPR-100010" ? mkt_rate : (r.rate ?? 0)) * revenue;
        break;
      case "auto_overhead":
        out[r.code] = oh_rate * revenue;
        break;
    }
    out[r.code] = round2(out[r.code]);
  }
  return out;
}

export function sumInstallPm(lines: EstimateLine[], type: "install" | "pmcm"): number {
  return lines.filter((l) => l.line_type === type).reduce((a, l) => a + (l.amount_thb || 0), 0);
}

export function computeTotals(header: EstimateHeader, lines: EstimateLine[]): Totals {
  const otc = lines.filter((l) => l.line_type === "otc");
  const mrc = lines.filter((l) => l.line_type === "mrc");
  const opex = lines.filter((l) => l.line_type === "opex");

  const total_otc = sum(otc.map((l) => l.amount_thb));
  const total_mrc = sum(mrc.map((l) => l.amount_thb));
  const term = Math.max(1, header.contract_term_months || 12);
  const revenue_otc = total_otc;
  const revenue_mrc = total_mrc * term;
  const total_tcv = revenue_otc + revenue_mrc;
  const project_value_incl_vat = total_tcv * (1 + VAT_RATE);

  const total_otc_cost = sum(otc.map((l) => (l.cost_price || 0) * (l.quantity || 0) * (l.fx_rate || 1)));
  const total_mrc_cost = sum(mrc.map((l) => (l.cost_price || 0) * (l.quantity || 0) * (l.fx_rate || 1)));
  const total_cogs = total_otc_cost + total_mrc_cost * term;

  const manualAmounts: Record<string, number> = {};
  for (const l of opex) {
    const code = l.opex_code || l.category || "";
    if (code) manualAmounts[code] = l.amount_thb || 0;
  }
  const installSum = sumInstallPm(lines, "install");
  const pmcmSum = sumInstallPm(lines, "pmcm");
  const overrides: Record<string, number> = {};
  if (installSum > 0) overrides["OPR-100001"] = installSum;
  if (pmcmSum > 0) overrides["OPR-100005"] = pmcmSum;
  const opr = computeOprAmounts(header, otc, mrc, manualAmounts, overrides);
  const total_opex = Object.values(opr).reduce((a, b) => a + b, 0);

  const overheadAmount = opr["OPR-100013"] || 0;
  const opexExOverhead = total_opex - overheadAmount;

  const gp_thb = total_tcv - total_cogs - opexExOverhead;
  const gp_pct = total_tcv > 0 ? gp_thb / total_tcv : 0;
  const np_thb = gp_thb - overheadAmount;
  const np_pct = total_tcv > 0 ? np_thb / total_tcv : 0;

  const upfront = total_otc - total_otc_cost;
  const monthlyNet = total_mrc - total_mrc_cost;
  const payback_months = monthlyNet > 0 ? Math.max(0, -upfront / monthlyNet) : 0;

  // D5: configurable annual discount (default 6%). Tier-2 will replace with full monthly CF.
  const annual = typeof header.discount_rate_annual === "number" ? header.discount_rate_annual : DEFAULT_DISCOUNT_RATE;
  const rMonthly = Math.pow(1 + annual, 1 / 12) - 1;
  let npv = upfront;
  for (let m = 1; m <= term; m++) npv += monthlyNet / Math.pow(1 + rMonthly, m);

  return {
    total_otc: round2(total_otc), total_mrc: round2(total_mrc), total_tcv: round2(total_tcv),
    total_cogs: round2(total_cogs), total_opex: round2(total_opex),
    total_otc_cost: round2(total_otc_cost), total_mrc_cost: round2(total_mrc_cost),
    revenue_otc: round2(revenue_otc), revenue_mrc: round2(revenue_mrc),
    project_value_incl_vat: round2(project_value_incl_vat),
    gp_thb: round2(gp_thb), gp_pct: round4(gp_pct),
    np_thb: round2(np_thb), np_pct: round4(np_pct),
    payback_months: isFinite(payback_months) ? round2(payback_months) : 0,
    npv_thb: round2(npv), opr,
  };
}

function sum(xs: number[]) { return xs.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0); }
function round2(n: number) { return Number((n || 0).toFixed(2)); }
function round4(n: number) { return Number((n || 0).toFixed(4)); }

export function fmtThb(n: number | null | undefined) {
  const v = n ?? 0;
  return "฿" + new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
}
export function fmtPct(n: number | null | undefined) {
  const v = (n ?? 0) * 100;
  return `${v.toFixed(2)}%`;
}
