# Estimated Cost Sheet 2

This project is a comprehensive, interactive web-based cost estimation tool (Spreadsheet Application) designed to calculate and summarize project costs across multiple domains.

## 📌 Project Overview
The application consists of 9 main tabs, functioning as an interconnected spreadsheet:
1. **Header**: Project metadata and basic details.
2. **Service**: Service definitions and selection.
3. **Investment**: Capital expenditure (CAPEX) calculations.
4. **Operation**: Operating expenses (OPEX), automatically linking base costs from Investment and Install tabs.
5. **Monthly**: Monthly Recurring Costs (MRC) and NPV (Net Present Value) Calculator.
6. **Install/PMCM**: Detailed installation and project management costs.
7. **Summary**: Project overview and financial summaries.
8. **Approval**: Approval workflows and signatures.
9. **Quotation**: Final output for quotation generation.

## 🏗️ Architecture & Tech Stack
- **Core Stack**: Vanilla HTML5, Vanilla JavaScript, and plain CSS.
- **Single File Structure**: Currently, the entire application (HTML layout, CSS styling, and JS logic) is contained within a single file: `estimated_cost_sheet.html`.
- **Styling**: Uses **"Standard Theme V2"**, a custom CSS design system leveraging CSS variables (`--primary`, `--border`, etc.) and modern CSS Grid architectures (`.data-table`, `.kpi-grid`, `.opr-row`). **Do not use TailwindCSS.**

## ⚙️ Key Mechanisms
1. **Auto-Save & State Management**: 
   - The application automatically tracks form changes via `markDirty()`.
   - The `doSave()` function saves data to `localStorage` (`est_form_draft`).
   - The Save button visually updates to "✔ Saved" and grays out until new edits are made.
2. **Inter-Tab Linking (Auto-link)**:
   - Values from specific tabs feed directly into others. 
   - Example: Values from **Tab 6 (Install/PMCM)** automatically update the relevant rows in **Tab 4 (Operation Cost)**.
3. **KPI Grids**:
   - Every tab features a `.kpi-grid` at the absolute top of the tab content to immediately display the most critical metrics to the user before they scroll through the data tables.

## 🚀 How to Run
Simply open `estimated_cost_sheet.html` in any modern web browser. No build steps or server required.
