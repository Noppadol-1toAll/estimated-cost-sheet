import { describe, it, expect } from "vitest";
import {
  computeTotals,
  computeOprAmounts,
  recalcLine,
  OVERHEAD_RATE,
  type EstimateLine,
  type EstimateHeader,
} from "./estimateCalc";

// Helper: build a priced line (amount_thb via recalcLine)
function line(p: Partial<EstimateLine> & Pick<EstimateLine, "line_type">): EstimateLine {
  return recalcLine({
    line_type: p.line_type, seq: p.seq ?? 1, category: null, supplier: null,
    item_code: null, item_description: null, unit: null,
    quantity: p.quantity ?? 1, unit_price_msrp: p.unit_price_msrp ?? 0,
    discount_pct: 0, cost_price: p.cost_price ?? 0, sell_price: p.sell_price ?? 0,
    currency: "THB", fx_rate: p.fx_rate ?? 1, amount_thb: 0, remark: null,
    opex_code: p.opex_code ?? null,
  } as EstimateLine);
}

// Scenario A — anchors derived from Rev.2.4.7 workbook (docs/ECS-CALC-PARITY.md §5)
const headerA: EstimateHeader = {
  contract_term_months: 12,
  budget_thb: 0,
  bid_bond_enabled: true,
  bid_bond_months: 1,
  performance_bond_enabled: true,
  other_costs_enabled: false,
  telecom_license_enabled: true,
  overhead_type: "normal_5",
  credit_term_days: 30,       // = 1 month
  marketing_rate: 0.01,
  impl_duration_months: 2,
};
const otcA = [line({ line_type: "otc", cost_price: 100000, sell_price: 120000, quantity: 1 })];
const mrcA = [line({ line_type: "mrc", cost_price: 6000, sell_price: 10000, quantity: 1 })];

describe("OPR amounts — Scenario A anchors", () => {
  const opr = computeOprAmounts(headerA, otcA, mrcA, {}, {});
  it("marketing = rate × revenue = 1% × 240,000", () => expect(opr["OPR-100010"]).toBeCloseTo(2400, 2));
  it("telecom license = 2% × 240,000", () => expect(opr["OPR-100011"]).toBeCloseTo(4800, 2));
  it("overhead = 5% × 240,000", () => expect(opr["OPR-100013"]).toBeCloseTo(12000, 2));
  it("interest = capexCost × 1% × (2 − 1) months", () => expect(opr["OPR-100007"]).toBeCloseTo(1000, 2));
  it("bid bond FEE = 256,800 × 5% × 1% × 1", () => expect(opr["OPR-100008"]).toBeCloseTo(128.4, 2));
  it("perf bond FEE = 256,800 × 5% × 1% × 12", () => expect(opr["OPR-100009"]).toBeCloseTo(1540.8, 2));
});

describe("D1 regression — bonds are a fee, NOT 5% of revenue", () => {
  const opr = computeOprAmounts(headerA, otcA, mrcA, {}, {});
  it("bid bond must not equal 5% × revenue (12,000)", () => expect(opr["OPR-100008"]).not.toBeCloseTo(12000, 0));
  it("perf bond must not equal 5% × revenue (12,000)", () => expect(opr["OPR-100009"]).not.toBeCloseTo(12000, 0));
});

describe("totals", () => {
  const t = computeTotals(headerA, [...otcA, ...mrcA]);
  it("TCV = OTC + MRC×term = 240,000", () => expect(t.total_tcv).toBeCloseTo(240000, 2));
  it("project value incl VAT = 256,800", () => expect(t.project_value_incl_vat).toBeCloseTo(256800, 2));
});

describe("D2 marketing — per-service rate", () => {
  it("Zound 3% marketing on 240,000 = 7,200", () => {
    const opr = computeOprAmounts({ ...headerA, marketing_rate: 0.03 }, otcA, mrcA, {}, {});
    expect(opr["OPR-100010"]).toBeCloseTo(7200, 2);
  });
});

describe("D3 interest — zero when no install duration", () => {
  it("interest = 0 when impl_duration_months unset", () => {
    const opr = computeOprAmounts({ ...headerA, impl_duration_months: 0 }, otcA, mrcA, {}, {});
    expect(opr["OPR-100007"]).toBeCloseTo(0, 2);
  });
});

describe("D4 overhead tiers", () => {
  it("complex_15 = 15%", () => expect(OVERHEAD_RATE.complex_15).toBe(0.15));
  it("overhead uses 15% when selected", () => {
    const opr = computeOprAmounts({ ...headerA, overhead_type: "complex_15" }, otcA, mrcA, {}, {});
    expect(opr["OPR-100013"]).toBeCloseTo(36000, 2); // 15% × 240,000
  });
  it("overhead_rate override (from DB) wins over type", () => {
    const opr = computeOprAmounts({ ...headerA, overhead_rate: 0.07 }, otcA, mrcA, {}, {});
    expect(opr["OPR-100013"]).toBeCloseTo(16800, 2); // 7% × 240,000
  });
});

describe("install/PMCM feed OPR and are not double-counted in TCV", () => {
  const install = [line({ line_type: "install", sell_price: 5000, quantity: 2 })]; // 10,000
  const pmcm = [line({ line_type: "pmcm", sell_price: 3000, quantity: 1 })];       // 3,000
  const all = [...otcA, ...mrcA, ...install, ...pmcm];
  const t = computeTotals(headerA, all);
  it("OPR-100001 = install subtotal", () => expect(t.opr["OPR-100001"]).toBeCloseTo(10000, 2));
  it("OPR-100005 = pmcm subtotal", () => expect(t.opr["OPR-100005"]).toBeCloseTo(3000, 2));
  it("TCV still 240,000 (install/pmcm excluded from revenue)", () => expect(t.total_tcv).toBeCloseTo(240000, 2));
});

describe("disabled toggles zero out", () => {
  it("no bonds / no telecom → 0", () => {
    const opr = computeOprAmounts(
      { ...headerA, bid_bond_enabled: false, performance_bond_enabled: false, telecom_license_enabled: false },
      otcA, mrcA, {}, {},
    );
    expect(opr["OPR-100008"]).toBe(0);
    expect(opr["OPR-100009"]).toBe(0);
    expect(opr["OPR-100011"]).toBe(0);
  });
});
