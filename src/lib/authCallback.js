// Supabase delivers password reset and email confirmation tokens in the
// URL, and they survive for exactly one page load. This file reads them the
// moment it is imported, before React mounts and before anything else gets
// a chance to tidy the address bar.
//
// That ordering is the whole point. App.jsx has an effect that clears the
// hash, written to get rid of stale #prayer-manual links from an older
// version, and it was quietly capable of destroying a reset token before
// anybody could use it. Reading here first makes that impossible.
//
// BATCH4C-MARKER authCallback

// The parsing is kept as plain functions taking strings so it can be
// tested properly rather than reasoned about.

// Supabase uses one of two shapes depending on how the project is set up.
// The older one puts a token in the hash with type=recovery. The newer one
// puts a short code in the query string and says nothing about what it is
// for, in which case the PASSWORD_RECOVERY event is the only clue, which
// is why App.jsx listens for that as well as reading this.
export function parseAuthCallback(hashStr, searchStr) {
  let hash, query;
  try {
    hash = new URLSearchParams(String(hashStr || "").replace(/^#/, ""));
    query = new URLSearchParams(String(searchStr || "").replace(/^\?/, ""));
  } catch {
    // A malformed address is not worth crashing the app over.
    hash = new URLSearchParams("");
    query = new URLSearchParams("");
  }
  const pick = (n) => hash.get(n) || query.get(n) || "";

  const type = pick("type");
  const error = pick("error");
  return {
    type,
    error,
    errorCode: pick("error_code"),
    errorDescription: pick("error_description"),
    isRecovery: type === "recovery",
    hasCallback: !!(pick("access_token") || pick("code") || type || error),
  };
}

// A used or expired link is by far the most common failure, and Supabase's
// own wording for it is not something to put in front of a coordinator.
export function describeAuthLinkError(cb) {
  if (!cb || (!cb.error && !cb.errorCode)) return "";
  const code = String(cb.errorCode || "").toLowerCase();
  if (code.includes("expired") || code.includes("otp")) {
    return "That password reset link has expired. Reset links last one hour and can only be used once. Enter your email below and we will send a fresh one.";
  }
  if (code.includes("already") || code.includes("used")) {
    return "That password reset link has already been used. Enter your email below and we will send a fresh one.";
  }
  const readable = String(cb.errorDescription || cb.error || "").replace(/\+/g, " ").trim();
  return readable
    ? "That link could not be used: " + readable + ". Enter your email below and we will send a fresh one."
    : "That link could not be used. Enter your email below and we will send a fresh one.";
}

const initial = typeof window === "undefined"
  ? parseAuthCallback("", "")
  : parseAuthCallback(window.location.hash, window.location.search);

export const authCallbackType = initial.type;
export const arrivedForPasswordRecovery = initial.isRecovery;
export const hasAuthCallback = initial.hasCallback;

export function authLinkError() {
  return describeAuthLinkError(initial);
}

// Where Supabase should send people back to. Deliberately worked out from
// wherever the app is being served rather than written down, so it follows
// the app from the netlify.app address to hub.ycdinigeria.org and onwards
// without anybody having to remember to change it.
//
// Supabase will only honour an address that appears in the Redirect URLs
// allow list in the dashboard, which is what stops a copy of this page
// somewhere else nominating an address it controls and collecting the
// token. Both entries need to be in that list during a domain move.
export function returnAddress() {
  if (typeof window === "undefined") return undefined;
  return window.location.origin + "/";
}

// Called once the token has been spent, to get it out of the address bar
// so a screenshot or a shared link cannot carry it.
export function clearAuthCallbackFromUrl() {
  if (typeof window === "undefined") return;
  try {
    window.history.replaceState(null, "", window.location.pathname);
  } catch {
    /* not worth crashing over */
  }
}
