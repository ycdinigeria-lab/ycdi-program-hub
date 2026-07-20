import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import ApplyScreen from "../src/public/ApplyScreen.jsx";
import ApplicationsSection from "../src/sections/ApplicationsSection.jsx";
import MoreSection from "../src/sections/MoreSection.jsx";

// BATCH7A-MARKER apply-screen-tests

const noop = () => {};

describe("the public form", () => {
  const html = renderToStaticMarkup(<ApplyScreen />);

  it("renders without a session, which is the whole point of it", () => {
    expect(typeof html).toBe("string");
    expect(html).toContain("Volunteer with YCDI");
  });

  it("asks for the things SAF-005 3.2 requires", () => {
    for (const name of [
      "full_name", "date_of_birth", "phone", "email", "home_address",
      "address_since", "occupation", "employment_history", "youth_experience",
      "church_name", "pastor_name",
      "referee1_name", "referee1_contact", "referee2_name",
      "faith_statement", "motivation",
      "disclosure_made", "consent_references",
    ]) {
      expect(html).toContain(`name="${name}"`);
    }
  });

  it("puts the declaration question on the page, worded as a question", () => {
    expect(html).toContain("safeguarding concern");
  });

  it("says what happens to the form afterwards", () => {
    expect(html).toContain("twelve months");
  });

  it("carries no navigation into the rest of the hub", () => {
    expect(html).not.toContain("Sign out");
    expect(html).not.toContain("Safeguarding");
  });

  it("has a skip link and a main landmark like every other screen", () => {
    expect(html).toContain("ycdi-skip");
    expect(html).toContain('id="apply-main"');
  });
});

describe("the coordinator's screen", () => {
  const rc = { id: "u2", full_name: "Rita Obi", role: "RC", is_admin: false, chapter_id: "c2", chapter_name: "Benin" };

  it("renders its first frame", () => {
    expect(typeof renderToStaticMarkup(<ApplicationsSection profile={rc} showToast={noop} />)).toBe("string");
  });

  it("shows the link to share, because a form nobody can find is not a front door", () => {
    const html = renderToStaticMarkup(<ApplicationsSection profile={rc} showToast={noop} />);
    expect(html).toContain("/apply");
    expect(html).toContain("Copy link");
  });
});

describe("who sees the applications card", () => {
  const chapters = [{ id: "c2", name: "Benin" }];
  function cards(profile) {
    return renderToStaticMarkup(
      <MoreSection profile={profile} chapters={chapters} showToast={noop} view={null} setView={noop} />
    );
  }

  it("a Regional Coordinator does", () => {
    expect(cards({ id: "u2", full_name: "Rita Obi", role: "RC", is_admin: false, chapter_id: "c2" }))
      .toContain("Volunteer Applications");
  });

  it("the National Coordinator does", () => {
    expect(cards({ id: "u1", full_name: "Ngozi Okeke", role: "NC", is_admin: false, chapter_id: null }))
      .toContain("Volunteer Applications");
  });

  // The one worth guarding. Admin gets into almost everything else in
  // More, and an application carries a convictions declaration.
  it("an admin who is not a coordinator does not", () => {
    const html = cards({ id: "u4", full_name: "Ada Admin", role: "TM", is_admin: true, chapter_id: "c2" });
    expect(html).not.toContain("Volunteer Applications");
    // and the change did not shut them out of the cards they should have
    expect(html).toContain("Audit Log");
  });

  it("a Team Member does not", () => {
    expect(cards({ id: "u3", full_name: "Tobi Adekunle", role: "TM", is_admin: false, chapter_id: "c2" }))
      .not.toContain("Volunteer Applications");
  });
});
