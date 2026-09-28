import { B } from "../theme.js";

// Fallback list, only used before the live chapters have loaded from Supabase.
export const CHAPTERS_FALLBACK = ["Benin", "Auchi", "Ondo", "Ibadan", "Osun", "Lagos", "Enugu", "Agbor"];

// BATCH37-MARKER concept-note-v2
// Widened to match section 1.14 of the Programme Operations Manual v2.0
// (Digital Campaign, Mentoring Group, Scholarship Cohort). The older
// entries stay so nothing already tagged with one disappears from its
// own record or from the KPI counts that group by type.
export const PROG_TYPES = [
  "School Visit", "Retreat", "Fellowship", "Mentoring", "Counselling",
  "Conference", "Online Campaign", "Digital Campaign", "Mentoring Group",
  "Scholarship Cohort",
];

export const GEO_SCOPES = ["Chapter", "Regional", "National"];
export const DELIVERY_FORMATS = ["Physical", "Virtual", "Hybrid"];
export const RATINGS = ["Strong", "Partial", "None"];

// Section 1.5 — the four questions of the Needs Identification Checklist.
export const NEEDS_QUESTIONS = [
  { key: "needs_evidence", label: "1. The Evidence Question", q: "What specific evidence shows this need exists?", hint: "Attendance or feedback data, a direct request from a school or community, a pattern noticed across several visits, or a documented gap. “I think students need this” is a hypothesis, not evidence." },
  { key: "needs_gap", label: "2. The Gap Question", q: "What is currently missing that this programme would provide?", hint: "What happens if YCDI does nothing: which students remain unreached, which risk goes unaddressed, or which strategic milestone stalls." },
  { key: "needs_beneficiary_voice", label: "3. The Beneficiary Voice Question", q: "Have the young people, school, or community actually confirmed this is a need?", hint: "Not just YCDI's leadership assuming it on their behalf — wherever practical, a conversation with students, a teacher, or a community stakeholder before the concept note is written." },
  { key: "needs_alternative", label: "4. The Alternative Question", q: "Could an existing YCDI programme be adapted or extended to meet this need, rather than creating a new one?", hint: "Depth matters more than breadth. A new programme line should only be proposed once the honest answer to this is no." },
];

// Section 1.6 — the five Strategic Priorities, each rated Strong / Partial / None.
export const PRIORITIES = [
  { key: "align_reach", label: "REACH", q: "Does this programme extend YCDI to more students, more schools, or more chapters, in person or digitally?" },
  { key: "align_roots", label: "ROOTS", q: "Does this programme deepen spiritual formation and discipleship outcomes for beneficiaries already within reach?" },
  { key: "align_resources", label: "RESOURCES", q: "Can this programme be resourced within the current or realistically obtainable budget, without compromising financial sustainability?" },
  { key: "align_raise", label: "RAISE", q: "Does this programme build volunteer capacity, leadership pipeline, or people development, rather than simply consuming volunteer time?" },
  { key: "align_reputation", label: "REPUTATION", q: "Does this programme strengthen or protect YCDI's credibility, or does it carry reputational risk that outweighs its benefit?" },
];

export const THREE_TESTS = [
  { name: "Mission test", q: "Does this program directly contribute to raising godly, equipped young leaders?", color: B.blue },
  { name: "Quality test", q: "Is this program delivered with professionalism and excellence?", color: B.purple },
  { name: "Safety test", q: "Does this protect the welfare and dignity of every young person?", color: B.green },
];
