// Registers the service worker and tells the app when a new version is
// waiting, so the person can choose the moment to refresh.
//
// It deliberately does not reload on its own. Somebody could be halfway
// through writing a safeguarding report, and losing that to a silent
// refresh would be worse than running a version that is ten minutes old.
//
// BATCH4-MARKER pwa

let waitingWorker = null;
let listener = null;
let reloading = false;

export function onUpdateReady(fn) {
  listener = fn;
  if (waitingWorker && fn) fn();
  return () => { if (listener === fn) listener = null; };
}

function announce(worker) {
  waitingWorker = worker;
  if (listener) listener();
}

export function applyUpdate() {
  if (!waitingWorker) { window.location.reload(); return; }
  waitingWorker.postMessage("skip-waiting");
}

export function registerServiceWorker() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    // Guarded, because without the flag a browser can fire this more than
    // once and put the tab in a reload loop.
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").then((reg) => {
      // Something already installed and waiting from a previous visit.
      if (reg.waiting && navigator.serviceWorker.controller) announce(reg.waiting);

      reg.addEventListener("updatefound", () => {
        const fresh = reg.installing;
        if (!fresh) return;
        fresh.addEventListener("statechange", () => {
          // A controller already exists, so this is a genuine update rather
          // than the very first install.
          if (fresh.state === "installed" && navigator.serviceWorker.controller) {
            announce(fresh);
          }
        });
      });

      // Check on open, and hourly after that, so a coordinator who leaves
      // the tab sitting all week still picks up a deploy.
      reg.update();
      setInterval(() => { reg.update(); }, 60 * 60 * 1000);
      window.addEventListener("focus", () => { reg.update(); });
    }).catch(() => {
      // No service worker means no offline shell. The app still works.
    });
  });
}
