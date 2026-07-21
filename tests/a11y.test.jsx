import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { Badge, Avatar, Field, MiniBar, Toast, YCDILogo, SHead, StatCard } from "../src/components/ui.jsx";
import { srOnly, A11Y_CSS, liveRegionProps } from "../src/lib/a11y.js";
import VolunteersSection from "../src/sections/VolunteersSection.jsx";
import AuditLogSection from "../src/sections/AuditLogSection.jsx";
import MoreSection from "../src/sections/MoreSection.jsx";

// BATCH6B-MARKER a11y-tests
//
// These check the parts of accessibility that can be checked from markup:
// labels tied to fields, live regions present, decoration hidden, roles
// declared. They cannot tell you what a screen reader actually says, so
// the batch note asks for a keyboard pass on the preview URL as well.

const noop = () => {};

describe("form fields are joined to their labels", () => {
  it("the label points at the input, not just at empty space", () => {
    const html = renderToStaticMarkup(
      <Field label="Chapter"><input type="text" /></Field>
    );
    const forId = /for="([^"]+)"/.exec(html);
    const inputId = /<input[^>]*id="([^"]+)"/.exec(html);
    expect(forId).not.toBeNull();
    expect(inputId).not.toBeNull();
    expect(forId[1]).toBe(inputId[1]);
  });

  it("works for a select and a textarea too, not only an input", () => {
    for (const control of [<select key="s"><option>a</option></select>, <textarea key="t" />]) {
      const html = renderToStaticMarkup(<Field label="Notes">{control}</Field>);
      const forId = /for="([^"]+)"/.exec(html)[1];
      expect(html).toContain(`id="${forId}"`);
    }
  });

  it("an id the caller already set is kept rather than overwritten", () => {
    const html = renderToStaticMarkup(
      <Field label="Name"><input id="chosen-by-caller" /></Field>
    );
    expect(html).toContain('for="chosen-by-caller"');
    expect(html).toContain('id="chosen-by-caller"');
  });

  it("required is announced as a word, not only as a red star", () => {
    const html = renderToStaticMarkup(
      <Field label="Status" required><input /></Field>
    );
    expect(html).toContain('aria-required="true"');
    expect(html).toContain("required");
    // The star itself is hidden, otherwise it gets read out as "asterisk".
    expect(html).toMatch(/aria-hidden="true"[^>]*>\*|>\*<\/span>/);
  });

  it("a hint is tied to the field so it is read with it", () => {
    const html = renderToStaticMarkup(
      <Field label="Mentor" hint="Same chapter only."><select /></Field>
    );
    const describedBy = /aria-describedby="([^"]+)"/.exec(html)[1];
    expect(html).toContain(`id="${describedBy}"`);
    expect(html).toContain("Same chapter only.");
  });

  it("two fields on one screen do not share an id", () => {
    const html = renderToStaticMarkup(
      <div>
        <Field label="One"><input /></Field>
        <Field label="Two"><input /></Field>
      </div>
    );
    const ids = [...html.matchAll(/<input[^>]*id="([^"]+)"/g)].map((m) => m[1]);
    expect(ids.length).toBe(2);
    expect(new Set(ids).size).toBe(2);
  });
});

describe("decoration is hidden and meaning is not", () => {
  it("the coloured dot on a badge is hidden but the word stays", () => {
    const html = renderToStaticMarkup(<Badge status="Approved" />);
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("Approved");
  });

  it("initials standing alone announce the whole name", () => {
    const html = renderToStaticMarkup(<Avatar name="Grace Adeyemi" />);
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Grace Adeyemi"');
  });

  it("initials sitting next to the printed name are hidden instead", () => {
    const html = renderToStaticMarkup(<Avatar name="Grace Adeyemi" decorative />);
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain('role="img"');
  });

  it("the crest is hidden when the wordmark beside it already says YCDI", () => {
    const full = renderToStaticMarkup(<YCDILogo height={40} />);
    expect(full).toContain('alt=""');
    expect(full).toContain('aria-hidden="true"');
  });

  it("but the crest on its own carries the name", () => {
    const mark = renderToStaticMarkup(<YCDILogo height={40} markOnly />);
    expect(mark).toContain('alt="YCDI"');
  });
});

describe("progress and status are declared, not just drawn", () => {
  it("a bar says what it is and where it has got to", () => {
    const html = renderToStaticMarkup(<MiniBar value={3} max={10} label="Benin" />);
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuenow="3"');
    expect(html).toContain('aria-valuemax="10"');
    expect(html).toContain('aria-label="Benin"');
  });

  it("a bar with no maximum does not claim a maximum of zero", () => {
    const html = renderToStaticMarkup(<MiniBar value={0} max={0} />);
    expect(html).toContain('aria-valuemax="1"');
  });

  it("headings are headings, and their level can be set", () => {
    expect(renderToStaticMarkup(<SHead>Service</SHead>)).toContain("<h2");
    expect(renderToStaticMarkup(<SHead as="h3">Service</SHead>)).toContain("<h3");
  });
});

describe("messages are announced as well as shown", () => {
  it("an ordinary toast waits its turn", () => {
    const html = renderToStaticMarkup(<Toast msg="Saved." />);
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
  });

  it("an error interrupts, because it usually means the thing did not happen", () => {
    const html = renderToStaticMarkup(<Toast msg="That failed." type="error" />);
    expect(html).toContain('role="alert"');
    expect(html).toContain('aria-live="assertive"');
  });

  it("the two are genuinely different, not the same object twice", () => {
    expect(liveRegionProps("error")["aria-live"]).not.toBe(liveRegionProps("success")["aria-live"]);
  });
});

describe("hidden-but-readable text", () => {
  it("stays in the accessibility tree, so it is not display:none", () => {
    expect(srOnly.display).toBeUndefined();
    expect(srOnly.visibility).toBeUndefined();
    expect(srOnly.clipPath).toBe("inset(50%)");
  });
});

describe("the global stylesheet", () => {
  it("gives keyboard users a visible focus ring", () => {
    expect(A11Y_CSS).toContain(":focus-visible");
    expect(A11Y_CSS).toContain("outline");
  });

  it("does not leave an outline behind after a mouse click", () => {
    expect(A11Y_CSS).toContain(":focus:not(:focus-visible)");
  });

  it("carries a skip link and honours a request for less movement", () => {
    expect(A11Y_CSS).toContain(".ycdi-skip");
    expect(A11Y_CSS).toContain("prefers-reduced-motion");
  });
});

describe("the new screens render their first frame", () => {
  const nc = { id: "u1", full_name: "Ngozi Okeke", role: "NC", is_admin: true, is_safeguarding_lead: true, chapter_id: "c1", chapter_name: "Lagos" };
  const rc = { id: "u2", full_name: "Rita Obi", role: "RC", is_admin: false, is_safeguarding_lead: false, chapter_id: "c2", chapter_name: "Benin" };
  const tm = { id: "u3", full_name: "Tobi Adekunle", role: "TM", is_admin: false, is_safeguarding_lead: false, chapter_id: "c2", chapter_name: "Benin" };

  it("the volunteer register", () => {
    expect(typeof renderToStaticMarkup(<VolunteersSection profile={rc} showToast={noop} />)).toBe("string");
  });

  it("the audit log", () => {
    expect(typeof renderToStaticMarkup(<AuditLogSection profile={nc} showToast={noop} />)).toBe("string");
  });
});

describe("who sees the two new cards in More", () => {
  const chapters = [{ id: "c2", name: "Benin" }];
  function cards(profile) {
    return renderToStaticMarkup(
      <MoreSection profile={profile} chapters={chapters} showToast={noop} view={null} setView={noop} />
    );
  }

  it("a Regional Coordinator gets the register but not the log", () => {
    const html = cards({ id: "u2", full_name: "Rita Obi", role: "RC", is_admin: false, chapter_id: "c2", chapter_name: "Benin" });
    expect(html).toContain("Volunteer Register");
    expect(html).not.toContain("Audit Log");
  });

  it("the National Coordinator gets both", () => {
    const html = cards({ id: "u1", full_name: "Ngozi Okeke", role: "NC", is_admin: false, chapter_id: null, chapter_name: null });
    expect(html).toContain("Volunteer Register");
    expect(html).toContain("Audit Log");
  });

  it("an admin gets both, matching what the database allows", () => {
    const html = cards({ id: "u4", full_name: "Ada Admin", role: "TM", is_admin: true, chapter_id: "c2", chapter_name: "Benin" });
    expect(html).toContain("Volunteer Register");
    expect(html).toContain("Audit Log");
  });

  it("a Team Member gets neither, because the database would refuse them anyway", () => {
    const html = cards({ id: "u3", full_name: "Tobi Adekunle", role: "TM", is_admin: false, chapter_id: "c2", chapter_name: "Benin" });
    expect(html).not.toContain("Volunteer Register");
    expect(html).not.toContain("Audit Log");
  });
});

// BATCH8-MARKER statcard-a11y
describe("a stat card that filters the list", () => {
  it("is a real button and says whether it is the one currently applied", () => {
    const on = renderToStaticMarkup(<StatCard label="Pending" value={3} onClick={noop} selected={true} />);
    const off = renderToStaticMarkup(<StatCard label="Pending" value={3} onClick={noop} selected={false} />);
    expect(on).toContain("<button");
    expect(on).toContain('aria-pressed="true"');
    expect(off).toContain('aria-pressed="false"');
  });

  it("stays plain text when there is nothing to press, so no empty button is announced", () => {
    const html = renderToStaticMarkup(<StatCard label="Students" value={1065} />);
    expect(html).not.toContain("<button");
    expect(html).not.toContain("aria-pressed");
    expect(html).toContain("1065");
  });
});
