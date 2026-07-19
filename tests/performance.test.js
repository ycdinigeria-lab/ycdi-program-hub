import { describe, it, expect } from "vitest";
import { nextStep, PAGE } from "../src/lib/paging.js";
import { fitWithin, shouldCompress, jpegName, MAX_EDGE } from "../src/lib/imageCompress.js";

describe("paging window", () => {
  it("offers a full page when there is plenty left", () => {
    expect(nextStep(500, 40)).toEqual({ remaining: 460, add: 40 });
  });

  it("offers only what is left at the end", () => {
    expect(nextStep(50, 40)).toEqual({ remaining: 10, add: 10 });
  });

  it("offers nothing once everything is shown", () => {
    expect(nextStep(12, 12)).toEqual({ remaining: 0, add: 0 });
  });

  it("never reports more shown than exist, which is what a stale window would do", () => {
    // A search narrowing 500 rows to 3 while the window still says 40.
    expect(nextStep(3, 40)).toEqual({ remaining: 0, add: 0 });
  });

  it("copes with an empty list", () => {
    expect(nextStep(0, 40)).toEqual({ remaining: 0, add: 0 });
  });

  it("copes with rubbish input rather than producing a negative button", () => {
    expect(nextStep(undefined, undefined)).toEqual({ remaining: 0, add: 0 });
    expect(nextStep(-5, -5)).toEqual({ remaining: 0, add: 0 });
  });

  it("uses a page size a phone can actually paint", () => {
    expect(PAGE).toBeLessThanOrEqual(50);
    expect(PAGE).toBeGreaterThan(0);
  });
});

describe("image sizing", () => {
  it("shrinks a phone photo to the long edge and keeps its shape", () => {
    const r = fitWithin(4032, 3024, 1280);
    expect(r.changed).toBe(true);
    expect(r.w).toBe(1280);
    expect(r.h).toBe(960);
    expect(Math.abs(r.w / r.h - 4032 / 3024)).toBeLessThan(0.01);
  });

  it("handles portrait as well as landscape", () => {
    const r = fitWithin(3024, 4032, 1280);
    expect(r.h).toBe(1280);
    expect(r.w).toBe(960);
  });

  it("leaves an already small image alone", () => {
    const r = fitWithin(300, 200, 1280);
    expect(r).toEqual({ w: 300, h: 200, changed: false });
  });

  it("never returns a zero dimension for an extreme shape", () => {
    const r = fitWithin(8000, 3, 1280);
    expect(r.w).toBe(1280);
    expect(r.h).toBeGreaterThanOrEqual(1);
  });

  it("returns nothing usable for a broken image rather than throwing", () => {
    expect(fitWithin(0, 0, 1280).w).toBe(0);
    expect(fitWithin(undefined, undefined, 1280).w).toBe(0);
  });
});

describe("what gets compressed", () => {
  const f = (type) => ({ type, name: "x" });

  it("compresses ordinary photos", () => {
    expect(shouldCompress(f("image/jpeg"))).toBe(true);
    expect(shouldCompress(f("image/png"))).toBe(true);
    expect(shouldCompress(f("image/webp"))).toBe(true);
    expect(shouldCompress(f("image/heic"))).toBe(true);
  });

  it("leaves GIFs alone so animation survives", () => {
    expect(shouldCompress(f("image/gif"))).toBe(false);
  });

  it("leaves SVG alone because rasterising it would make it worse", () => {
    expect(shouldCompress(f("image/svg+xml"))).toBe(false);
  });

  it("never touches a document, which is the one that would actually matter", () => {
    expect(shouldCompress(f("application/pdf"))).toBe(false);
    expect(shouldCompress(f("application/vnd.openxmlformats-officedocument.wordprocessingml.document"))).toBe(false);
    expect(shouldCompress(f("text/csv"))).toBe(false);
  });

  it("refuses anything it cannot identify", () => {
    expect(shouldCompress(null)).toBe(false);
    expect(shouldCompress({})).toBe(false);
    expect(shouldCompress({ type: 42 })).toBe(false);
  });
});

describe("renamed output", () => {
  it("swaps the extension", () => {
    expect(jpegName("IMG_4021.HEIC")).toBe("IMG_4021.jpg");
    expect(jpegName("grace.png")).toBe("grace.jpg");
  });

  it("copes with a name that has dots in it", () => {
    expect(jpegName("grace.adeyemi.photo.png")).toBe("grace.adeyemi.photo.jpg");
  });

  it("copes with no extension and no name at all", () => {
    expect(jpegName("photo")).toBe("photo.jpg");
    expect(jpegName("")).toBe("photo.jpg");
    expect(jpegName(undefined)).toBe("photo.jpg");
  });
});

describe("defaults", () => {
  it("keeps the long edge big enough to stay sharp on a retina screen", () => {
    // Directory photos draw at 56px and covers at 86px, so 1280 is
    // generous. It is set high on purpose because the same helper may be
    // reused for something larger later.
    expect(MAX_EDGE).toBeGreaterThanOrEqual(1000);
  });
});
