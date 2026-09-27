// BATCH34-MARKER donations-screen
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DonationRow, DonationForm, DonorTable } from "../src/sections/DonationsSection.jsx";
import { visibleMoreFeatures } from "../src/sections/MoreSection.jsx";

const noop = () => {};
const gift = (over = {}) => ({
  id: "d1", donor_name: "Mrs Ade", amount_kobo: 15000000, received_on: "2026-09-20", method: "transfer",
  reference: "TRF-1", campaign: "year_end", designation: "general", restricted_to: null,
  acknowledged: false, status: "active", void_reason: null, ...over,
});
const row = (d, canManage) => renderToStaticMarkup(<DonationRow d={d} canManage={canManage} onCorrect={noop} onAcknowledge={noop} onVoid={noop} />);

describe("a donation row", () => {
  it("shows the donor, amount, method and campaign", () => {
    const out = row(gift(), true);
    expect(out).toContain("Mrs Ade");
    expect(out).toContain("₦150,000");
    expect(out).toContain("Bank transfer");
    expect(out).toContain("Year-end campaign");
  });
  it("offers a manager correct, acknowledge and void on an active unacknowledged gift", () => {
    const out = row(gift(), true);
    for (const b of ["Correct", "Mark acknowledged", "Void"]) expect(out).toContain(">" + b + "<");
  });
  it("drops the acknowledge button once acknowledged", () => {
    const out = row(gift({ acknowledged: true }), true);
    expect(out).toContain("Acknowledged");
    expect(out).not.toContain(">Mark acknowledged<");
  });
  it("offers a reader no buttons", () => {
    const out = row(gift(), false);
    for (const b of ["Correct", "Void", "Mark acknowledged"]) expect(out).not.toContain(">" + b + "<");
  });
  it("shows a voided gift struck through with its reason and no buttons", () => {
    const out = row(gift({ status: "voided", void_reason: "Never arrived" }), true);
    expect(out).toContain("Voided");
    expect(out).toContain("Never arrived");
    for (const b of ["Correct", "Void"]) expect(out).not.toContain(">" + b + "<");
  });
  it("shows what a restricted gift is restricted to", () => {
    expect(row(gift({ designation: "restricted", restricted_to: "Scholarships only" }), false)).toContain("Scholarships only");
  });
});

describe("the donation form", () => {
  it("shows the restricted-to field only for a restricted gift", () => {
    const g = { id: "d1", donor_name: "X", amount_kobo: 100, received_on: "2026-09-01", method: "cash", designation: "restricted", restricted_to: "Books" };
    const out = renderToStaticMarkup(<DonationForm donation={g} donors={[]} saving={false} onSave={noop} onCancel={noop} />);
    expect(out).toContain("Restricted to");
    expect(out).toContain("Save correction");
  });
  it("labels a new gift record button", () => {
    expect(renderToStaticMarkup(<DonationForm donors={[]} saving={false} onSave={noop} onCancel={noop} />)).toContain("Record gift");
  });
});

describe("the by-donor table", () => {
  it("shows each donor's giving and tier", () => {
    const rows = [{ donor_id: "a", donor_name: "Mrs Ade", gifts: 2, total_kobo: 18000000, tier: "partner", acknowledged_all: true }];
    const out = renderToStaticMarkup(<DonorTable rows={rows} />);
    expect(out).toContain("Mrs Ade");
    expect(out).toContain("₦180,000");
    expect(out).toContain("Partner");
  });
  it("says so when there is nothing", () => {
    expect(renderToStaticMarkup(<DonorTable rows={[]} />)).toContain("No giving recorded");
  });
});

describe("the card in the More grid", () => {
  const donations = (who) => visibleMoreFeatures(who).find((f) => f.id === "donations");
  const nc = { role: "NC", is_admin: false, portfolios: [] };
  const fin = { role: "TM", is_admin: false, portfolios: ["FIN"] };
  const dnc = { role: "TM", is_admin: false, portfolios: ["DNC"] };
  const treas = { role: "TM", is_admin: false, portfolios: ["TREAS"] };
  const rc = { role: "RC", chapter_id: "ch", is_admin: false, portfolios: [] };
  const member = { role: "TM", is_admin: false, portfolios: [] };
  const admin = { role: "TM", is_admin: true, portfolios: [] };

  it("is shown to the NC, the Financial Secretary, the Deputy and the Treasurer", () => {
    for (const who of [nc, fin, dnc, treas]) expect(donations(who)).toBeTruthy();
  });
  it("is hidden from a coordinator, a plain member and a plain admin", () => {
    for (const who of [rc, member, admin]) expect(donations(who)).toBeFalsy();
  });
});
