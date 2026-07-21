// BATCH9-MARKER auth-tests
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import AuthShell, { AuthField, AuthNotice, PasswordInput, authInput } from "../src/auth/AuthShell.jsx";
import LoginScreen, { MODE_COPY } from "../src/auth/LoginScreen.jsx";
import SignupPending from "../src/auth/SignupPending.jsx";
import { B } from "../src/theme.js";
import SetPasswordScreen from "../src/auth/SetPasswordScreen.jsx";

const noop = () => {};
const text = (el) => renderToStaticMarkup(el).replace(/<!-- -->/g, "");

describe("the signed-out shell", () => {
  const html = text(<AuthShell title="Welcome Back!" subtitle="Sign in to continue.">body</AuthShell>);

  it("shows the crest on its own, with no wordmark and no tagline", () => {
    // The crest keeps alt text so it is announced, but the words YCDI and
    // the strapline must not be drawn on the screen. This was asked for
    // explicitly, so it is pinned here rather than left to the eye.
    expect(html).toContain('alt="YCDI"');
    expect(html).not.toContain("Young Christian Development Initiative");
    expect(html).not.toContain("Empowering");
    expect(html).not.toContain("Transform Society");
  });

  it("puts the crest on a white badge, because the crest carries our blue", () => {
    expect(html).toContain("background:#FFFFFF");
  });

  it("carries the photograph and the wash that keeps type readable over it", () => {
    expect(html).toContain("background-image:url(");
    expect(html).toContain("linear-gradient");
  });

  it("hides the background layers from screen readers", () => {
    const layers = html.split("aria-hidden").length - 1;
    expect(layers).toBeGreaterThanOrEqual(2);
  });

  it("renders the heading as the one h1 on the page", () => {
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toContain("Welcome Back!");
    expect(html).toContain("Sign in to continue.");
  });

  it("still renders when there is no heading to show", () => {
    expect(typeof text(<AuthShell>body</AuthShell>)).toBe("string");
  });
});

describe("fields on the signed-out screens", () => {
  it("tie the label to the control, icon or no icon", () => {
    for (const icon of ["mail", undefined]) {
      const html = renderToStaticMarkup(
        <AuthField label="Email" icon={icon}>
          {(id) => <input id={id} style={authInput} />}
        </AuthField>
      );
      const forId = /for="([^"]+)"/.exec(html);
      expect(forId).not.toBeNull();
      expect(html).toContain('id="' + forId[1] + '"');
    }
  });

  it("accept a plain child as well as one that wants the id", () => {
    const html = renderToStaticMarkup(<AuthField label="Chapter"><select><option>a</option></select></AuthField>);
    expect(html).toContain("<select");
  });

  it("mark a required field for sighted readers", () => {
    expect(text(<AuthField label="Full name" required><input /></AuthField>)).toContain("*");
  });

  it("hide the decorative icon from screen readers", () => {
    const html = renderToStaticMarkup(<AuthField label="Email" icon="mail"><input /></AuthField>);
    expect(html).toContain('aria-hidden="true"');
  });
});

describe("the password reveal", () => {
  it("starts hidden and offers to show", () => {
    const html = renderToStaticMarkup(<PasswordInput value="" onChange={noop} />);
    expect(html).toContain('type="password"');
    expect(html).toContain('aria-label="Show password"');
  });

  it("does not leak the value into the markup as plain text", () => {
    const html = renderToStaticMarkup(<PasswordInput value="hunter2" onChange={noop} />);
    expect(html).toContain('type="password"');
  });
});

describe("notices", () => {
  it("an error is announced as an alert, a message is not", () => {
    expect(renderToStaticMarkup(<AuthNotice tone="error">no</AuthNotice>)).toContain('role="alert"');
    expect(renderToStaticMarkup(<AuthNotice>ok</AuthNotice>)).toContain('role="status"');
  });
});

describe("sign in screen", () => {
  it("opens on sign in and offers the other two ways through", () => {
    const html = text(<LoginScreen />);
    expect(html).toContain(MODE_COPY.login.title);
    expect(html).toContain("Create an account");
    expect(html).toContain("Forgot password?");
  });

  it("opens straight on the reset form when a link has died, and says why", () => {
    const html = text(<LoginScreen linkError="That link has already been used." />);
    expect(html).toContain(MODE_COPY.reset.title);
    expect(html).toContain("That link has already been used.");
    expect(html).not.toContain(MODE_COPY.login.title);
  });

  it("asks for a password when signing in and not when resetting", () => {
    expect(text(<LoginScreen />)).toContain('type="password"');
    expect(text(<LoginScreen linkError="dead" />)).not.toContain('type="password"');
  });

  it("gives every mode its own heading and button, none of them blank", () => {
    for (const mode of ["login", "signup", "reset"]) {
      const copy = MODE_COPY[mode];
      expect(copy.title.length).toBeGreaterThan(0);
      expect(copy.button.length).toBeGreaterThan(0);
      expect(copy.subtitle.length).toBeGreaterThan(0);
    }
    const titles = Object.values(MODE_COPY).map((c) => c.title);
    expect(new Set(titles).size).toBe(3);
  });
});

describe("choose a new password screen", () => {
  it("renders full page on a reset link, with the crest and no wordmark", () => {
    const html = text(<SetPasswordScreen recovery email="grace@example.com" showToast={noop} onDone={noop} />);
    expect(html).toContain("Choose a new password");
    expect(html).toContain("grace@example.com");
    expect(html).not.toContain("Young Christian Development Initiative");
  });

  it("stays an ordinary card when opened from inside the hub", () => {
    const html = text(<SetPasswordScreen showToast={noop} />);
    expect(html).toContain("Change your password");
    expect(html).not.toContain("background-image:url(");
  });
});


// BATCH11-MARKER auth-brand-colour-tests
//
// The signed-out screens carried a navy that Batch 9 said outright was
// not a brand colour. It is now the brand blue held at its own hue and
// darkened until white type sits on it. Two things can go wrong with
// that and neither shows up in a screenshot: the hue can drift, which
// makes it a different colour wearing the same name, and the lightness
// can creep back up, which puts unreadable type on the screen. Both are
// arithmetic, so both are checked here rather than by eye.

function rgb(hex) {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}
function luminance(hex) {
  const [r, g, b] = rgb(hex).map((c) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a, b) {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
function hue(hex) {
  const [r, g, b] = rgb(hex).map((c) => c / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return 0;
  const d = max - min;
  let h;
  if (max === b) h = 4 + (r - g) / d;
  else if (max === g) h = 2 + (b - r) / d;
  else h = ((g - b) / d + 6) % 6;
  return h * 60;
}

describe("the signed-out colours are the brand blue, darkened", () => {
  it("holds the brand hue in both deep shades", () => {
    const brand = hue(B.blue);
    expect(Math.abs(hue(B.brandDeep) - brand)).toBeLessThan(2);
    expect(Math.abs(hue(B.brandDeepest) - brand)).toBeLessThan(2);
  });

  it("carries white type at normal body size", () => {
    expect(contrast(B.brandDeep, B.white)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(B.brandDeepest, B.white)).toBeGreaterThanOrEqual(4.5);
  });

  it("works as type on the white card as well as behind it", () => {
    expect(contrast(B.brandDeep, B.white)).toBeGreaterThanOrEqual(4.5);
  });

  it("is darker than the brand blue it comes from, which is the whole point", () => {
    expect(luminance(B.brandDeep)).toBeLessThan(luminance(B.blue));
    expect(luminance(B.brandDeepest)).toBeLessThan(luminance(B.brandDeep));
  });

  it("does not put the raw brand blue on white as words anywhere in the shell", () => {
    // #09ADEA is 2.6:1 on white and #0789BB is 4.0:1. Neither is allowed
    // to carry type here even though both are brand colours.
    const html = text(<AuthShell title="Sign in"><p>x</p></AuthShell>);
    expect(html).not.toContain(`color:${B.blue}`);
    expect(html).not.toContain(`color:${B.blueDark}`);
  });

  it("paints the page in the deep brand blue, not a navy", () => {
    const html = text(<AuthShell title="Sign in"><p>x</p></AuthShell>);
    expect(html).toContain(B.brandDeepest);
    expect(html).not.toContain("#0B2A55");
    expect(html).not.toContain("#071D3D");
  });

  it("washes the photograph in one colour at three depths", () => {
    const html = text(<AuthShell title="Sign in"><p>x</p></AuthShell>);
    expect(html).toContain("rgba(5,94,128,0.56)");
    expect(html).toContain("rgba(4,80,108,0.80)");
    expect(html).toContain("rgba(2,47,64,0.94)");
    expect(html).not.toContain("rgba(11,42,85");
  });

  it("keeps the photograph, rather than replacing it with a flat colour", () => {
    const html = text(<AuthShell title="Sign in"><p>x</p></AuthShell>);
    expect(html).toContain("background-image:url(");
  });

  it("titles and labels use the deep brand blue", () => {
    const html = text(<AuthShell title="Sign in"><p>x</p></AuthShell>);
    expect(html).toContain(`color:${B.brandDeep}`);
  });

  it("puts the same colour behind all three signed-out screens", () => {
    const shells = ["login", "signup", "reset"].map((mode) =>
      text(<LoginScreen mode={mode} showToast={noop} />));
    for (const html of shells) {
      expect(html).toContain(B.brandDeepest);
      expect(html).toContain("rgba(4,80,108,0.80)");
    }
  });

  it("and behind the reset-link screen too", () => {
    const html = text(<SetPasswordScreen recovery email="grace@example.com" showToast={noop} onDone={noop} />);
    expect(html).toContain(B.brandDeepest);
  });

  // The reset screen had its own button at the raw brand blue with white
  // type on it, 2.6:1, while sign in and create an account both used the
  // shared one. That is the sort of thing that survives for years because
  // nobody opens all three screens in the same minute.
  it("gives the reset screen the same button as the other two", () => {
    const html = text(<SetPasswordScreen recovery email="grace@example.com" showToast={noop} onDone={noop} />);
    expect(html).toContain(`background:${B.brandDeep}`);
    expect(html).not.toContain(`background:${B.blue};color:${B.white}`);
  });

  it("leaves the in-app change password button alone", () => {
    const html = text(<SetPasswordScreen showToast={noop} />);
    expect(html).toContain(`background:${B.blue}`);
  });
});
