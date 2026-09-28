// BATCH39-MARKER stipends-screen-tests
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { YearStrip, SheetRow, PaymentForm, CandidateRow, RecipientForm, RecipientRow } from "../src/sections/StipendsSection.jsx";
import { MyStipendCard } from "../src/sections/MyStipend.jsx";
import { visibleMoreFeatures } from "../src/sections/MoreSection.jsx";

const noop = () => {};

describe("the year strip", () => {
  it("shows planned, committed and paid", () => {
    const out = renderToStaticMarkup(<YearStrip year={2026} summary={{ has_budget: true, planned_kobo: 100000000, committed_kobo: 60000000, paid_kobo: 20000000 }} />);
    expect(out).toContain("₦1,000,000");
    expect(out).toContain("₦600,000");
    expect(out).toContain("₦200,000");
  });
  it("warns when the list commits more than the budget", () => {
    const out = renderToStaticMarkup(<YearStrip year={2026} summary={{ has_budget: true, planned_kobo: 100, committed_kobo: 300, paid_kobo: 0 }} />);
    expect(out).toContain("more than the 2026 budget");
  });
  it("says so when stipends are not budgeted", () => {
    const out = renderToStaticMarkup(<YearStrip year={2026} summary={{ has_budget: false, planned_kobo: 0, committed_kobo: 300, paid_kobo: 0 }} />);
    expect(out).toContain("Not budgeted");
    expect(out).toContain("no Stipends line");
  });
});

describe("a row on the month's sheet", () => {
  const row = { recipient_id: "r", recipient_name: "Rita RC", role_label: "Regional Coordinator, Benin", chapter_name: "Benin", monthly_kobo: 3000000, payment_id: null, can_act: true };
  it("offers to record a payment when unpaid and the viewer may act", () => {
    const out = renderToStaticMarkup(<SheetRow row={row} onRecord={noop} onVoid={noop} />);
    expect(out).toContain("Not yet paid");
    expect(out).toContain("Record payment");
    expect(out).toContain("₦30,000");
  });
  it("shows the payment and offers a void once paid", () => {
    const paid = { ...row, payment_id: "p", paid_kobo: 3000000, paid_on: "2026-09-27", payment_ref: "TRF-1" };
    const out = renderToStaticMarkup(<SheetRow row={paid} onRecord={noop} onVoid={noop} />);
    expect(out).toContain(">Paid<");
    expect(out).toContain("TRF-1");
    expect(out).toContain("Void");
  });
  it("offers nothing to someone who may not act on it", () => {
    const out = renderToStaticMarkup(<SheetRow row={{ ...row, can_act: false }} onRecord={noop} onVoid={noop} />);
    expect(out).not.toContain("Record payment");
    expect(out).not.toContain("Void");
  });
});

describe("the payment form", () => {
  it("starts with the monthly rate and today", () => {
    const out = renderToStaticMarkup(<PaymentForm row={{ recipient_name: "Rita RC", monthly_kobo: 3000000 }} month="2026-09" saving={false} onSave={noop} onCancel={noop} today="2026-09-28" />);
    expect(out).toContain('value="30000"');
    expect(out).toContain('value="2026-09-28"');
    expect(out).toContain("September 2026");
    expect(out).toContain("Never an account number");
  });
});

describe("adding and changing", () => {
  it("lets a free candidate be chosen, and says why another cannot", () => {
    expect(renderToStaticMarkup(<CandidateRow c={{ full_name: "Auchi Coordinator", role: "RC", seats: [], chapter_name: "Auchi", on_list: false, can_act: true }} onPick={noop} />)).toContain("Choose");
    expect(renderToStaticMarkup(<CandidateRow c={{ full_name: "Rita RC", role: "RC", seats: [], on_list: true, can_act: true }} onPick={noop} />)).toContain("Already on the list");
    expect(renderToStaticMarkup(<CandidateRow c={{ full_name: "Femi", role: "TM", seats: ["FIN"], on_list: false, can_act: false }} onPick={noop} />)).toContain("can&#x27;t add yourself");
  });
  it("prefills the label from the chosen person's seat", () => {
    const out = renderToStaticMarkup(<RecipientForm candidate={{ profile_id: "p", full_name: "Tobi", role: "TM", seats: ["SEC"] }} saving={false} onSave={noop} onCancel={noop} today="2026-09-28" />);
    expect(out).toContain("Add Tobi");
    expect(out).toContain('value="National Secretary"');
    expect(out).toContain('value="2026-09"');
    expect(out).toContain("Add to the list");
  });
  it("prefills a change with the current entry", () => {
    const r = { recipient_id: "r", recipient_name: "Rita RC", role_label: "Regional Coordinator, Benin", monthly_kobo: 3000000, start_month: "2026-07-01", end_month: null };
    const out = renderToStaticMarkup(<RecipientForm recipient={r} saving={false} onSave={noop} onCancel={noop} />);
    expect(out).toContain("Change Rita RC");
    expect(out).toContain('value="30000"');
    expect(out).toContain('value="2026-07"');
  });
  it("shows an entry with its span, last payment and actions", () => {
    const r = { recipient_id: "r", recipient_name: "Rita RC", role_label: "Regional Coordinator, Benin", monthly_kobo: 3000000, start_month: "2026-07-01", end_month: null, last_paid_month: "2026-08-01", can_act: true };
    const out = renderToStaticMarkup(<RecipientRow r={r} currentMonth="2026-09" onEdit={noop} onEnd={noop} />);
    expect(out).toContain("From July 2026");
    expect(out).toContain("Last paid: August 2026");
    expect(out).toContain("Change");
    expect(out).toContain(">End<");
    const ended = renderToStaticMarkup(<RecipientRow r={{ ...r, end_month: "2026-08-01", can_act: false }} currentMonth="2026-09" onEdit={noop} onEnd={noop} />);
    expect(ended).toContain("Ended");
    expect(ended).not.toContain("Change");
  });
});

describe("your own stipend inside Finance", () => {
  it("shows the rate and the months paid", () => {
    const out = renderToStaticMarkup(<MyStipendCard
      entry={{ monthly_kobo: 3000000, role_label: "Regional Coordinator, Benin", start_month: "2026-07-01", end_month: null }}
      payments={[{ id: "a", month: "2026-08-01", amount_kobo: 3000000, paid_on: "2026-08-30", payment_ref: "TRF-1", status: "paid" },
                 { id: "b", month: "2026-07-01", amount_kobo: 3000000, paid_on: "2026-07-30", payment_ref: "TRF-0", status: "voided" }]} />);
    expect(out).toContain("Your stipend");
    expect(out).toContain("₦30,000");
    expect(out).toContain("August 2026");
    expect(out).not.toContain("TRF-0");
  });
  it("draws nothing for someone not on the list", () => {
    expect(renderToStaticMarkup(<MyStipendCard entry={null} payments={[]} />)).toBe("");
  });
});

describe("the card in the More grid", () => {
  const card = (who) => visibleMoreFeatures(who).find((f) => f.id === "stipends");
  it("is shown to the NC, the Financial Secretary and the Treasurer", () => {
    for (const who of [
      { role: "NC", is_admin: false, portfolios: [] },
      { role: "TM", is_admin: false, portfolios: ["FIN"] },
      { role: "TM", is_admin: false, portfolios: ["TREAS"] },
    ]) expect(card(who)).toBeTruthy();
  });
  it("is hidden from the Deputy, a coordinator, a member and a plain admin", () => {
    for (const who of [
      { role: "TM", is_admin: false, portfolios: ["DNC"] },
      { role: "RC", is_admin: false, portfolios: [] },
      { role: "TM", is_admin: false, portfolios: ["SEC"] },
      { role: "TM", is_admin: true, portfolios: [] },
    ]) expect(card(who)).toBeFalsy();
  });
});
