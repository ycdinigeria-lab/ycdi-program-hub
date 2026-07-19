import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { renderToString } from "react-dom/server";
import { parseAuthCallback, describeAuthLinkError } from "../src/lib/authCallback.js";
import SetPasswordScreen, { passwordProblem, MIN_LENGTH } from "../src/auth/SetPasswordScreen.jsx";

const here = dirname(fileURLToPath(import.meta.url));
const src = (p) => readFileSync(join(here, "..", "src", p), "utf8");

// The real shapes Supabase sends. Kept verbatim so a change in their
// format shows up here rather than in somebody's locked-out inbox.
const RECOVERY_HASH = "#access_token=eyJhbGciOi.fake.token&expires_in=3600&refresh_token=abc123&token_type=bearer&type=recovery";
const EXPIRED_HASH = "#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired";
const PKCE_QUERY = "?code=8f3a2b1c-0000-4444-8888-abcdefabcdef";

describe("reading the link", () => {
  it("recognises a reset link", () => {
    const cb = parseAuthCallback(RECOVERY_HASH, "");
    expect(cb.isRecovery).toBe(true);
    expect(cb.hasCallback).toBe(true);
  });

  it("recognises the newer style that carries only a code", () => {
    const cb = parseAuthCallback("", PKCE_QUERY);
    expect(cb.hasCallback).toBe(true);
    // Nothing in the address bar says what the code is for, which is why
    // App.jsx also listens for the PASSWORD_RECOVERY event.
    expect(cb.isRecovery).toBe(false);
  });

  it("recognises an expired link", () => {
    const cb = parseAuthCallback(EXPIRED_HASH, "");
    expect(cb.errorCode).toBe("otp_expired");
    expect(cb.hasCallback).toBe(true);
  });

  it("says there is no callback on an ordinary visit", () => {
    expect(parseAuthCallback("", "").hasCallback).toBe(false);
  });

  it("says there is no callback on the old prayer manual link", () => {
    // This is the exact case the hash-clearing effect was written for. It
    // must still be cleared, which means it must not look like a callback.
    expect(parseAuthCallback("#prayer-manual", "").hasCallback).toBe(false);
  });

  it("survives a malformed address instead of crashing the app", () => {
    expect(() => parseAuthCallback("#%%%", "?%%%")).not.toThrow();
    expect(() => parseAuthCallback(null, undefined)).not.toThrow();
  });
});

describe("what a dead link says", () => {
  it("explains an expired link in plain words with no jargon", () => {
    const msg = describeAuthLinkError(parseAuthCallback(EXPIRED_HASH, ""));
    expect(msg).toContain("expired");
    expect(msg).toContain("send a fresh one");
    expect(msg).not.toContain("otp");
    expect(msg).not.toContain("access_denied");
  });

  it("explains a link that was already used", () => {
    const msg = describeAuthLinkError(parseAuthCallback("#error=access_denied&error_code=link_already_used", ""));
    expect(msg).toContain("already been used");
  });

  it("still says something useful for an error it has never seen", () => {
    const msg = describeAuthLinkError(parseAuthCallback("#error=server_error&error_description=Something+odd", ""));
    expect(msg).toContain("Something odd");
    expect(msg).toContain("send a fresh one");
  });

  it("says nothing at all when the link was fine", () => {
    expect(describeAuthLinkError(parseAuthCallback(RECOVERY_HASH, ""))).toBe("");
    expect(describeAuthLinkError(null)).toBe("");
  });
});

describe("password rules", () => {
  it("wants at least eight characters", () => {
    expect(passwordProblem("abc123", "abc123")).toContain(String(MIN_LENGTH));
    expect(passwordProblem("abcd1234", "abcd1234")).toBe("");
  });

  it("wants both boxes to match", () => {
    expect(passwordProblem("abcd1234", "abcd12345")).toContain("do not match");
  });

  it("asks for something rather than nothing", () => {
    expect(passwordProblem("", "")).toBe("Enter a new password.");
  });

  it("accepts a long plain phrase, which is better than a short cryptic one", () => {
    expect(passwordProblem("ondo chapter tuesday", "ondo chapter tuesday")).toBe("");
  });

  it("is stricter than the six characters Supabase would accept on its own", () => {
    expect(MIN_LENGTH).toBeGreaterThan(6);
  });
});

describe("the screen", () => {
  const text = (el) => renderToString(el).replace(/<!-- -->/g, "");

  it("shows full page on a reset link, naming the account", () => {
    const html = text(<SetPasswordScreen recovery email="grace@ycdinigeria.org" onDone={() => {}} onCancel={() => {}} />);
    expect(html).toContain("Choose a new password");
    expect(html).toContain("grace@ycdinigeria.org");
    expect(html).toContain("Save and continue");
  });

  it("offers a way out rather than trapping somebody who opened the link by mistake", () => {
    const html = text(<SetPasswordScreen recovery onCancel={() => {}} />);
    expect(html).toContain("Cancel and sign out");
  });

  it("shows as an ordinary card when opened from More", () => {
    const html = text(<SetPasswordScreen showToast={() => {}} />);
    expect(html).toContain("Change your password");
    expect(html).toContain("Change password");
    expect(html).not.toContain("Cancel and sign out");
  });
});

describe("the two faults that broke this originally", () => {
  it("the reset email now carries a return address", () => {
    const login = src("auth/LoginScreen.jsx");
    expect(login).toContain("resetPasswordForEmail");
    expect(login).toContain("redirectTo: returnAddress()");
  });

  it("sign-up confirmation carries one too, since it had the same fault", () => {
    expect(src("auth/LoginScreen.jsx")).toContain("emailRedirectTo: returnAddress()");
  });

  it("the app no longer wipes the hash when it holds a token", () => {
    const app = src("App.jsx");
    expect(app).toContain("window.location.hash && !hasAuthCallback");
  });

  // Import order is load-bearing here and nothing else would catch it
  // breaking. The callback has to be read before the Supabase client is
  // created, otherwise the race this batch fixes comes straight back.
  it("the callback is read before the Supabase client is built", () => {
    const client = src("lib/supabase.js");
    const readsCallback = client.indexOf("./authCallback.js");
    const buildsClient = client.indexOf("createClient");
    expect(readsCallback).toBeGreaterThan(-1);
    expect(readsCallback).toBeLessThan(buildsClient);
  });
});
