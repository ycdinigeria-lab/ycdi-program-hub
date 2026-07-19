// A check that every screen Batch 4 touched still
// renders its first frame without throwing, which is what would happen if
// an import broke or a hook got moved to the wrong place.
import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";

import ParticipantsSection from "../src/sections/ParticipantsSection.jsx";
import SafeguardingSection from "../src/sections/SafeguardingSection.jsx";
import DirectorySection from "../src/sections/DirectorySection.jsx";
import DocumentsSection from "../src/sections/DocumentsSection.jsx";
import MessagingSection from "../src/sections/MessagingSection.jsx";
import MoreSection from "../src/sections/MoreSection.jsx";
import { ShowMore } from "../src/components/ShowMore.jsx";

const profile = { id: "u1", full_name: "Grace Adeyemi", role: "NC", is_admin: true, is_safeguarding_lead: true, chapter_id: "c1", chapter_name: "Lagos" };
const chapters = [{ id: "c1", name: "Lagos" }, { id: "c2", name: "Benin" }];
const noop = () => {};

describe("first frame renders", () => {
  const cases = {
    Participants: <ParticipantsSection profile={profile} chapters={chapters} showToast={noop} />,
    Safeguarding: <SafeguardingSection profile={profile} chapters={chapters} showToast={noop} />,
    Directory: <DirectorySection profile={profile} chapters={chapters} showToast={noop} />,
    Documents: <DocumentsSection profile={profile} chapters={chapters} showToast={noop} />,
    Messaging: <MessagingSection profile={profile} showToast={noop} />,
    MoreList: <MoreSection profile={profile} chapters={chapters} showToast={noop} view={null} setView={noop} />,
  };
  for (const [name, el] of Object.entries(cases)) {
    it(name, () => { expect(typeof renderToString(el)).toBe("string"); });
  }
});

describe("show more button", () => {
  const p = (total, shown) => ({ total, remaining: total - shown, add: Math.min(40, total - shown), showMore: noop, showAll: noop });
  // React's server renderer drops comment markers between interpolated
  // values. Strip them so these read as the sentence a person would see.
  const text = (el) => renderToString(el).replace(/<!-- -->/g, "");
  it("is absent when everything fits", () => {
    expect(renderToString(<ShowMore paged={p(10, 10)} noun="x" />)).toBe("");
  });
  it("appears and counts correctly when there is more", () => {
    const html = text(<ShowMore paged={p(500, 40)} noun="more participants" />);
    expect(html).toContain("Show 40 more participants");
    expect(html).toContain("40 of 500 shown");
    expect(html).toContain("show all 500");
  });
  it("offers only the remainder on the last press", () => {
    expect(text(<ShowMore paged={p(45, 40)} noun="more" />)).toContain("Show 5 more");
  });
});
