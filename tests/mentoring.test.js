import { describe, it, expect } from "vitest";
import {
  canAddParticipant,
  selfMentorsOnCreate,
  canEditParticipant,
  isChapterCoordinator,
  showsChapterOverview,
  participantsEmptyCopy,
} from "../src/sections/ParticipantsSection.jsx";

// BATCH13-MARKER team-member-participants
//
// These mirror the database rules a team member now lives under: they may
// add and hold a young person they added or mentor, but assigning a mentor
// and withdrawing a consent stay with coordinators. The screen must offer
// exactly what the database will accept, so a wrong answer here is a dead or
// a missing button, never an opening.

const admin = { is_admin: true, role: "NC", chapter_name: null };
const nc = { is_admin: false, role: "NC", chapter_name: null };
const rcBenin = { is_admin: false, role: "RC", chapter_name: "Benin" };
const tmBenin = { is_admin: false, role: "TM", chapter_name: "Benin" };

const beninPerson = { chapters: { name: "Benin" } };
const lagosPerson = { chapters: { name: "Lagos" } };

describe("who may add a young person", () => {
  it("lets a team member add, as well as coordinators and admins", () => {
    expect(canAddParticipant(tmBenin)).toBe(true);
    expect(canAddParticipant(rcBenin)).toBe(true);
    expect(canAddParticipant(admin)).toBe(true);
  });
  it("keeps the National Coordinator out of adding, as before", () => {
    // The NC looks but does not enter chapter data, the same rule the rest
    // of the participant area already follows. Batch 13 leaves that alone.
    expect(canAddParticipant(nc)).toBe(false);
  });
});

describe("the self-mentor rule on adding", () => {
  it("makes a team member the mentor of anyone they add", () => {
    expect(selfMentorsOnCreate(tmBenin)).toBe(true);
  });
  it("does not do that for coordinators or admins", () => {
    expect(selfMentorsOnCreate(rcBenin)).toBe(false);
    expect(selfMentorsOnCreate(admin)).toBe(false);
    expect(selfMentorsOnCreate(nc)).toBe(false);
  });
});

describe("who may edit a loaded record", () => {
  it("lets a team member edit any record that reached them", () => {
    // Row security only hands a team member a record they added or mentor,
    // so once it has loaded, editing is allowed.
    expect(canEditParticipant(tmBenin, beninPerson)).toBe(true);
  });
  it("lets a coordinator edit only their own chapter", () => {
    expect(canEditParticipant(rcBenin, beninPerson)).toBe(true);
    expect(canEditParticipant(rcBenin, lagosPerson)).toBe(false);
  });
  it("lets an admin edit anywhere and keeps the National Coordinator read-only", () => {
    expect(canEditParticipant(admin, lagosPerson)).toBe(true);
    expect(canEditParticipant(nc, beninPerson)).toBe(false);
  });
});

describe("what stays coordinator work", () => {
  it("keeps consent withdrawal and mentor assignment away from team members", () => {
    expect(isChapterCoordinator(tmBenin, beninPerson)).toBe(false);
  });
  it("allows the chapter coordinator and admin, not the National Coordinator", () => {
    expect(isChapterCoordinator(rcBenin, beninPerson)).toBe(true);
    expect(isChapterCoordinator(rcBenin, lagosPerson)).toBe(false);
    expect(isChapterCoordinator(admin, lagosPerson)).toBe(true);
    expect(isChapterCoordinator(nc, beninPerson)).toBe(false);
  });
});

describe("the chapter overview", () => {
  it("is hidden from a team member and shown to everyone above", () => {
    expect(showsChapterOverview(tmBenin)).toBe(false);
    expect(showsChapterOverview(rcBenin)).toBe(true);
    expect(showsChapterOverview(nc)).toBe(true);
    expect(showsChapterOverview(admin)).toBe(true);
  });
});

describe("the empty-list wording", () => {
  it("speaks to a team member about who they hold", () => {
    expect(participantsEmptyCopy(tmBenin)).toMatch(/added|mentor/i);
  });
  it("keeps the chapter framing for a coordinator", () => {
    expect(participantsEmptyCopy(rcBenin)).toMatch(/recorded yet/i);
  });
});
