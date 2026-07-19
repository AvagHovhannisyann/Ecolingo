import type { MatchPairsQuestion } from "../../lib/engine/types";

/**
 * MATCH PAIRS seed content (Wave 2 Stream AC, D-020 engine work).
 *
 * Two term↔definition drafts grounded ONLY in course content that already
 * exists in this file's sibling `index.ts` (the fundamental-equation and
 * golden-rule concepts, and equations `eq-fundamental` / `eq-golden`) — no
 * new economics facts are introduced here. Provenance is `ai_draft`
 * (unreviewed by a teacher) and citations follow the same
 * PENDING_CITATION pattern as every other seed question in this course:
 * the caller passes the shared pending-citation id in, exactly like
 * `buildGeneratedQuestions` does, so this module never imports `index.ts`
 * directly and there is no import cycle between the two files.
 */
export function buildMatchPairsSeed(pendingCitationId: string): MatchPairsQuestion[] {
  return [
    {
      id: "q-match-fundamental-1",
      conceptSlug: "fundamental-equation",
      type: "match_pairs",
      stem: "Match each term in the fundamental equation of the Solow model, Δk = s·f(k) − (n+δ)k, to what it stands for.",
      difficulty: 2,
      expectedSeconds: 60,
      transferDistance: 0,
      provenance: "ai_draft",
      hint: "Break-even investment is what actual investment has to clear before capital per worker can rise; it has two pieces, one for depreciation and one for new workers.",
      citationIds: [pendingCitationId],
      pairs: [
        { id: "fund-1", left: "Actual investment", right: "s·f(k)" },
        { id: "fund-2", left: "Break-even investment", right: "(n+δ)k" },
        { id: "fund-3", left: "Replacing depreciated capital", right: "δk" },
        { id: "fund-4", left: "Equipping new workers", right: "nk" },
      ],
    },
    {
      id: "q-match-golden-1",
      conceptSlug: "golden-rule",
      type: "match_pairs",
      stem: "Match each Golden Rule idea to the statement that describes it.",
      difficulty: 3,
      expectedSeconds: 75,
      transferDistance: 0,
      provenance: "ai_draft",
      hint: "The Golden Rule condition sets the marginal product of capital equal to the break-even requirement; for Cobb–Douglas production that translates into a saving rate equal to α.",
      citationIds: [pendingCitationId],
      pairs: [
        { id: "gold-1", left: "Golden Rule capital-stock condition", right: "f'(k_GR) = n + δ" },
        { id: "gold-2", left: "Golden Rule saving rate (Cobb–Douglas)", right: "s_GR = α" },
        { id: "gold-3", left: "What the Golden Rule saving rate maximizes", right: "steady-state consumption per worker" },
        { id: "gold-4", left: "Saving above the Golden Rule rate", right: "steady-state consumption falls" },
      ],
    },
  ];
}
