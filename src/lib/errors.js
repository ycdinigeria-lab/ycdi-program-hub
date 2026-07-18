import { supabase } from "./supabase.js";

export const APP_VERSION = "2.3.0";

// Raw database and network errors are written for developers. This turns
// the ones people actually hit into something a coordinator on a phone
// can act on. Anything unrecognised passes through unchanged rather than
// being flattened into a useless "something went wrong".
const PATTERNS = [
  [/failed to fetch|networkerror|load failed|err_internet/i,
   "No connection right now. Check your data or wi-fi and try again."],
  [/violates row-level security|permission denied|not authorized|do not have access/i,
   "You don't have permission to do that. If you think you should, ask an admin."],
  [/only an admin/i,
   "Only an admin can do that."],
  [/duplicate key|already exists|unique constraint/i,
   "That already exists. Check whether it's been added before."],
  [/violates check constraint/i,
   "One of the values isn't allowed here. If this keeps happening, send an admin the details."],
  [/violates foreign key/i,
   "Something this depends on is missing or has been removed. Try reloading the page."],
  [/violates not-null|null value in column/i,
   "A required field is empty."],
  [/jwt expired|invalid token|refresh_token|session.*expired/i,
   "Your session has expired. Please sign in again."],
  [/invalid login credentials/i,
   "That email and password don't match. Check for typos, or use the reset link."],
  [/email not confirmed/i,
   "Your email hasn't been confirmed yet. Check your inbox for the confirmation link."],
  [/rate limit|too many requests/i,
   "Too many attempts in a row. Wait a minute and try again."],
  [/payload too large|exceeded the maximum|file size/i,
   "That file is too large."],
  [/structure of query does not match|does not exist|relation .* does not exist|function .* does not exist/i,
   "This part of the app isn't set up yet on the database. An admin needs to run the latest setup script."],
  [/timeout|timed out/i,
   "That took too long and gave up. Usually a slow connection. Try again."],
];

export function humanise(input) {
  const raw = typeof input === "string" ? input : (input && (input.message || input.error_description)) || "";
  if (!raw) return "Something went wrong. Please try again.";
  for (const [re, friendly] of PATTERNS) {
    if (re.test(raw)) return friendly;
  }
  return raw;
}

// Records a crash so an admin can see it later. Deliberately quiet: if
// the logging itself fails there is nothing useful left to do, and the
// person on screen should never see an error about reporting an error.
let recentlyLogged = [];

export async function reportError(error, extra = {}) {
  try {
    const message = String((error && error.message) || error || "Unknown error").slice(0, 2000);

    // The same fault can fire many times a second in a render loop.
    // One report every ten seconds per message is enough to diagnose it.
    const now = Date.now();
    recentlyLogged = recentlyLogged.filter((r) => now - r.at < 10000);
    if (recentlyLogged.some((r) => r.message === message)) return;
    recentlyLogged.push({ message, at: now });

    let profileId = null, fullName = null;
    try {
      const { data } = await supabase.auth.getSession();
      profileId = data?.session?.user?.id || null;
      fullName = extra.fullName || null;
    } catch { /* not signed in */ }

    await supabase.from("client_errors").insert({
      profile_id: profileId,
      full_name: fullName,
      message,
      stack: (error && error.stack ? String(error.stack) : null)?.slice(0, 8000) || null,
      component_stack: extra.componentStack ? String(extra.componentStack).slice(0, 8000) : null,
      page: (extra.page || (typeof window !== "undefined" ? window.location.pathname + window.location.hash : null) || "").slice(0, 300),
      user_agent: (typeof navigator !== "undefined" ? navigator.userAgent : "").slice(0, 500),
      app_version: APP_VERSION,
    });
  } catch {
    // Nothing sensible to do here.
  }
}

// Catches faults that escape React: async code, event handlers, promises
// nobody awaited. Without this they only ever reach the browser console,
// where no coordinator will ever look.
export function installGlobalErrorReporting() {
  if (typeof window === "undefined" || window.__ycdiErrorsInstalled) return;
  window.__ycdiErrorsInstalled = true;

  window.addEventListener("error", (e) => {
    if (!e || !e.message) return;
    reportError(e.error || new Error(e.message), { page: "window.onerror" });
  });

  window.addEventListener("unhandledrejection", (e) => {
    const r = e && e.reason;
    if (!r) return;
    reportError(r instanceof Error ? r : new Error(String(r)), { page: "unhandled promise" });
  });
}
