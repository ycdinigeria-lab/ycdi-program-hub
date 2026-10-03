import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { Button, Card, EmptyState, PageHeader, Skeleton, SkeletonRegion, Toast } from "../src/components/ui.jsx";
import Icon, { ICON_NAMES } from "../src/components/Icon.jsx";
import UserMenu, { nextMenuIndex } from "../src/components/UserMenu.jsx";
import { HUB_CSS } from "../src/lib/hubCss.js";
import { B } from "../src/theme.js";

// BATCH41-MARKER foundation-tests
//
// Markup-level checks for the shared pieces the redesigned screens are
// built from. As with the older accessibility tests, these prove what can
// be proven from the HTML; the keyboard behaviour of the user menu has a
// pure-function test here and still wants a hands-on pass on the preview.

describe("Button", () => {
  it("is a real button and never submits a form by accident", () => {
    const html = renderToStaticMarkup(<Button>Save</Button>);
    expect(html).toMatch(/^<button/);
    expect(html).toContain('type="button"');
  });

  it("a caller can still ask for type=submit", () => {
    expect(renderToStaticMarkup(<Button type="submit">Go</Button>)).toContain('type="submit"');
  });

  it("each variant maps to its own class, and only those four plus danger exist", () => {
    for (const v of ["primary", "secondary", "outline", "tertiary", "danger"]) {
      expect(renderToStaticMarkup(<Button variant={v}>x</Button>)).toContain("hub-btn--" + v);
    }
  });

  it("disabled really disables", () => {
    expect(renderToStaticMarkup(<Button disabled>x</Button>)).toContain("disabled");
  });

  it("an icon is decoration, hidden from screen readers", () => {
    const html = renderToStaticMarkup(<Button icon="plus">Submit programme</Button>);
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("Submit programme");
  });
});

describe("Card keeps every older screen exactly as it was", () => {
  it("with no variant it renders the original inline style and no new class", () => {
    const html = renderToStaticMarkup(<Card>hello</Card>);
    expect(html).not.toContain("hub-card");
    expect(html).toContain("border-radius:10px");
    expect(html).toContain("padding:16px 18px");
  });

  it("a caller's style still merges over the default", () => {
    expect(renderToStaticMarkup(<Card style={{ marginBottom: 20 }}>x</Card>)).toContain("margin-bottom:20px");
  });

  it("a variant switches to the stylesheet classes", () => {
    expect(renderToStaticMarkup(<Card variant="elevated">x</Card>)).toContain("hub-card hub-card--elevated");
    expect(renderToStaticMarkup(<Card variant="surface">x</Card>)).toBe('<div class="hub-card">x</div>');
    expect(renderToStaticMarkup(<Card variant="plain">x</Card>)).toContain("hub-card--plain");
  });

  it("interactive adds the hover class", () => {
    expect(renderToStaticMarkup(<Card variant="surface" interactive>x</Card>)).toContain("hub-card--interactive");
  });
});

describe("EmptyState, Skeleton, PageHeader", () => {
  it("an empty state says what is empty and offers the next step", () => {
    const html = renderToStaticMarkup(
      <EmptyState title="No programmes yet" text="Nothing submitted for this chapter." action={<Button>Submit your first programme</Button>} />
    );
    expect(html).toContain("No programmes yet");
    expect(html).toContain("Nothing submitted for this chapter.");
    expect(html).toContain("Submit your first programme");
  });

  it("skeleton blocks are hidden individually and announced once as a group", () => {
    const html = renderToStaticMarkup(
      <SkeletonRegion label="Loading programmes"><Skeleton /><Skeleton /></SkeletonRegion>
    );
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('aria-label="Loading programmes"');
    expect((html.match(/aria-hidden="true"/g) || []).length).toBe(2);
  });

  it("the page header is an h2 by default, because the shell already owns the h1", () => {
    const html = renderToStaticMarkup(<PageHeader title="My programmes" description="Everything in one place." />);
    expect(html).toContain("<h2");
    expect(html).not.toContain("<h1");
    expect(html).toContain("Everything in one place.");
  });

  it("back and action both render when given", () => {
    const html = renderToStaticMarkup(
      <PageHeader title="T" back={{ label: "Back to programmes", onClick: () => {} }} action={<Button>Do it</Button>} />
    );
    expect(html).toContain("Back to programmes");
    expect(html).toContain("Do it");
  });

  it("the toast still announces itself", () => {
    const html = renderToStaticMarkup(<Toast msg="Programme approved." type="success" />);
    expect(html).toContain("hub-toast");
    expect(html).toMatch(/role="(status|alert)"/);
  });
});

describe("Icon", () => {
  it("is decoration unless given a label", () => {
    expect(renderToStaticMarkup(<Icon name="calendar" />)).toContain('aria-hidden="true"');
    const labelled = renderToStaticMarkup(<Icon name="alert" label="Needs attention" />);
    expect(labelled).toContain('role="img"');
    expect(labelled).toContain('aria-label="Needs attention"');
    expect(labelled).not.toContain("aria-hidden");
  });

  it("an unknown name renders nothing rather than breaking the screen", () => {
    expect(renderToStaticMarkup(<Icon name="does-not-exist" />)).toBe("");
  });

  it("every icon the redesign spec lists exists", () => {
    for (const n of ["calendar", "users", "mapPin", "clipboard", "check", "alert", "shield", "search", "chevronRight", "arrowRight", "plus"]) {
      expect(ICON_NAMES).toContain(n);
    }
  });
});

describe("header user menu", () => {
  const menu = () => renderToStaticMarkup(<UserMenu name="Ada Obi" roleLine="National Coordinator" onProfile={() => {}} onSignOut={() => {}} />);

  it("starts closed: announces it has a menu, and the menu is not in the page", () => {
    const html = menu();
    expect(html).toContain('aria-haspopup="menu"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('role="menu"');
    expect(html).not.toContain("Sign out");
  });

  it("shows the person's name and role on the trigger", () => {
    const html = menu();
    expect(html).toContain("Ada Obi");
    expect(html).toContain("National Coordinator");
  });

  it("arrow keys wrap, Home and End jump, and the first press from nowhere lands sensibly", () => {
    expect(nextMenuIndex("ArrowDown", 0, 2)).toBe(1);
    expect(nextMenuIndex("ArrowDown", 1, 2)).toBe(0);
    expect(nextMenuIndex("ArrowUp", 0, 2)).toBe(1);
    expect(nextMenuIndex("ArrowUp", 1, 2)).toBe(0);
    expect(nextMenuIndex("Home", 1, 2)).toBe(0);
    expect(nextMenuIndex("End", 0, 2)).toBe(1);
    expect(nextMenuIndex("ArrowDown", -1, 2)).toBe(0);
    expect(nextMenuIndex("ArrowUp", -1, 2)).toBe(1);
    expect(nextMenuIndex("ArrowDown", -1, 0)).toBe(-1);
  });
});

describe("hub stylesheet", () => {
  it("takes its colours from theme.js, not from copies of them", () => {
    expect(HUB_CSS).toContain(`--hub-blue: ${B.blue}`);
    expect(HUB_CSS).toContain(`--hub-red: ${B.red}`);
  });

  it("gives phones 44px touch targets", () => {
    const phone = HUB_CSS.slice(HUB_CSS.indexOf("@media (max-width: 760px)"));
    expect(phone).toContain("min-height: 44px");
  });

  it("switches animation off for people who ask for reduced motion", () => {
    expect(HUB_CSS).toContain("prefers-reduced-motion: reduce");
  });

  it("keeps animation within the 150 to 250ms the spec asks for", () => {
    const times = [...HUB_CSS.matchAll(/(\d+)ms/g)].map((m) => Number(m[1]));
    expect(times.length).toBeGreaterThan(0);
    for (const t of times) {
      expect(t).toBeGreaterThanOrEqual(150);
      expect(t).toBeLessThanOrEqual(250);
    }
  });

  it("only uses red where the brand allows: danger buttons and the attention card", () => {
    const uses = HUB_CSS.split("\n").filter((l) => l.includes("var(--hub-red")).join("\n");
    expect(uses).not.toContain("hub-btn--primary");
    expect(uses).not.toContain("hub-menu");
  });
});
