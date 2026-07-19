import { describe, expect, it } from "vitest";
import {
  DAILY_QUESTS,
  GEMS_LESSON_COMPLETE,
  HEART_REGEN_MS,
  MAX_HEARTS,
  MONTHLY_QUESTS,
  QUESTS,
  REFILL_HEARTS_COST,
  awardGems,
  canClaimQuest,
  canRefillWithGems,
  claimQuest,
  dayKeyUTC,
  daysBetweenUTC,
  defaultEconomy,
  heartsAvailable,
  loseHeart,
  monthKeyUTC,
  msUntilNextUTCMidnight,
  questProgress,
  questProgressList,
  recordCorrectAnswers,
  recordLessonComplete,
  recordReview,
  refillWithGems,
  settleHearts,
  updateStreak,
  type EconomyState,
} from "../economy";

/** minutes/hours → ms, for readable time arithmetic in tests */
const h = (n: number) => n * 60 * 60 * 1000;
const at = (ms: number) => new Date(ms).toISOString();
const BASE = Date.parse("2026-07-19T12:00:00.000Z");

describe("economy — time helpers (UTC, pure)", () => {
  it("day and month keys are UTC slices", () => {
    expect(dayKeyUTC("2026-07-19T23:59:59.000Z")).toBe("2026-07-19");
    expect(monthKeyUTC("2026-07-19T00:00:00.000Z")).toBe("2026-07");
    // accepts a bare day key too
    expect(dayKeyUTC("2026-07-19")).toBe("2026-07-19");
  });

  it("daysBetweenUTC counts whole calendar days, signed", () => {
    expect(daysBetweenUTC("2026-07-19", "2026-07-20")).toBe(1);
    expect(daysBetweenUTC("2026-07-19", "2026-07-19")).toBe(0);
    expect(daysBetweenUTC("2026-07-20", "2026-07-19")).toBe(-1);
    expect(daysBetweenUTC("2026-07-01", "2026-08-01")).toBe(31);
  });

  it("msUntilNextUTCMidnight counts down to 00:00Z", () => {
    expect(msUntilNextUTCMidnight("2026-07-19T00:00:00.000Z")).toBe(h(24));
    expect(msUntilNextUTCMidnight("2026-07-19T23:00:00.000Z")).toBe(h(1));
    expect(msUntilNextUTCMidnight("2026-07-19T12:00:00.000Z")).toBe(h(12));
  });
});

describe("economy — defaults", () => {
  it("starts full hearts, zero gems, no streak", () => {
    const e = defaultEconomy();
    expect(e.hearts).toBe(MAX_HEARTS);
    expect(e.gems).toBe(0);
    expect(e.streakCount).toBe(0);
    expect(e.lastRegenISO).toBeNull();
    expect(e.questClaims).toEqual({});
    expect(e.counters.day).toBeNull();
  });

  it("defaultEconomy returns a fresh object each call (no shared refs)", () => {
    const a = defaultEconomy();
    const b = defaultEconomy();
    a.counters.lessonsToday = 5;
    a.questClaims["x"] = "y";
    expect(b.counters.lessonsToday).toBe(0);
    expect(b.questClaims).toEqual({});
  });
});

describe("economy — hearts: loss, regeneration, refill", () => {
  it("losing a heart from full starts the regen clock at nowISO", () => {
    const e = defaultEconomy();
    const next = loseHeart(e, at(BASE));
    expect(next.hearts).toBe(4);
    expect(next.lastRegenISO).toBe(at(BASE));
  });

  it("hearts never go below zero", () => {
    let e = defaultEconomy();
    for (let i = 0; i < 10; i++) e = loseHeart(e, at(BASE));
    expect(e.hearts).toBe(0);
  });

  it("does not mutate the input state", () => {
    const e = defaultEconomy();
    const snapshot = JSON.stringify(e);
    loseHeart(e, at(BASE));
    expect(JSON.stringify(e)).toBe(snapshot);
  });

  it("heartsAvailable regenerates 1 heart per interval, capped at MAX", () => {
    const e: EconomyState = { ...defaultEconomy(), hearts: 2, lastRegenISO: at(BASE) };
    expect(heartsAvailable(e, at(BASE))).toBe(2);
    expect(heartsAvailable(e, at(BASE + HEART_REGEN_MS - 1))).toBe(2); // boundary: not yet
    expect(heartsAvailable(e, at(BASE + HEART_REGEN_MS))).toBe(3); // exactly one interval
    expect(heartsAvailable(e, at(BASE + 2 * HEART_REGEN_MS))).toBe(4);
    expect(heartsAvailable(e, at(BASE + 100 * HEART_REGEN_MS))).toBe(MAX_HEARTS); // clamp
  });

  it("heartsAvailable is MAX and ignores anchor once full", () => {
    const e: EconomyState = { ...defaultEconomy(), hearts: MAX_HEARTS, lastRegenISO: at(BASE) };
    expect(heartsAvailable(e, at(BASE + h(100)))).toBe(MAX_HEARTS);
  });

  it("settleHearts folds regen into state and advances the anchor by whole intervals only", () => {
    const e: EconomyState = { ...defaultEconomy(), hearts: 2, lastRegenISO: at(BASE) };
    // 1.5 intervals elapsed → +1 heart, anchor advances by exactly 1 interval
    const settled = settleHearts(e, at(BASE + HEART_REGEN_MS + h(2)));
    expect(settled.hearts).toBe(3);
    expect(settled.lastRegenISO).toBe(at(BASE + HEART_REGEN_MS));
    // the leftover 2h of progress is preserved toward the next heart
    expect(heartsAvailable(settled, at(BASE + HEART_REGEN_MS + h(2)))).toBe(3);
  });

  it("settleHearts clears the anchor when it reaches full", () => {
    const e: EconomyState = { ...defaultEconomy(), hearts: 4, lastRegenISO: at(BASE) };
    const settled = settleHearts(e, at(BASE + h(10)));
    expect(settled.hearts).toBe(MAX_HEARTS);
    expect(settled.lastRegenISO).toBeNull();
  });

  it("settleHearts is a no-op when full or no anchor or no time passed", () => {
    const full = defaultEconomy();
    expect(settleHearts(full, at(BASE + h(50)))).toBe(full);
    const noAnchor: EconomyState = { ...defaultEconomy(), hearts: 3, lastRegenISO: null };
    expect(settleHearts(noAnchor, at(BASE))).toBe(noAnchor);
    const before: EconomyState = { ...defaultEconomy(), hearts: 3, lastRegenISO: at(BASE) };
    expect(settleHearts(before, at(BASE - h(1)))).toBe(before);
  });

  it("loseHeart settles pending regen before decrementing and keeps the running anchor", () => {
    const e: EconomyState = { ...defaultEconomy(), hearts: 2, lastRegenISO: at(BASE) };
    // one interval passed → settle to 3, then lose → 2, anchor kept (partial progress)
    const next = loseHeart(e, at(BASE + HEART_REGEN_MS));
    expect(next.hearts).toBe(2);
    expect(next.lastRegenISO).toBe(at(BASE + HEART_REGEN_MS));
  });

  it("refillWithGems tops to MAX and spends the exact cost, clearing the anchor", () => {
    const e: EconomyState = { ...defaultEconomy(), hearts: 1, lastRegenISO: at(BASE), gems: 400 };
    expect(canRefillWithGems(e)).toBe(true);
    const next = refillWithGems(e);
    expect(next.hearts).toBe(MAX_HEARTS);
    expect(next.gems).toBe(400 - REFILL_HEARTS_COST);
    expect(next.lastRegenISO).toBeNull();
  });

  it("refillWithGems is a no-op when hearts full or gems insufficient", () => {
    const full: EconomyState = { ...defaultEconomy(), gems: 9999 };
    expect(canRefillWithGems(full)).toBe(false);
    expect(refillWithGems(full)).toBe(full);

    const poor: EconomyState = { ...defaultEconomy(), hearts: 0, gems: REFILL_HEARTS_COST - 1 };
    expect(canRefillWithGems(poor)).toBe(false);
    expect(refillWithGems(poor)).toBe(poor);
  });
});

describe("economy — gems", () => {
  it("awardGems adds only positive amounts", () => {
    const e = defaultEconomy();
    expect(awardGems(e, 50, "chest").gems).toBe(50);
    expect(awardGems(e, 0, "noop")).toBe(e);
    expect(awardGems(e, -10, "noop")).toBe(e);
  });
});

describe("economy — streak", () => {
  it("first ever activity sets streak to 1", () => {
    const e = updateStreak(defaultEconomy(), "2026-07-19T08:00:00.000Z");
    expect(e.streakCount).toBe(1);
    expect(e.lastActiveDayISO).toBe("2026-07-19");
  });

  it("repeat activity the same UTC day is a no-op", () => {
    const day1 = updateStreak(defaultEconomy(), "2026-07-19T08:00:00.000Z");
    const same = updateStreak(day1, "2026-07-19T20:00:00.000Z");
    expect(same).toBe(day1);
    expect(same.streakCount).toBe(1);
  });

  it("consecutive days increment the streak", () => {
    let e = updateStreak(defaultEconomy(), "2026-07-19T08:00:00.000Z");
    e = updateStreak(e, "2026-07-20T08:00:00.000Z");
    e = updateStreak(e, "2026-07-21T23:59:00.000Z");
    expect(e.streakCount).toBe(3);
  });

  it("missing a full calendar day resets the streak to 1", () => {
    let e = updateStreak(defaultEconomy(), "2026-07-19T08:00:00.000Z");
    e = updateStreak(e, "2026-07-20T08:00:00.000Z");
    expect(e.streakCount).toBe(2);
    // skip the 21st entirely, next activity on the 22nd
    e = updateStreak(e, "2026-07-22T08:00:00.000Z");
    expect(e.streakCount).toBe(1);
    expect(e.lastActiveDayISO).toBe("2026-07-22");
  });

  it("ignores out-of-order / backwards timestamps", () => {
    const e = updateStreak(defaultEconomy(), "2026-07-19T08:00:00.000Z");
    const back = updateStreak(e, "2026-07-18T08:00:00.000Z");
    expect(back).toBe(e);
  });
});

describe("economy — quest catalog + progress", () => {
  it("catalog has the expected daily and monthly quests", () => {
    expect(DAILY_QUESTS.map((q) => q.id)).toEqual(["daily-lesson", "daily-correct", "daily-review"]);
    expect(MONTHLY_QUESTS.map((q) => q.id)).toEqual(["monthly-lessons"]);
    expect(QUESTS.length).toBe(4);
  });

  it("progress is zero for a fresh economy", () => {
    const e = defaultEconomy();
    for (const p of questProgressList(e, "daily", at(BASE))) {
      expect(p.current).toBe(0);
      expect(p.complete).toBe(false);
      expect(p.claimable).toBe(false);
      expect(p.fraction).toBe(0);
    }
  });

  it("progress reflects counters, clamps display to target, and marks complete", () => {
    let e = recordLessonComplete(defaultEconomy(), at(BASE));
    e = recordCorrectAnswers(e, at(BASE), 7); // exceeds the target of 5
    const lesson = questProgress(e, DAILY_QUESTS[0], at(BASE));
    expect(lesson.current).toBe(1);
    expect(lesson.complete).toBe(true);
    expect(lesson.claimable).toBe(true);
    const correct = questProgress(e, DAILY_QUESTS[1], at(BASE));
    expect(correct.current).toBe(5); // clamped to target for display
    expect(correct.fraction).toBe(1);
    expect(correct.complete).toBe(true);
  });

  it("progress reads 0 once the day rolls over (counters are period-scoped)", () => {
    const e = recordLessonComplete(defaultEconomy(), at(BASE));
    // next UTC day
    const tomorrow = "2026-07-20T09:00:00.000Z";
    expect(questProgress(e, DAILY_QUESTS[0], tomorrow).current).toBe(0);
    // monthly still counts within the same month
    const monthly = recordLessonComplete(e, tomorrow);
    expect(questProgress(monthly, MONTHLY_QUESTS[0], tomorrow).current).toBe(2);
  });
});

describe("economy — claiming quests", () => {
  it("claiming a complete quest awards gems and blocks a second claim in the period", () => {
    const e = recordLessonComplete(defaultEconomy(), at(BASE));
    // recordLessonComplete already awarded lesson gems; capture the pre-claim balance
    const before = e.gems;
    expect(canClaimQuest(e, "daily-lesson", at(BASE))).toBe(true);
    const claimed = claimQuest(e, "daily-lesson", at(BASE));
    expect(claimed.gems).toBe(before + DAILY_QUESTS[0].reward);
    expect(canClaimQuest(claimed, "daily-lesson", at(BASE))).toBe(false);
    // double-claim is a no-op (same gems, same reference-equal semantics)
    const again = claimQuest(claimed, "daily-lesson", at(BASE));
    expect(again.gems).toBe(claimed.gems);
  });

  it("cannot claim an incomplete or unknown quest", () => {
    const e = defaultEconomy();
    expect(claimQuest(e, "daily-lesson", at(BASE))).toBe(e);
    expect(claimQuest(e, "does-not-exist", at(BASE))).toBe(e);
  });

  it("a claim frees up again in the next period", () => {
    let e = recordLessonComplete(defaultEconomy(), at(BASE));
    e = claimQuest(e, "daily-lesson", at(BASE));
    expect(canClaimQuest(e, "daily-lesson", at(BASE))).toBe(false);
    // next day: complete again and the claim is available once more
    const tomorrow = "2026-07-20T09:00:00.000Z";
    e = recordLessonComplete(e, tomorrow);
    expect(canClaimQuest(e, "daily-lesson", tomorrow)).toBe(true);
  });

  it("GEMS_LESSON_COMPLETE is awarded by recordLessonComplete", () => {
    const e = recordLessonComplete(defaultEconomy(), at(BASE));
    expect(e.gems).toBe(GEMS_LESSON_COMPLETE);
    expect(e.counters.lessonsToday).toBe(1);
    expect(e.counters.lessonsThisMonth).toBe(1);
    expect(e.streakCount).toBe(1); // lesson also advances the streak
  });
});

describe("economy — activity recorders roll period counters", () => {
  it("recordReview bumps reviews and advances the streak", () => {
    const e = recordReview(defaultEconomy(), at(BASE));
    expect(e.counters.reviewsToday).toBe(1);
    expect(e.streakCount).toBe(1);
  });

  it("recordCorrectAnswers ignores non-positive counts", () => {
    const e = defaultEconomy();
    expect(recordCorrectAnswers(e, at(BASE), 0)).toBe(e);
    expect(recordCorrectAnswers(e, at(BASE), -3)).toBe(e);
  });

  it("counters reset when the recorded period changes", () => {
    let e = recordCorrectAnswers(defaultEconomy(), at(BASE), 3);
    expect(e.counters.correctToday).toBe(3);
    e = recordCorrectAnswers(e, "2026-07-20T00:00:00.000Z", 2);
    expect(e.counters.correctToday).toBe(2); // rolled to the new day
  });
});
