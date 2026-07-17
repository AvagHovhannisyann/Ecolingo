import { describe, expect, it } from "vitest";
import { computeStreak, distinctStudyDays } from "../stats";

const today = "2026-07-17T14:00:00.000Z";

describe("distinctStudyDays", () => {
  it("dedupes multiple events on the same day and sorts", () => {
    expect(
      distinctStudyDays(["2026-07-16T09:00:00Z", "2026-07-16T21:00:00Z", "2026-07-15T10:00:00Z"])
    ).toEqual(["2026-07-15", "2026-07-16"]);
  });

  it("is empty for no events", () => {
    expect(distinctStudyDays([])).toEqual([]);
  });
});

describe("computeStreak (IDEA-124: forgiving, never mid-day-broken)", () => {
  it("is 0 with no study history", () => {
    expect(computeStreak([], today)).toBe(0);
  });

  it("counts consecutive days ending today", () => {
    expect(
      computeStreak(["2026-07-15T08:00:00Z", "2026-07-16T08:00:00Z", "2026-07-17T08:00:00Z"], today)
    ).toBe(3);
  });

  it("keeps yesterday's streak alive when today hasn't been studied yet", () => {
    expect(computeStreak(["2026-07-15T08:00:00Z", "2026-07-16T08:00:00Z"], today)).toBe(2);
  });

  it("is 0 once a full day has been skipped", () => {
    expect(computeStreak(["2026-07-14T08:00:00Z", "2026-07-15T08:00:00Z"], today)).toBe(0);
  });

  it("stops counting at a gap inside the history", () => {
    expect(
      computeStreak(
        ["2026-07-12T08:00:00Z", "2026-07-13T08:00:00Z", "2026-07-16T08:00:00Z", "2026-07-17T08:00:00Z"],
        today
      )
    ).toBe(2);
  });

  it("counts several events on one day as a single streak day", () => {
    expect(computeStreak(["2026-07-17T01:00:00Z", "2026-07-17T23:00:00Z"], today)).toBe(1);
  });
});
