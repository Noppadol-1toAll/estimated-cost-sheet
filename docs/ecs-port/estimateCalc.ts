// Pure calculation helpers for the Estimate Cost form.
// Mirrors the Thai feasibility workbook (Rev.2.4.7).
//
// Tier-1 (OPR formulas) + Tier-2 (discounted monthly cash-flow margin/payback) — see docs/ECS-CALC-PARITY.md.
// Target: compass-pilot-web (EstiMate Compass) src/lib/estimateCalc.ts

export type LineType = "otc" | "mrc" | "opex" | "install" | "pmcm";
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

export type OverheadType =
  | "buy_resell_3" | "normal_5" | "large_7" | "special_9"
  | "zoom_5" | "internet_5" | "cloud_5" | "complex_15";
export const OVERHEAD_RATE: Record<OverheadType, number> = {
  buy_resell_3: 0.03, normal_5: 0.05, large_7: 0.07, special_9: 0.09,
  zoom_5: 0.05, internet_5: 0.05, cloud_5: 0.05, complex_15: 0.15,
};
export const OVERHEAD_LABEL: Record<OverheadType, string> = {
  buy_resell_3: "ซื้อมาขายไป (3%)", normal_5: "โครงการปกติ (5%)", large_7: "โครงการใหญ่ (7%)",
  special_9: "โครงการพิเศษ (9%)", zoom_5: "บริการ Zoom (5%)", internet_5: "บริการ Internet (5%)",
  cloud_5: "บริการ Cloud Service (5%)", complex_15: "โครงการซับซ้อน (15%)",
};

export const VAT_RATE = 0.07;
export const DEFAULT_DISCOUNT_RATE = 0.06;
export const DEFAULT_MARKETING_RATE = 0.01;
export const BOND_SIZE_PCT = 0.05;
export const BOND_FEE_PCT = 0.01;

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
  overhead_rate?: number;
  marketing_rate?: number;
  impl_duration_months?: number;
  discount_rate_annual?: number;
};

export type OprKind = "amount" | "rate_of_capex" | "auto_revenue" | "auto_overhead" | "auto_interest" | "auto_bidbond" | "auto_perfbond";
export type OprRow = {
  code: string; label_en: string; label_th: string; kind: OprKind;
  rate?: number; conditional?: "bid_bond" | "perf_bond" | "telecom_license";
};

export const OPR_ROWS: OprRow[] = [
  { code: "OPR-100001", label_en: "Install & Material / Project Mgmt.", label_th: "ค่าติดตั้งและบริหารงาน", kind: "amount" },
  { code: "OPR-100002", label_en: "Logistics & Warehouse", label_th: "ค่าขนส่งและเก็บรักษา", kind: "amount" },
  { code: "OPR-100003", label_en: "Training & Documentation", label_th: "ค่าฝึกอบรม", kind: "amount" },
  { code: "OPR-100004", label_en: "Sale and Presale Management & Acceptance", label_th: "Sale and Presale Management & Acceptance", kind: "amount" },
  { code: "OPR-100005", label_en: "Onsite Service (MA, CM/PM)", label_th: "ค่าบริการหลังการขาย Onsite Service (MA, CM/PM)", kind: "amount" },
  { code: "OPR-100006", label_en: "Spare parts (% of CAPEX)", label_th: "ค่าอุปกรณ์สำรอง (% ของงบลงทุน)", kind: "rate_of_capex" },
  { code: "OPR-100007", label_en: "Interest 1%/month × (duration − credit)", label_th: "ค่าดอกเบี้ย", kind: "auto_interest" },
  { code: "OPR-100008", label_en: "Bid Bond fee (5% × 1% × periods)", label_th: "ค่าธรรมเนียม Bid Bond", kind: "auto_bidbond", conditional: "bid_bond" },
  { code: "OPR-100009", label_en: "Performance Bond fee (5% × 1% × contract)", label_th: "ค่าธรรมเนียม Performance Bond", kind: "auto_perfbond", conditional: "perf_bond" },
  { code: "OPR-100010", label_en: "Marketing (% of revenue, per service)", label_th: "ค่าการตลาด", kind: "auto_revenue" },
  { code: "OPR-100011", label_en: "Telecom License Fee 2%", label_th: "ค่าธรรมเนียมใบอนุญาตโทรคมนาคม 2%", kind: "auto_revenue", rate: 0.02, conditional: "telecom_license" },
  { code: "OPR-100012", label_en: "Customer Entertainment / Gifts", label_th: "ค่าเลี้ยงรับรองลูกค้า/ของขวัญ", kind: "amount" },
  { code: "OPR-100013", label_en: "Overhead Cost (3 / 5 / 7 / 9 / 15 %)", label_th: "Overhead Cost", kind: "auto_overhead" },
];

export const OPEX_CATEGORIES = OPR_ROWS.map((r) => ({
  code: r.code, label_en: r.label_en, label_th: r.label_th,
  kind: r.kind === "amount" ? "amount" : r.kind === "rate_of_capex" ? "pct_of_otc" : "pct_of_revenue",
}));

export function emptyLine(line_type: LineType, seq: number): EstimateLine {
  return {
    line_type, seq, category: null, supplier: null, item_code: null, item_description: null,
    unit: null, quantity: 0, unit_price_msrp: 0, discount_pct: 0, cost_price: 0, sell_price: 0,
    currency: "THB", fx_rate: 1, amount_thb: 0, remark: null, warranty_years: null,
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

function overheadRate(header: EstimateHeader): number {
  if (typeof header.overhead_rate === "number") return header.overhead_rate;
  return OVERHEAD_RATE[header.overhead_type ?? "normal_5"] ?? 0.05;
}

export function computeOprAmounts(
  header: EstimateHeader, otcLines: EstimateLine[], mrcLines: EstimateLine[],
  manualAmounts: Record<string, number>, overrides?: Partial<Record<string, number>>,
): Record<string, number> {
  const total_otc_cost = otcLines.reduce((a, l) => a + (l.cost_price || 0) * (l.quantity || 0) * (l.fx_rate || 1), 0);
  const total_otc = otcLines.reduce((a, l) => a + (l.amount_thb || 0), 0);
  const total_mrc = mrcLines.reduce((a, l) => a + (l.amount_thb || 0), 0);
  const term = Math.max(1, header.contract_term_months || 12);
  const revenue = total_otc + total_mrc * term;
  const revenueVat = revenue * (1 + VAT_RATE);
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
      case "amount": out[r.code] = manualAmounts[r.code] ?? 0; break;
      case "rate_of_capex": { const rate = manualAmounts[r.code] ?? 0; out[r.code] = rate * total_otc_cost; break; }
      case "auto_interest": out[r.code] = total_otc_cost * 0.01 * interest_months; break;
      case "auto_bidbond": out[r.code] = revenueVat * BOND_SIZE_PCT * BOND_FEE_PCT * bid_periods; break;
      case "auto_perfbond": out[r.code] = revenueVat * BOND_SIZE_PCT * BOND_FEE_PCT * term; break;
      case "auto_revenue": out[r.code] = (r.code === "OPR-100010" ? mkt_rate : (r.rate ?? 0)) * revenue; break;
      case "auto_overhead": out[r.code] = oh_rate * revenue; break;
    }
    out[r.code] = round2(out[r.code]);
  }
  return out;
}

export function sumInstallPm(lines: EstimateLine[], type: "install" | "pmcm"): number {
  return lines.filter((l) => l.line_type === type).reduce((a, l) => a + (l.amount_thb || 0), 0);
}

// ---- Tier-2: monthly discounted cash-flow (workbook sheet "4) CF") ----
export type Cashflow = {
  net_profit_npv: number;   // NPV(disc/12, cashflow-with-OH)  (Excel C14)
  margin_npv: number;       // net_profit_npv / total_revenue   (Excel C13)
  payback_months: number;   // fractional month cumulative(with-OH) >= 0 (Excel C12); Infinity if never
  total_revenue: number;
  monthly_cf_with_oh: number[];
};

/** Faithful monthly cash flow. opr = result of computeOprAmounts (with install/pmcm overrides). */
export function computeCashflow(
  header: EstimateHeader,
  opr: Record<string, number>,
  sums: { otcSale: number; mrcSalePerMonth: number; mrcCostPerMonth: number; investmentCost: number },
): Cashflow {
  const term = Math.max(1, header.contract_term_months || 12);
  const mktRate = typeof header.marketing_rate === "number" ? header.marketing_rate : DEFAULT_MARKETING_RATE;
  const nbtcRate = header.telecom_license_enabled ? 0.02 : 0;
  const ohRate = overheadRate(header);
  const annual = typeof header.discount_rate_annual === "number" ? header.discount_rate_annual : DEFAULT_DISCOUNT_RATE;
  const monthlyDisc = annual / 12; // Excel NPV(rate.discount/12, ...)

  // One-time CAPEX (month 1): investment cost + OPR 1,2,3,4,6,7,8,9
  const capexMonth1 = sums.investmentCost
    + (opr["OPR-100001"] || 0) + (opr["OPR-100002"] || 0) + (opr["OPR-100003"] || 0)
    + (opr["OPR-100004"] || 0) + (opr["OPR-100006"] || 0) + (opr["OPR-100007"] || 0)
    + (opr["OPR-100008"] || 0) + (opr["OPR-100009"] || 0);
  const entertainment = opr["OPR-100012"] || 0;        // month 1
  const onsitePerMonth = (opr["OPR-100005"] || 0) / term; // OPR5 spread evenly

  const cfWithOh: number[] = [];
  const cfNoOh: number[] = [];
  let totalRevenue = 0;
  for (let m = 1; m <= term; m++) {
    const revenue = (m === 1 ? sums.otcSale : 0) + sums.mrcSalePerMonth;
    const opex = revenue * mktRate + revenue * nbtcRate + (m === 1 ? entertainment : 0)
      + sums.mrcCostPerMonth + onsitePerMonth;
    const overhead = revenue * ohRate;
    const capex = m === 1 ? capexMonth1 : 0;
    totalRevenue += revenue;
    cfNoOh.push(revenue - opex - capex);
    cfWithOh.push(revenue - opex - overhead - capex);
  }

  let npv = 0;
  for (let m = 1; m <= term; m++) npv += cfWithOh[m - 1] / Math.pow(1 + monthlyDisc, m);

  // Payback: fractional month where cumulative cf-with-OH first >= 0
  let cum = 0, prevCum = 0, payback = Infinity;
  for (let m = 1; m <= term; m++) {
    prevCum = cum;
    cum += cfWithOh[m - 1];
    if (cum >= 0) {
      const flow = cfWithOh[m - 1];
      payback = flow > 0 ? (m - 1) + (-prevCum) / flow : m - 1;
      break;
    }
  }

  return {
    net_profit_npv: round2(npv),
    margin_npv: totalRevenue > 0 ? round4(npv / totalRevenue) : 0,
    payback_months: isFinite(payback) ? round2(Math.max(0, payback)) : Infinity,
    total_revenue: round2(totalRevenue),
    monthly_cf_with_oh: cfWithOh.map(round2),
  };
}

export type Totals = {
  total_otc: number; total_mrc: number; total_tcv: number;
  total_cogs: number; total_opex: number;
  total_otc_cost: number; total_mrc_cost: number;
  revenue_otc: number; revenue_mrc: number;
  project_value_incl_vat: number;
  gp_thb: number; gp_pct: number;
  np_thb: number; np_pct: number;          // np = discounted net profit (NPV); np_pct = NPV margin (routing)
  payback_months: number; npv_thb: number;  // npv_thb === np_thb (Excel net profit IS the NPV)
  opr: Record<string, number>;
  cashflow: Cashflow;
};

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

  // Undiscounted gross profit (P&L breakdown reference)
  const gp_thb = total_tcv - total_cogs - opexExOverhead;
  const gp_pct = total_tcv > 0 ? gp_thb / total_tcv : 0;

  // Tier-2: discounted net profit / margin / payback (the routing figures)
  const cashflow = computeCashflow(header, opr, {
    otcSale: total_otc,
    mrcSalePerMonth: total_mrc,
    mrcCostPerMonth: total_mrc_cost,
    investmentCost: total_otc_cost,
  });

  return {
    total_otc: round2(total_otc), total_mrc: round2(total_mrc), total_tcv: round2(total_tcv),
    total_cogs: round2(total_cogs), total_opex: round2(total_opex),
    total_otc_cost: round2(total_otc_cost), total_mrc_cost: round2(total_mrc_cost),
    revenue_otc: round2(revenue_otc), revenue_mrc: round2(revenue_mrc),
    project_value_incl_vat: round2(project_value_incl_vat),
    gp_thb: round2(gp_thb), gp_pct: round4(gp_pct),
    np_thb: cashflow.net_profit_npv, np_pct: cashflow.margin_npv,
    payback_months: isFinite(cashflow.payback_months) ? cashflow.payback_months : 0,
    npv_thb: cashflow.net_profit_npv,
    opr, cashflow,
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
