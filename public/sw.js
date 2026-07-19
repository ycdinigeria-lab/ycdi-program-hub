/* YCDI Programme Hub service worker.
 *
 * BATCH4-MARKER sw
 *
 * What this does and, more importantly, what it deliberately does not do.
 *
 * It caches the app itself: the HTML shell, the built JavaScript, the icons
 * and the Google fonts. That means the hub opens instantly on a second
 * visit and still opens on a train with no signal.
 *
 * It never caches anything from Supabase. No profile, no message, no
 * participant, no safeguarding record is written to disk by this file.
 * Data always comes from the network, and when there is no network the app
 * shows the offline banner it already had. That is a decision, not an
 * oversight: caching a safeguarding register onto a shared phone would be
 * the wrong trade.
 *
 * If this ever needs switching off, replace the whole contents of this file
 * with the three lines in the KILL SWITCH note at the bottom and deploy.
 */

var VERSION = "b4-1";
var SHELL = "ycdi-shell-" + VERSION;
var ASSETS = "ycdi-assets-" + VERSION;
var KEEP = [SHELL, ASSETS];

var SHELL_URL = "/index.html";

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(SHELL).then(function (cache) {
      // Only the shell is pre-fetched. Everything else is picked up as it
      // is used, because Vite puts a hash in each file name and a hard
      // coded list would go stale on the next deploy.
      return cache.add(new Request(SHELL_URL, { cache: "reload" }));
    }).catch(function () { /* a failed pre-fetch must not block install */ })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (names) {
      return Promise.all(names.map(function (n) {
        if (n.indexOf("ycdi-") === 0 && KEEP.indexOf(n) === -1) return caches.delete(n);
        return null;
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

// The page asks for this when the person presses Refresh on the update bar.
self.addEventListener("message", function (event) {
  if (event.data === "skip-waiting") self.skipWaiting();
});

function isFontHost(url) {
  return url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com";
}

function isBuiltAsset(url) {
  if (url.origin !== self.location.origin) return false;
  if (url.pathname.indexOf("/assets/") === 0) return true;
  return /\.(png|jpg|jpeg|svg|webp|ico|woff2?)$/i.test(url.pathname);
}

// Network first, with the cached shell as the safety net. The shell is
// never served from cache while a network is available, so a deploy is
// picked up on the next load rather than days later.
function shellFirst(request) {
  return fetch(request).then(function (res) {
    if (res && res.ok) {
      var copy = res.clone();
      caches.open(SHELL).then(function (c) { c.put(SHELL_URL, copy); });
    }
    return res;
  }).catch(function () {
    return caches.match(SHELL_URL).then(function (hit) {
      return hit || new Response("Offline and nothing saved yet.", {
        status: 503,
        headers: { "Content-Type": "text/plain" },
      });
    });
  });
}

// Cache first. Safe here because these file names contain a content hash,
// so a changed file is always a different name.
function assetFirst(request, cacheName) {
  return caches.match(request).then(function (hit) {
    if (hit) return hit;
    return fetch(request).then(function (res) {
      if (res && (res.ok || res.type === "opaque")) {
        var copy = res.clone();
        caches.open(cacheName).then(function (c) { c.put(request, copy); });
      }
      return res;
    });
  });
}

self.addEventListener("fetch", function (event) {
  var request = event.request;
  if (request.method !== "GET") return;

  var url;
  try { url = new URL(request.url); } catch (e) { return; }

  // Supabase, and anything else carrying credentials, goes straight to the
  // network and is never stored.
  if (url.hostname.indexOf("supabase.co") !== -1) return;
  if (url.protocol !== "http:" && url.protocol !== "https:") return;

  if (request.mode === "navigate") {
    event.respondWith(shellFirst(request));
    return;
  }

  if (isBuiltAsset(url)) {
    event.respondWith(assetFirst(request, ASSETS));
    return;
  }

  if (isFontHost(url)) {
    event.respondWith(assetFirst(request, ASSETS));
    return;
  }
  // Everything else is left alone.
});

/* KILL SWITCH
 * If the service worker ever needs to be removed, replace everything above
 * with exactly this and deploy. Every phone drops it on the next visit.
 *
 *   self.addEventListener("install", function () { self.skipWaiting(); });
 *   self.addEventListener("activate", function (e) {
 *     e.waitUntil(caches.keys().then(function (k) {
 *       return Promise.all(k.map(function (n) { return caches.delete(n); }));
 *     }).then(function () { return self.registration.unregister(); }));
 *   });
 */
