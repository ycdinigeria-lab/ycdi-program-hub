// BATCH35-MARKER budget-screen
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { BudgetVsActual, LineRow, LineForm } from "../src/sections/AnnualBudgetSection.jsx";
import { visibleMoreFeatures } from "../src/sections/MoreSection.jsx";

const noop = () => {};

describe("plan against actuals", () => {
  const va = {
    planned_income_kobo: 5000000000, planned_expenditure_kobo: 1750000000,
    actual_income_kobo: 3500000000, actual_expenditure_kobo: 300000000,
  };
  it("shows both sides with planned and actual", () => {
    const out = renderToStaticMarkup(<BudgetVsActual va={va} />);
    expect(out).toContain("Income");
    expect(out).toContain("Expenditure");
    expect(out).toContain("₦35,000,000");   // actual income
    expect(out).toContain("₦50,000,000");   // planned income
    expect(out).toContain("70%");            // 3.5B of 5B
  });
});

describe("a budget line", () => {
  const line = { line_id: "l1", kind: "expenditure", category: "programmes", label: "Benin programmes", planned_kobo: 800000000, chapter_name: "Benin" };
  it("shows the label, category, chapter and amount", () => {
    const out = renderToStaticMarkup(<LineRow line={line} canEdit={false} onEdit={noop} onRemove={noop} />);
    expect(out).toContain("Benin programmes");
    expect(out).toContain("Programmes");
    expect(out).toContain("Benin");
    expect(out).toContain("₦8,000,000");
  });
  it("offers edit and remove only while editable", () => {
    expect(renderToStaticMarkup(<LineRow line={line} canEdit={true} onEdit={noop} onRemove={noop} />)).toContain(">Edit<");
    expect(renderToStaticMarkup(<LineRow line={line} canEdit={false} onEdit={noop} onRemove={noop} />)).not.toContain(">Edit<");
  });
  it("labels an organisation-wide line", () => {
    const org = { ...line, chapter_name: null };
    expect(renderToStaticMarkup(<LineRow line={org} canEdit={false} onEdit={noop} onRemove={noop} />)).toContain("organisation-wide");
  });
});

describe("the line form", () => {
  it("offers income and expenditure and an add button", () => {
    const out = renderToStaticMarkup(<LineForm chapters={[{ id: "c", name: "Benin" }]} saving={false} onSave={noop} onCancel={noop} />);
    expect(out).toContain("Add line");
    expect(out).toContain("Income");
    expect(out).toContain("Expenditure");
    expect(out).toContain("Organisation-wide");
  });
});

describe("the card in the More grid", () => {
  const budget = (who) => visibleMoreFeatures(who).find((f) => f.id === "annualbudget");
  const nc = { role: "NC", is_admin: false, portfolios: [] };
  const fin = { role: "TM", is_admin: false, portfolios: ["FIN"] };
  const treas = { role: "TM", is_admin: false, portfolios: ["TREAS"] };
  const dnc = { role: "TM", is_admin: false, portfolios: ["DNC"] };
  const rc = { role: "RC", chapter_id: "ch", is_admin: false, portfolios: [] };
  const member = { role: "TM", is_admin: false, portfolios: [] };
  const admin = { role: "TM", is_admin: true, portfolios: [] };

  it("is shown to the NC, the Financial Secretary, the Treasurer, the Deputy and a coordinator", () => {
    for (const who of [nc, fin, treas, dnc, rc]) expect(budget(who)).toBeTruthy();
  });
  it("is hidden from a plain member and a plain admin", () => {
    expect(budget(member)).toBeFalsy();
    expect(budget(admin)).toBeFalsy();
  });
});
