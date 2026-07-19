import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// The service worker is the one file in this batch that could do lasting
// damage: serve a stale app forever, or write a child's details onto a
// shared phone. So these tests load the real public/sw.js, run it inside a
// stand-in browser, and drive its handlers rather than reasoning about it.

const here = dirname(fileURLToPath(import.meta.url));
const SW_SOURCE = readFileSync(join(here, "..", "public", "sw.js"), "utf8");

const APP = "https://programmes.ycdinigeria.org";
const DB = "https://dnympoqsnrlgsvhznsjb.supabase.co";

function urlOf(req) {
  return typeof req === "string" ? req : req.url;
}

class StubResponse {
  constructor(body, init) {
    this.body = body;
    this.status = (init && init.status) || 200;
    this.ok = this.status < 400;
    this.origin = "constructed";
  }
  clone() { return this; }
}
class StubRequest {
  constructor(url) { this.url = url; }
}

// Runs sw.js with a fake global and returns everything needed to poke it.
function boot(opts) {
  const options = opts || {};
  const origin = options.origin || APP;
  const offline = !!options.offline;

  const handlers = {};
  const caches = new Map();
  const network = [];
  const flags = { claimed: false, skipped: false };

  function bucket(name) {
    if (!caches.has(name)) {
      const store = new Map();
      caches.set(name, {
        store,
        match: async (r) => store.get(urlOf(r)),
        put: async (r, res) => { store.set(urlOf(r), res); },
        add: async (r) => { store.set(urlOf(r), { origin: "prefetch" }); },
      });
    }
    return caches.get(name);
  }

  const cacheStorage = {
    open: async (n) => bucket(n),
    match: async (r) => {
      for (const c of caches.values()) {
        const hit = await c.match(r);
        if (hit) return hit;
      }
      return undefined;
    },
    keys: async () => Array.from(caches.keys()),
    delete: async (n) => caches.delete(n),
  };

  const selfStub = {
    location: { origin },
    addEventListener: (type, fn) => { handlers[type] = fn; },
    skipWaiting: () => { flags.skipped = true; },
    registration: {},
    clients: { claim: async () => { flags.claimed = true; } },
  };

  const fetchStub = async (req) => {
    network.push(urlOf(req));
    if (offline) throw new TypeError("Failed to fetch");
    const res = { ok: true, type: "basic", origin: "network", url: urlOf(req) };
    res.clone = () => res;
    return res;
  };

  // eslint-disable-next-line no-new-func
  new Function("self", "caches", "fetch", "Response", "Request", "URL", SW_SOURCE)(
    selfStub, cacheStorage, fetchStub, StubResponse, StubRequest, URL
  );

  return { handlers, cacheStorage, bucket, network, flags };
}

// Fires the fetch handler. Returns the string "untouched" if the worker
// declined to handle the request at all, which is the safe outcome.
async function route(sw, url, extra) {
  const req = Object.assign({ url, mode: "no-cors", method: "GET" }, extra || {});
  let answer = "untouched";
  await sw.handlers.fetch({ request: req, respondWith: (p) => { answer = p; }, waitUntil: () => {} });
  return answer === "untouched" ? answer : await answer;
}

async function runLifecycle(sw, name) {
  let held;
  sw.handlers[name]({ waitUntil: (p) => { held = p; } });
  await held;
}

describe("data is never cached", () => {
  it("declines a participants query", async () => {
    const sw = boot();
    expect(await route(sw, DB + "/rest/v1/participants?select=*")).toBe("untouched");
    expect(sw.network).toHaveLength(0);
  });

  it("declines a safeguarding query", async () => {
    const sw = boot();
    expect(await route(sw, DB + "/rest/v1/safeguarding_incidents")).toBe("untouched");
  });

  it("declines the auth token endpoint", async () => {
    const sw = boot();
    expect(await route(sw, DB + "/auth/v1/token?grant_type=password")).toBe("untouched");
  });

  // The three above would still pass with the Supabase guard deleted,
  // because the same-origin check happens to catch them as well. This one
  // pretends Supabase is the app's own origin, so every later rule would
  // match and store the file. Only the explicit guard stops it. If somebody
  // later loosens the origin rule to cache a CDN, this fails rather than a
  // signed photo of a child quietly landing on a shared handset.
  it("declines a signed member photo even when every other rule would keep it", async () => {
    const sw = boot({ origin: DB });
    const out = await route(sw, DB + "/storage/v1/object/sign/member-photos/grace.jpg");
    expect(out).toBe("untouched");
    expect(sw.network).toHaveLength(0);
  });

  it("declines a Supabase navigation that would otherwise be taken for the shell", async () => {
    const sw = boot({ origin: DB });
    expect(await route(sw, DB + "/rest/v1/participants", { mode: "navigate" })).toBe("untouched");
  });

  it("leaves every cache empty after all of that", async () => {
    const sw = boot();
    await route(sw, DB + "/rest/v1/participants");
    await route(sw, DB + "/rest/v1/safeguarding_incidents");
    const keys = await sw.cacheStorage.keys();
    let n = 0;
    for (const k of keys) n += (await sw.cacheStorage.open(k)).store.size;
    expect(n).toBe(0);
  });
});

describe("nothing that changes state is touched", () => {
  it("ignores a POST", async () => {
    const sw = boot();
    expect(await route(sw, APP + "/assets/index-abc.js", { method: "POST" })).toBe("untouched");
  });

  it("ignores a DELETE", async () => {
    const sw = boot();
    expect(await route(sw, APP + "/assets/index-abc.js", { method: "DELETE" })).toBe("untouched");
  });

  it("ignores protocols that are not http", async () => {
    const sw = boot();
    expect(await route(sw, "chrome-extension://abc/inject.js")).toBe("untouched");
  });

  it("ignores third party hosts it knows nothing about", async () => {
    const sw = boot();
    expect(await route(sw, "https://example.org/tracker.js")).toBe("untouched");
  });
});

describe("the app shell", () => {
  it("asks the network first, so a deploy lands on the next open", async () => {
    const sw = boot();
    const out = await route(sw, APP + "/", { mode: "navigate" });
    expect(out.origin).toBe("network");
    expect(sw.network).toHaveLength(1);
  });

  it("falls back to the saved copy when there is no connection", async () => {
    const sw = boot({ offline: true });
    const shell = sw.bucket("ycdi-shell-b4-1");
    await shell.put("/index.html", { origin: "saved" });
    const out = await route(sw, APP + "/directory", { mode: "navigate" });
    expect(out.origin).toBe("saved");
  });

  it("says something honest rather than hanging when offline with nothing saved", async () => {
    const sw = boot({ offline: true });
    const out = await route(sw, APP + "/", { mode: "navigate" });
    expect(out.status).toBe(503);
  });
});

describe("built files", () => {
  it("come from the cache without touching the network once saved", async () => {
    const sw = boot();
    const url = APP + "/assets/react-2e1558b1.js";
    await sw.bucket("ycdi-assets-b4-1").put(url, { origin: "saved" });
    const out = await route(sw, url);
    expect(out.origin).toBe("saved");
    expect(sw.network).toHaveLength(0);
  });

  it("are fetched and kept the first time", async () => {
    const sw = boot();
    const url = APP + "/assets/index-48b142db.js";
    expect((await route(sw, url)).origin).toBe("network");
    await new Promise((r) => setTimeout(r, 0));
    expect(await sw.bucket("ycdi-assets-b4-1").match(url)).toBeTruthy();
  });

  it("cover the icons and the fonts a slow connection would otherwise refetch", async () => {
    const sw = boot();
    expect(await route(sw, APP + "/icon-192.png")).not.toBe("untouched");
    expect(await route(sw, "https://fonts.gstatic.com/s/montserrat/v26/x.woff2")).not.toBe("untouched");
    expect(await route(sw, "https://fonts.googleapis.com/css2?family=Montserrat")).not.toBe("untouched");
  });
});

describe("moving between versions", () => {
  it("clears its own old caches and takes over the page", async () => {
    const sw = boot();
    sw.bucket("ycdi-shell-older");
    sw.bucket("ycdi-assets-older");
    sw.bucket("ycdi-shell-b4-1");
    sw.bucket("ycdi-assets-b4-1");

    await runLifecycle(sw, "activate");

    const left = await sw.cacheStorage.keys();
    expect(left).toContain("ycdi-shell-b4-1");
    expect(left).toContain("ycdi-assets-b4-1");
    expect(left).not.toContain("ycdi-shell-older");
    expect(left).not.toContain("ycdi-assets-older");
    expect(sw.flags.claimed).toBe(true);
  });

  it("leaves caches belonging to anything else alone", async () => {
    const sw = boot();
    sw.bucket("some-other-thing-v2");
    await runLifecycle(sw, "activate");
    expect(await sw.cacheStorage.keys()).toContain("some-other-thing-v2");
  });

  it("steps aside only when the page actually asks", () => {
    const sw = boot();
    sw.handlers.message({ data: "hello" });
    expect(sw.flags.skipped).toBe(false);
    sw.handlers.message({ data: "skip-waiting" });
    expect(sw.flags.skipped).toBe(true);
  });

  it("still installs when the shell cannot be fetched", async () => {
    const sw = boot({ offline: true });
    await expect(runLifecycle(sw, "install")).resolves.not.toThrow();
  });
});
