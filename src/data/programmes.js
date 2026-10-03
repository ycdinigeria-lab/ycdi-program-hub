import { B } from "../theme.js";

// Fallback list, only used before the live chapters have loaded from Supabase.
export const CHAPTERS_FALLBACK = ["Benin", "Auchi", "Ondo", "Ibadan", "Osun", "Lagos", "Enugu", "Agbor"];

export const PROG_TYPES = ["School Visit", "Retreat", "Fellowship", "Mentoring", "Counselling", "Conference", "Online Campaign"];

export const THREE_TESTS = [
  { name: "Mission test", q: "Does this program directly contribute to raising godly, equipped young leaders?", color: B.blue },
  { name: "Quality test", q: "Is this program delivered with professionalism and excellence?", color: B.purple },
  { name: "Safety test", q: "Does this protect the welfare and dignity of every young person?", color: B.green },
];
