// BATCH32-MARKER finance-lib
// The money arithmetic, the clock wording, who is offered which button,
// and what may be uploaded. Anything that touches a naira amount lives
// here so it can be proven without drawing a screen.
import { describe, it, expect } from "vitest";
import {
  formatNaira, parseNairaToKobo, koboToInput, todayLagos, daysBetween, dueInfo,
  canDecide, isOfficer, canReadAll, isChapterReader, checkReceiptFile, safeFileName,
  receiptPath, totals, MAX_CLAIM_KOBO, CATEGORIES, CATEGORY_LABEL, STATUS_WORD,
  actionsFor, ACTION_LABEL, EVENT_WORD,
} from "../src/lib/finance.js";

describe("formatNaira", () => {
  it("shows whole naira without a decimal point", () => {
    expect(formatNaira(3500000)).toBe("₦35,000");
    expect(formatNaira(100)).toBe("₦1");
    expect(formatNaira(0)).toBe("₦0");
  });
  it("shows kobo when there are some, always two digits", () => {
    expect(formatNaira(3500050)).toBe("₦35,000.50");
    expect(formatNaira(3500005)).toBe("₦35,000.05");
    expect(formatNaira(99)).toBe("₦0.99");
  });
  it("groups large amounts in threes", () => {
    expect(formatNaira(5000000000)).toBe("₦50,000,000");
    expect(formatNaira(123456789012)).toBe("₦1,234,567,890.12");
  });
  it("shows a negative remaining budget with its sign", () => {
    expect(formatNaira(-250000)).toBe("-₦2,500");
  });
  it("does not fall over on nothing", () => {
    expect(formatNaira(null)).toBe("₦0");
    expect(formatNaira(undefined)).toBe("₦0");
    expect(formatNaira("abc")).toBe("₦0");
  });
});

describe("parseNairaToKobo", () => {
  const ok = (s) => parseNairaToKobo(s);
  it("reads the ways people actually type an amount", () => {
    expect(ok("35000")).toEqual({ ok: true, kobo: 3500000 });
    expect(ok("35,000")).toEqual({ ok: true, kobo: 3500000 });
    expect(ok("₦35,000.50")).toEqual({ ok: true, kobo: 3500050 });
    expect(ok(" 35 000 ")).toEqual({ ok: true, kobo: 3500000 });
    expect(ok("NGN 1,200")).toEqual({ ok: true, kobo: 120000 });
    expect(ok("0.5")).toEqual({ ok: true, kobo: 50 });
    expect(ok("0.05")).toEqual({ ok: true, kobo: 5 });
    expect(ok("12.3")).toEqual({ ok: true, kobo: 1230 });
  });
  it("never rounds: more than two decimal places is refused", () => {
    expect(ok("10.005").ok).toBe(false);
    expect(ok("10.999").ok).toBe(false);
  });
  it("is exact where floating point would not be", () => {
    // 0.1 + 0.2 style traps: 1.15 * 100 is 114.99999999999999 in a float.
    expect(ok("1.15")).toEqual({ ok: true, kobo: 115 });
    expect(ok("4.35")).toEqual({ ok: true, kobo: 435 });
    expect(ok("19.99")).toEqual({ ok: true, kobo: 1999 });
    expect(ok("0.29")).toEqual({ ok: true, kobo: 29 });
  });
  it("refuses empty, zero, negative and non-numbers", () => {
    for (const bad of ["", "   ", "0", "0.00", "-500", "abc", "12abc", "1.2.3", "1e5", "٣٥٠٠"]) {
      expect(ok(bad).ok, bad).toBe(false);
    }
  });
  it("refuses an amount over the single-claim ceiling", () => {
    expect(ok("50000000").ok).toBe(true);
    expect(ok("50000000.01").ok).toBe(false);
    expect(ok("99999999999").ok).toBe(false);
  });
  it("gives a sentence a person can act on", () => {
    expect(ok("").error).toMatch(/enter the amount/i);
    expect(ok("10.005").error).toMatch(/two decimal/i);
    expect(ok("abc").error).toMatch(/numbers only/i);
  });
  it("round-trips with koboToInput", () => {
    for (const k of [1, 99, 100, 3500000, 3500050, 5000000000]) {
      expect(parseNairaToKobo(koboToInput(k))).toEqual({ ok: true, kobo: k });
    }
  });
  it("shares its ceiling with the database", () => {
    expect(MAX_CLAIM_KOBO).toBe(5000000000);
  });
});

describe("the clock", () => {
  it("counts calendar days without caring about time of day", () => {
    expect(daysBetween("2026-09-25", "2026-10-25")).toBe(30);
    expect(daysBetween("2026-12-31", "2027-01-01")).toBe(1);
    expect(daysBetween("2026-10-01", "2026-09-30")).toBe(-1);
    expect(daysBetween("2028-02-28", "2028-03-01")).toBe(2); // 2028 is a leap year
  });
  it("uses the Lagos date, not the machine's", () => {
    // 23:30 UTC on the 25th is already 00:30 on the 26th in Lagos.
    expect(todayLagos(new Date("2026-09-25T23:30:00Z"))).toBe("2026-09-26");
    expect(todayLagos(new Date("2026-09-25T22:59:00Z"))).toBe("2026-09-25");
  });
  it("only a claim waiting for a decision has a clock", () => {
    for (const status of ["draft", "returned", "approved", "paid", "rejected", "withdrawn"]) {
      expect(dueInfo({ status, due_by: "2026-10-01" }, "2026-09-25")).toBeNull();
    }
    expect(dueInfo({ status: "submitted", due_by: null }, "2026-09-25")).toBeNull();
    expect(dueInfo(null, "2026-09-25")).toBeNull();
  });
  it("says how long is left, and when it is late", () => {
    const at = (due) => dueInfo({ status: "submitted", due_by: due }, "2026-09-25");
    expect(at("2026-10-25")).toMatchObject({ level: "ok", text: "Due in 30 days" });
    expect(at("2026-10-02")).toMatchObject({ level: "soon", text: "Due in 7 days" });
    expect(at("2026-10-03")).toMatchObject({ level: "ok", text: "Due in 8 days" });
    expect(at("2026-09-26")).toMatchObject({ level: "soon", text: "Due in 1 day" });
    expect(at("2026-09-25")).toMatchObject({ level: "soon", text: "Due today" });
    expect(at("2026-09-24")).toMatchObject({ level: "late", text: "1 day overdue" });
    expect(at("2026-09-10")).toMatchObject({ level: "late", text: "15 days overdue" });
  });
});

describe("who is offered the decide buttons", () => {
  const claim = (over = {}) => ({ id: "c", claimant_id: "u-claimant", status: "submitted", ...over });
  const fin = { id: "u-fin", role: "TM", portfolios: ["FIN"] };
  const nc = { id: "u-nc", role: "NC", portfolios: [] };
  const treas = { id: "u-tr", role: "TM", portfolios: ["TREAS"] };
  const rc = { id: "u-rc", role: "RC", chapter_id: "ch", portfolios: [] };
  const member = { id: "u-tm", role: "TM", portfolios: [] };
  const admin = { id: "u-ad", role: "TM", is_admin: true, portfolios: [] };

  it("the Financial Secretary decides other people's claims", () => {
    expect(canDecide(fin, claim(), "u-fin")).toBe(true);
  });
  it("nobody decides their own", () => {
    expect(canDecide(fin, claim({ claimant_id: "u-fin" }), "u-fin")).toBe(false);
    expect(canDecide(nc, claim({ claimant_id: "u-nc" }), null)).toBe(false);
  });
  it("the National Coordinator decides only when the seat is empty, or the claim is the holder's own", () => {
    expect(canDecide(nc, claim(), "u-fin")).toBe(false);
    expect(canDecide(nc, claim(), null)).toBe(true);
    expect(canDecide(nc, claim({ claimant_id: "u-fin" }), "u-fin")).toBe(true);
  });
  it("the Treasurer, a coordinator, a member and an admin never decide", () => {
    for (const who of [treas, rc, member, admin]) expect(canDecide(who, claim(), "u-fin")).toBe(false);
  });
  it("only the officer revises a budget", () => {
    expect(isOfficer(fin, "u-fin")).toBe(true);
    expect(isOfficer(nc, "u-fin")).toBe(false);
    expect(isOfficer(nc, null)).toBe(true);
    for (const who of [treas, rc, member, admin]) expect(isOfficer(who, null)).toBe(false);
  });
  it("who reads everything, and who reads a chapter", () => {
    expect(canReadAll(nc)).toBe(true);
    expect(canReadAll(fin)).toBe(true);
    expect(canReadAll(treas)).toBe(true);
    for (const who of [rc, member, admin]) expect(canReadAll(who)).toBe(false);
    expect(isChapterReader(rc)).toBe(true);
    expect(isChapterReader({ role: "RC", chapter_id: null })).toBe(false);
    expect(isChapterReader(member)).toBe(false);
  });
});

describe("receipts", () => {
  const file = (type, size) => ({ type, size });
  it("accepts a photo or a PDF up to 5 MB", () => {
    for (const t of ["image/jpeg", "image/png", "image/webp", "application/pdf"]) {
      expect(checkReceiptFile(file(t, 1024))).toBeNull();
    }
    expect(checkReceiptFile(file("image/jpeg", 5 * 1024 * 1024))).toBeNull();
  });
  it("refuses other types, oversize and empty files, each with a reason", () => {
    expect(checkReceiptFile(file("application/zip", 100))).toMatch(/photo|PDF/);
    expect(checkReceiptFile(file("image/gif", 100))).toMatch(/photo|PDF/);
    expect(checkReceiptFile(file("image/jpeg", 5 * 1024 * 1024 + 1))).toMatch(/5 MB/);
    expect(checkReceiptFile(file("image/jpeg", 0))).toMatch(/empty/);
    expect(checkReceiptFile(null)).toMatch(/choose/i);
  });
  it("cleans a file name for a storage path", () => {
    expect(safeFileName("My Receipt (1).JPG")).toBe("My-Receipt-1.jpg");
    expect(safeFileName("../../etc/passwd")).toBe("passwd");
    expect(safeFileName("C:\\Users\\me\\taxi.pdf")).toBe("taxi.pdf");
    expect(safeFileName("")).toBe("receipt");
    expect(safeFileName("   ")).toBe("receipt");
    expect(safeFileName("résumé.pdf")).toMatch(/^r.*sum.*\.pdf$/);
    expect(safeFileName("a".repeat(200) + ".png").length).toBeLessThanOrEqual(66);
  });
  it("never lets a name climb out of the claim's folder", () => {
    for (const evil of ["../x.jpg", "..\\x.jpg", "a/b/c.jpg", "/abs.jpg"]) {
      expect(safeFileName(evil)).not.toMatch(/[\\/]/);
    }
  });
  it("puts the claim id first, which is what the storage rules read", () => {
    const p = receiptPath("11111111-2222-3333-4444-555555555555", "Taxi Receipt.png", "abc123");
    expect(p).toBe("11111111-2222-3333-4444-555555555555/abc123-Taxi-Receipt.png");
    expect(p.split("/")).toHaveLength(2);
  });
});

describe("totals and wording", () => {
  it("adds kobo by status without floating point", () => {
    const t = totals([
      { status: "paid", amount_kobo: 10 }, { status: "paid", amount_kobo: 20 },
      { status: "submitted", amount_kobo: 5 }, { status: "approved", amount_kobo: 7 },
    ]);
    expect(t.paid).toBe(30);
    expect(t.submitted).toBe(5);
    expect(t.approved).toBe(7);
    expect(t.draft).toBe(0);
    expect(totals(null).paid).toBe(0);
  });
  it("has a word for every status and a label for every category the database accepts", () => {
    for (const s of ["draft", "submitted", "returned", "approved", "paid", "rejected", "withdrawn"]) {
      expect(STATUS_WORD[s]).toBeTruthy();
    }
    expect(CATEGORIES.map(([k]) => k).sort()).toEqual(
      ["data_airtime", "honoraria_gifts", "materials", "other", "printing", "refreshments", "transport", "venue"]);
    expect(CATEGORY_LABEL.data_airtime).toBe("Data and airtime");
  });
});

describe("the buttons a claim offers", () => {
  const fin = { id: "u-fin", role: "TM", portfolios: ["FIN"] };
  const nc = { id: "u-nc", role: "NC", portfolios: [] };
  const owner = { id: "u-own", role: "TM", portfolios: [] };
  const treas = { id: "u-tr", role: "TM", portfolios: ["TREAS"] };
  const rc = { id: "u-rc", role: "RC", chapter_id: "ch", portfolios: [] };
  const admin = { id: "u-ad", role: "TM", is_admin: true, portfolios: [] };
  const c = (status, over = {}) => ({ id: "c", claimant_id: "u-own", status, ...over });

  it("the owner can mend and send up a draft or a returned claim", () => {
    for (const s of ["draft", "returned"]) {
      expect(actionsFor(owner, c(s), "u-fin")).toEqual(["edit", "submit", "withdraw"]);
    }
  });
  it("the owner can only withdraw while it waits, and nothing once it is decided", () => {
    expect(actionsFor(owner, c("submitted"), "u-fin")).toEqual(["withdraw"]);
    for (const s of ["approved", "paid", "rejected", "withdrawn"]) expect(actionsFor(owner, c(s), "u-fin")).toEqual([]);
  });
  it("the Financial Secretary decides a submitted claim and pays an approved one", () => {
    expect(actionsFor(fin, c("submitted"), "u-fin")).toEqual(["approve", "return", "decline"]);
    expect(actionsFor(fin, c("approved"), "u-fin")).toEqual(["markpaid"]);
    for (const s of ["draft", "returned", "paid", "rejected", "withdrawn"]) expect(actionsFor(fin, c(s), "u-fin")).toEqual([]);
  });
  it("the Financial Secretary is offered nothing on their own claim beyond the owner's buttons", () => {
    expect(actionsFor(fin, c("submitted", { claimant_id: "u-fin" }), "u-fin")).toEqual(["withdraw"]);
    expect(actionsFor(fin, c("approved", { claimant_id: "u-fin" }), "u-fin")).toEqual([]);
  });
  it("the National Coordinator is offered decisions only when the seat is empty or the claim is the holder's", () => {
    expect(actionsFor(nc, c("submitted"), "u-fin")).toEqual([]);
    expect(actionsFor(nc, c("submitted"), null)).toEqual(["approve", "return", "decline"]);
    expect(actionsFor(nc, c("submitted", { claimant_id: "u-fin" }), "u-fin")).toEqual(["approve", "return", "decline"]);
  });
  it("the Treasurer, a coordinator and an admin are offered nothing", () => {
    for (const who of [treas, rc, admin]) {
      for (const s of ["draft", "submitted", "returned", "approved", "paid"]) expect(actionsFor(who, c(s), "u-fin")).toEqual([]);
    }
  });
  it("every action has a label, and every event a word", () => {
    for (const a of ["edit", "submit", "withdraw", "approve", "return", "decline", "markpaid"]) expect(ACTION_LABEL[a]).toBeTruthy();
    for (const k of ["claim_submitted", "claim_returned", "claim_approved", "claim_rejected", "claim_paid", "claim_withdrawn", "budget_set", "budget_revised"]) {
      expect(EVENT_WORD[k]).toBeTruthy();
    }
  });
});
