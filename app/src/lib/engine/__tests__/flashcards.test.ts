import { describe, expect, it } from "vitest";
import {
  cardsFromSections,
  startStudy,
  currentCard,
  mark,
  undo,
  canUndo,
  roundProgress,
  type StudyState,
} from "../flashcards";

describe("cardsFromSections", () => {
  it("keeps well-formed pairs and drops any missing a side", () => {
    const cards = cardsFromSections([
      { heading: "Abdicate", body: "To give up power" },
      { heading: "  ", body: "no front" },
      { heading: "no back", body: "   " },
      { heading: "Knoll", body: "A small hill" },
    ]);
    expect(cards).toEqual([
      { front: "Abdicate", back: "To give up power" },
      { front: "Knoll", back: "A small hill" },
    ]);
  });
});

describe("startStudy", () => {
  it("round 1 studies every card in order", () => {
    const s = startStudy(3);
    expect(s).toMatchObject({ total: 3, round: 1, roundOrder: [0, 1, 2], pos: 0, done: false });
    expect(currentCard(s)).toBe(0);
  });
  it("an empty deck is immediately done", () => {
    const s = startStudy(0);
    expect(s.done).toBe(true);
    expect(currentCard(s)).toBeNull();
  });
});

describe("mark — progression and rounds", () => {
  it("advances through the round and finishes when nothing is still-learning", () => {
    let s = startStudy(2);
    s = mark(s, "known"); // card 0 known
    expect(currentCard(s)).toBe(1);
    expect(s.done).toBe(false);
    s = mark(s, "known"); // card 1 known → round done, no still-learning
    expect(s.done).toBe(true);
    expect(s.known).toEqual([0, 1]);
    expect(currentCard(s)).toBeNull();
  });

  it("restudies only the still-learning pile in the next round; known accumulate", () => {
    let s = startStudy(3);
    s = mark(s, "known"); // 0 known
    s = mark(s, "still"); // 1 still
    s = mark(s, "still"); // 2 still → round 1 done, next round = [1,2]
    expect(s.round).toBe(2);
    expect(s.roundOrder).toEqual([1, 2]);
    expect(s.pos).toBe(0);
    expect(s.known).toEqual([0]);
    expect(s.stillThisRound).toEqual([]); // reset for the new round
    expect(roundProgress(s)).toEqual({ current: 1, total: 2 });

    s = mark(s, "known"); // 1 known
    s = mark(s, "known"); // 2 known → all learned, done
    expect(s.done).toBe(true);
    expect(new Set(s.known)).toEqual(new Set([0, 1, 2]));
  });

  it("a card kept 'still' across a round keeps reappearing until known", () => {
    let s = startStudy(1);
    s = mark(s, "still"); // round 1: card 0 still → round 2 = [0]
    expect(s.done).toBe(false);
    expect(s.round).toBe(2);
    expect(currentCard(s)).toBe(0);
    s = mark(s, "still"); // still again → round 3 = [0]
    expect(s.done).toBe(false);
    s = mark(s, "known"); // finally known → done
    expect(s.done).toBe(true);
    expect(s.known).toEqual([0]);
  });

  it("is a no-op once done", () => {
    let s = startStudy(1);
    s = mark(s, "known");
    const after = mark(s, "known");
    expect(after).toEqual(s);
  });
});

describe("undo", () => {
  it("reverts the last mark within a round and restores the bucket", () => {
    let s = startStudy(3);
    s = mark(s, "known"); // 0 known
    s = mark(s, "still"); // 1 still
    expect(canUndo(s)).toBe(true);
    s = undo(s); // revert the 'still' on card 1
    expect(currentCard(s)).toBe(1);
    expect(s.stillThisRound).toEqual([]);
    s = undo(s); // revert the 'known' on card 0
    expect(currentCard(s)).toBe(0);
    expect(s.known).toEqual([]);
    expect(canUndo(s)).toBe(false);
  });

  it("does not cross a round boundary (history clears each round)", () => {
    let s = startStudy(1);
    s = mark(s, "still"); // round 1 done → round 2, history cleared
    expect(canUndo(s)).toBe(false);
    expect(undo(s)).toEqual(s); // no-op
  });

  it("undo on a fresh state is a no-op", () => {
    const s: StudyState = startStudy(2);
    expect(undo(s)).toEqual(s);
  });
});
