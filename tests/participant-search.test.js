// BATCH36-MARKER participant-search-tests
import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { renderToString } from "react-dom/server";
import { createElement } from "react";
import {
  cleanNeedle, chapterIdsMatching, orFilter, pageRange,
  participantListQuery, serverPaged, PAGE_SIZE, LIST_COLUMNS,
} from "../src/lib/participantSearch.js";
import { ShowMore } from "../src/components/ShowMore.jsx";

const BENIN = "588aebd8-456b-4a26-9ffd-1f86a782ec2c";
const LAGOS = "f08b77be-a7c3-4ba2-9918-9b03fbb2a034";
const chapters = [{ id: BENIN, name: "Benin" }, { id: LAGOS, name: "Lagos" }];

describe("cleanNeedle", () => {
  it("keeps ordinary names, schools and classes as typed", () => {
    expect(cleanNeedle("Chioma Okafor")).toBe("Chioma Okafor");
    expect(cleanNeedle("St. Maria Goretti")).toBe("St. Maria Goretti");
    expect(cleanNeedle("SS2")).toBe("SS2");
  });
  it("drops filter syntax and wildcards so a search cannot change the filter", () => {
    expect(cleanNeedle("a,b")).toBe("a b");
    expect(cleanNeedle("x) or (id")).toBe("x or id");
    expect(cleanNeedle('100% "sure"')).toBe("100 sure");
    expect(cleanNeedle("under_score*star:colon\\slash")).toBe("under score star colon slash");
    expect(cleanNeedle("O'Brien")).toBe("O Brien");
  });
  it("trims, collapses spaces, and caps the length", () => {
    expect(cleanNeedle("   Emeka    Eze  ")).toBe("Emeka Eze");
    expect(cleanNeedle("x".repeat(200))).toHaveLength(60);
    expect(cleanNeedle(null)).toBe("");
    expect(cleanNeedle(undefined)).toBe("");
  });
});

describe("chapterIdsMatching", () => {
  it("matches chapter names without caring about case", () => {
    expect(chapterIdsMatching(chapters, "ben")).toEqual([BENIN]);
    expect(chapterIdsMatching(chapters, "LAGOS")).toEqual([LAGOS]);
  });
  it("matches nothing for a blank search or no chapters", () => {
    expect(chapterIdsMatching(chapters, "")).toEqual([]);
    expect(chapterIdsMatching(null, "benin")).toEqual([]);
  });
});

describe("orFilter", () => {
  it("searches name, school and class", () => {
    expect(orFilter("okafor", [])).toBe("full_name.ilike.%okafor%,school.ilike.%okafor%,class_level.ilike.%okafor%");
  });
  it("adds the matching chapters", () => {
    expect(orFilter("benin", [BENIN])).toContain(`chapter_id.in.(${BENIN})`);
  });
  it("refuses anything that is not a chapter id", () => {
    expect(orFilter("x", ["not-an-id", BENIN])).toBe(
      `full_name.ilike.%x%,school.ilike.%x%,class_level.ilike.%x%,chapter_id.in.(${BENIN})`);
  });
  it("is empty when there is nothing to search for", () => {
    expect(orFilter("  ", [BENIN])).toBe("");
  });
});

describe("pageRange", () => {
  it("counts pages from zero", () => {
    expect(pageRange(0)).toEqual([0, PAGE_SIZE - 1]);
    expect(pageRange(2)).toEqual([2 * PAGE_SIZE, 3 * PAGE_SIZE - 1]);
  });
  it("never goes negative", () => {
    expect(pageRange(-3)).toEqual([0, PAGE_SIZE - 1]);
  });
});

// A stand-in for supabase.from("participants") that writes down each call.
function recorder() {
  const calls = [];
  const b = new Proxy({}, {
    get: (_, name) => (...args) => { calls.push([name, ...args]); return b; },
  });
  return { b, calls };
}

describe("participantListQuery", () => {
  it("asks for one page, a total, and a stable order", () => {
    const { b, calls } = recorder();
    participantListQuery(b, { needle: "", stage: "", chapters, pageIndex: 0 });
    expect(calls).toEqual([
      ["select", LIST_COLUMNS, { count: "exact" }],
      ["order", "full_name"],
      ["order", "id"],
      ["range", 0, PAGE_SIZE - 1],
    ]);
  });
  it("adds the search and the stage when given", () => {
    const { b, calls } = recorder();
    participantListQuery(b, { needle: "benin", stage: "Grow", chapters, pageIndex: 1 });
    expect(calls.find((c) => c[0] === "or")[1]).toContain(`chapter_id.in.(${BENIN})`);
    expect(calls).toContainEqual(["eq", "stage", "Grow"]);
    expect(calls).toContainEqual(["range", PAGE_SIZE, 2 * PAGE_SIZE - 1]);
  });
  it("cleans the search before it reaches the filter", () => {
    const { b, calls } = recorder();
    participantListQuery(b, { needle: "a),id.eq.(x", chapters: [] });
    const or = calls.find((c) => c[0] === "or")[1];
    expect(or).not.toMatch(/[()]/);
    expect(or.split(",")).toHaveLength(3);
  });
});

// The real Supabase client, with the network swapped for a recorder, so
// this checks the request that would actually leave the phone.
describe("the request the Supabase client sends", () => {
  async function sent(opts) {
    let seen;
    const fake = async (url, init) => {
      seen = { url: decodeURIComponent(String(url)), headers: new Headers(init?.headers) };
      return new Response("[]", { status: 200, headers: { "Content-Type": "application/json", "Content-Range": "0-0/0" } });
    };
    const client = createClient("https://example.supabase.co", "public-key", { global: { fetch: fake } });
    await participantListQuery(client.from("participants"), opts);
    return seen;
  }

  it("filters on the server with ilike across the three columns and the chapter", async () => {
    const { url } = await sent({ needle: "benin", stage: "", chapters, pageIndex: 0 });
    expect(url).toContain(`or=(full_name.ilike.%benin%,school.ilike.%benin%,class_level.ilike.%benin%,chapter_id.in.(${BENIN}))`);
  });

  it("asks for a page and an exact total", async () => {
    const { url, headers } = await sent({ needle: "", stage: "Commit", chapters, pageIndex: 3 });
    expect(url).toContain("stage=eq.Commit");
    expect(url).toContain(`offset=${3 * PAGE_SIZE}`);
    expect(url).toContain(`limit=${PAGE_SIZE}`);
    expect(url).toContain("order=full_name.asc,id.asc");
    expect(headers.get("prefer")).toContain("count=exact");
  });
});

describe("serverPaged and the show-more control", () => {
  const text = (el) => renderToString(el).replace(/<!-- -->/g, "");
  it("offers the next page and never 'show all'", () => {
    const p = serverPaged({ loaded: 50, total: 30000, onMore: () => {} });
    expect(p).toMatchObject({ total: 30000, remaining: 29950, add: PAGE_SIZE, showAll: null });
    const html = text(createElement(ShowMore, { paged: p, noun: "more participants" }));
    expect(html).toContain(`Show ${PAGE_SIZE} more participants`);
    expect(html).toContain("50 of 30000 shown");
    expect(html).not.toContain("show all");
  });
  it("disappears once everything is loaded", () => {
    const p = serverPaged({ loaded: 12, total: 12, onMore: () => {} });
    expect(renderToString(createElement(ShowMore, { paged: p }))).toBe("");
  });
  it("shows it is working while the next page loads", () => {
    const p = { ...serverPaged({ loaded: 50, total: 90, onMore: () => {} }), busy: true };
    expect(text(createElement(ShowMore, { paged: p }))).toContain("Loading…");
  });
});
