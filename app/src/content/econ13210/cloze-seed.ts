import type { ClozeQuestion } from "@/lib/engine/types";
import { validateClozeQuestion } from "@/lib/engine/cloze";

/**
 * CLOZE (fill-in-the-blank with a word bank) seed questions for ECON 13210.
 *
 * Provenance: drafted, not yet teacher-reviewed — provenance "ai_draft" and
 * citationIds point at PENDING_CITATION (D-005 posture: no lecture files have
 * been ingested yet, so nothing here is presented as verified — GATE-001).
 * Every fact restated in these templates is drawn straight from the existing
 * course content in ./index.ts (concept definitions c-steady / c-fund and the
 * eq-fundamental equation components) — no new claims are introduced.
 *
 * Each question is run through validateClozeQuestion() below, at module
 * load, so a malformed template or an answerKey fill missing from its bank
 * throws immediately here rather than shipping silently.
 */
export function buildClozeSeedQuestions(pendingCitationId: string): ClozeQuestion[] {
  const questions: ClozeQuestion[] = [
    {
      id: "q-cloze-steady-1",
      conceptSlug: "steady-state",
      type: "cloze",
      stem: "Fill in the blank using the word bank.",
      template: "At the steady state, actual investment equals {{b1}} investment.",
      bank: ["break-even", "golden-rule", "gross", "replacement"],
      answerKey: { fills: { b1: "break-even" } },
      difficulty: 2,
      expectedSeconds: 30,
      transferDistance: 0,
      provenance: "ai_draft",
      hint: "This is the investment level where capital per worker stops changing — the two curves in the lab cross here.",
      citationIds: [pendingCitationId],
    },
    {
      id: "q-cloze-fundamental-1",
      conceptSlug: "fundamental-equation",
      type: "cloze",
      stem: "Fill in both blanks using the word bank.",
      template: "Break-even investment requires replacing {{b1}} capital and equipping {{b2}} workers.",
      bank: ["depreciated", "new", "borrowed", "existing"],
      answerKey: { fills: { b1: "depreciated", b2: "new" } },
      difficulty: 2,
      expectedSeconds: 40,
      transferDistance: 0,
      provenance: "ai_draft",
      hint: "Break-even investment is (n+δ)k: δk offsets capital wearing out, nk equips the workers a growing population adds.",
      citationIds: [pendingCitationId],
    },
  ];

  for (const q of questions) validateClozeQuestion(q);

  return questions;
}
