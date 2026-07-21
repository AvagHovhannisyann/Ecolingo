/**
 * Flashcard study engine (D-046) — the pure, deterministic state machine behind
 * the interactive Quizlet-style study mode.
 *
 * The teacher's grounded generator already produces {heading, body} pairs
 * (front = a term/question, back = the concise answer); this turns a deck of
 * those into a spaced study loop: study every card once, sort each into "know
 * it" or "still learning", then restudy only the "still learning" pile in the
 * next round, until nothing is left to learn. Known cards accumulate across
 * rounds. All arithmetic and progression lives here so the component renders no
 * logic and every rule is unit-testable.
 *
 * Interaction polish (flip animation, swipe gestures, exact card look) is the
 * component's/Fabel's concern; this file owns only the deck logic.
 */

export interface Flashcard {
  front: string;
  back: string;
}

/** Build a deck from generator sections, dropping any card missing a side. */
export function cardsFromSections(sections: readonly { heading: string; body: string }[]): Flashcard[] {
  const out: Flashcard[] = [];
  for (const s of sections) {
    const front = (s.heading ?? "").trim();
    const back = (s.body ?? "").trim();
    if (front && back) out.push({ front, back });
  }
  return out;
}

export type Bucket = "known" | "still";

export interface StudyState {
  /** total distinct cards in the deck */
  total: number;
  /** 1-based round number */
  round: number;
  /** card indices to study THIS round, in order */
  roundOrder: number[];
  /** position within roundOrder (0-based); equals roundOrder.length when the round is finished */
  pos: number;
  /** card indices marked "know it", cumulative across rounds, in mark order */
  known: number[];
  /** card indices marked "still learning" during the CURRENT round */
  stillThisRound: number[];
  /** per-round history for undo (cleared at each round boundary) */
  history: { pos: number; bucket: Bucket; card: number }[];
  done: boolean;
}

/** Begin studying a deck of `total` cards (round 1 = every card, in order). */
export function startStudy(total: number): StudyState {
  const n = Math.max(0, Math.trunc(total));
  return {
    total: n,
    round: 1,
    roundOrder: Array.from({ length: n }, (_, i) => i),
    pos: 0,
    known: [],
    stillThisRound: [],
    history: [],
    done: n === 0,
  };
}

/** The card index currently shown, or null when the deck is done/empty. */
export function currentCard(s: StudyState): number | null {
  if (s.done) return null;
  return s.pos < s.roundOrder.length ? s.roundOrder[s.pos] : null;
}

/**
 * Sort the current card into a bucket and advance. When the round's last card is
 * sorted: finish if nothing was "still learning", otherwise start the next round
 * with exactly that pile. Known cards never return. A no-op when already done.
 */
export function mark(s: StudyState, bucket: Bucket): StudyState {
  const card = currentCard(s);
  if (card === null) return s;

  const history = [...s.history, { pos: s.pos, bucket, card }];
  let known = s.known;
  let stillThisRound = s.stillThisRound;
  if (bucket === "known") {
    if (!known.includes(card)) known = [...known, card];
  } else if (!stillThisRound.includes(card)) {
    stillThisRound = [...stillThisRound, card];
  }

  const nextPos = s.pos + 1;
  if (nextPos >= s.roundOrder.length) {
    // round complete
    if (stillThisRound.length === 0) {
      return { ...s, pos: nextPos, known, stillThisRound, history, done: true };
    }
    return {
      ...s,
      round: s.round + 1,
      roundOrder: stillThisRound,
      pos: 0,
      known,
      stillThisRound: [],
      history: [], // undo does not cross a round boundary
      done: false,
    };
  }
  return { ...s, pos: nextPos, known, stillThisRound, history, done: false };
}

/** Undo the last mark WITHIN the current round (no-op across a round boundary). */
export function undo(s: StudyState): StudyState {
  if (s.history.length === 0) return s;
  const last = s.history[s.history.length - 1];
  const history = s.history.slice(0, -1);
  let known = s.known;
  let stillThisRound = s.stillThisRound;
  if (last.bucket === "known") known = known.filter((c) => c !== last.card);
  else stillThisRound = stillThisRound.filter((c) => c !== last.card);
  return { ...s, pos: last.pos, known, stillThisRound, history, done: false };
}

/** Whether an undo is currently possible (something to revert this round). */
export function canUndo(s: StudyState): boolean {
  return s.history.length > 0;
}

/** Human progress within the round: 1-based position and the round's size. */
export function roundProgress(s: StudyState): { current: number; total: number } {
  const total = s.roundOrder.length;
  return { current: Math.min(s.pos + 1, total), total };
}
