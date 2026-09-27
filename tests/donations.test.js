// BATCH34-MARKER donations-lib
import { describe, it, expect } from "vitest";
import {
  METHODS, METHOD_LABEL, CAMPAIGNS, CAMPAIGN_LABEL, TIER_LABEL, EVENT_WORD,
  donorTier, canManageDonations, canReadDonations, validateDonation, yearOnYear, formatNaira,
} from "../src/lib/donations.js";

describe("labels", () => {
  it("names every method, campaign, tier and event", () => {
    expect(METHOD_LABEL.transfer).toBe("Bank transfer");
    expect(CAMPAIGN_LABEL.year_end).toBe("Year-end campaign");
    expect(TIER_LABEL.champion).toBe("Champion");
    for (const k of ["donation_recorded", "donation_corrected", "donation_acknowledged", "donation_voided"]) expect(EVENT_WORD[k]).toBeTruthy();
    expect(METHODS.length).toBe(7);
    expect(CAMPAIGNS.map(([k]) => k)).toContain("back_to_school");
  });
});

describe("donor tier bands", () => {
  it("matches the published bands, in kobo", () => {
    expect(donorTier(1999999)).toBe("friend");     // ₦19,999.99
    expect(donorTier(2000000)).toBe("supporter");  // ₦20,000
    expect(donorTier(9999999)).toBe("supporter");  // ₦99,999.99
    expect(donorTier(10000000)).toBe("partner");   // ₦100,000
    expect(donorTier(49999999)).toBe("partner");   // ₦499,999.99
    expect(donorTier(50000000)).toBe("champion");  // ₦500,000
    expect(donorTier(0)).toBeNull();
  });
});

describe("who reaches donations", () => {
  const nc = { role: "NC", portfolios: [] };
  const fin = { role: "TM", portfolios: ["FIN"] };
  const dnc = { role: "TM", portfolios: ["DNC"] };
  const treas = { role: "TM", portfolios: ["TREAS"] };
  const member = { role: "TM", portfolios: [] };
  const admin = { role: "TM", is_admin: true, portfolios: [] };

  it("the Financial Secretary and the NC manage", () => {
    expect(canManageDonations(nc)).toBe(true);
    expect(canManageDonations(fin)).toBe(true);
  });
  it("the Deputy, the Treasurer, a member and an admin do not manage", () => {
    for (const who of [dnc, treas, member, admin]) expect(canManageDonations(who)).toBe(false);
  });
  it("the Deputy and the Treasurer read, but a member and an admin do not", () => {
    for (const who of [nc, fin, dnc, treas]) expect(canReadDonations(who)).toBe(true);
    for (const who of [member, admin]) expect(canReadDonations(who)).toBe(false);
  });
});

describe("the donation form", () => {
  const base = { donor_name: "Mrs Ade", amount: "150,000", received_on: "2026-09-20", method: "transfer", designation: "general" };
  it("turns naira into kobo and trims the name", () => {
    const r = validateDonation({ ...base, donor_name: "  Mrs Ade  " });
    expect(r.ok).toBe(true);
    expect(r.values.p_amount_kobo).toBe(15000000);
    expect(r.values.p_donor_name).toBe("Mrs Ade");
  });
  it("needs a donor name, a good amount, a date not in the future and a method", () => {
    expect(validateDonation({ ...base, donor_name: " " }).error).toMatch(/donor/i);
    expect(validateDonation({ ...base, amount: "0" }).ok).toBe(false);
    expect(validateDonation({ ...base, received_on: "2099-01-01" }).error).toMatch(/future/i);
    expect(validateDonation({ ...base, method: "" }).error).toMatch(/how it was given/i);
  });
  it("insists a restricted gift says what it is restricted to", () => {
    expect(validateDonation({ ...base, designation: "restricted", restricted_to: "" }).ok).toBe(false);
    expect(validateDonation({ ...base, designation: "restricted", restricted_to: "Scholarships" }).ok).toBe(true);
  });
  it("refuses a bank account number as a reference", () => {
    expect(validateDonation({ ...base, reference: "0123456789" }).ok).toBe(false);
    expect(validateDonation({ ...base, reference: "TRF-8891" }).ok).toBe(true);
  });
});

describe("year on year", () => {
  it("gives a signed percentage, or null when there is nothing to compare", () => {
    expect(yearOnYear(150, 100)).toBe(50);
    expect(yearOnYear(80, 100)).toBe(-20);
    expect(yearOnYear(100, 0)).toBeNull();
    expect(yearOnYear(100, null)).toBeNull();
  });
  it("formats naira like the rest of finance", () => {
    expect(formatNaira(15000000)).toBe("₦150,000");
  });
});
