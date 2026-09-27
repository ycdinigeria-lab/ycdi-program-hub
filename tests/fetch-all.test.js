// BATCH36-MARKER fetch-all-tests
import { describe, it, expect } from "vitest";
import { fetchAllRows, mergeById } from "../src/lib/fetchAll.js";

// A pretend table of `n` rows behind a server that never returns more
// than `cap` rows per request, the way Supabase's max-rows setting works.
function table(n, cap = 1000, { failAt = -1 } = {}) {
  const rows = Array.from({ length: n }, (_, i) => ({ id: "r" + i }));
  const asked = [];
  let built = 0;
  const makeQuery = () => {
    built++;
    return {
      range: async (from, to) => {
        asked.push([from, to]);
        if (asked.length - 1 === failAt) return { data: null, error: { message: "network" } };
        const end = Math.min(to + 1, from + cap, n);
        return { data: rows.slice(from, Math.max(from, end)), error: null };
      },
    };
  };
  return { makeQuery, asked, built: () => built };
}

describe("fetchAllRows", () => {
  it("reads past the 1,000-row mark that a single request stops at", async () => {
    const t = table(2500);
    const out = await fetchAllRows(t.makeQuery);
    expect(out.data).toHaveLength(2500);
    expect(new Set(out.data.map((r) => r.id)).size).toBe(2500);
    expect(out.truncated).toBe(false);
    expect(out.error).toBeNull();
  });

  it("stays complete when the server's limit is lower than the page size", async () => {
    const t = table(1234, 500);
    const out = await fetchAllRows(t.makeQuery);
    expect(out.data).toHaveLength(1234);
    expect(out.data[1233].id).toBe("r1233");
    expect(t.asked[1][0]).toBe(500); // carried on from where the short answer stopped
  });

  it("builds a fresh query for every request", async () => {
    const t = table(2100);
    await fetchAllRows(t.makeQuery);
    expect(t.built()).toBe(t.asked.length);
  });

  it("handles an empty table and an exact multiple of the page", async () => {
    expect((await fetchAllRows(table(0).makeQuery)).data).toEqual([]);
    expect((await fetchAllRows(table(2000).makeQuery)).data).toHaveLength(2000);
  });

  it("stops at the safety ceiling and says the list was cut short", async () => {
    const out = await fetchAllRows(table(50000).makeQuery, { ceiling: 3000 });
    expect(out.data).toHaveLength(3000);
    expect(out.truncated).toBe(true);
  });

  it("returns the error and what it had so far when a request fails", async () => {
    const out = await fetchAllRows(table(2500, 1000, { failAt: 1 }).makeQuery);
    expect(out.error).toEqual({ message: "network" });
    expect(out.data).toHaveLength(1000);
  });
});

describe("mergeById", () => {
  it("keeps one copy of each row, first list first", () => {
    const a = [{ id: 1, v: "open" }, { id: 2, v: "open" }];
    const b = [{ id: 2, v: "old" }, { id: 3, v: "old" }];
    expect(mergeById(a, b)).toEqual([{ id: 1, v: "open" }, { id: 2, v: "open" }, { id: 3, v: "old" }]);
    expect(mergeById(null, undefined, [])).toEqual([]);
  });
});
