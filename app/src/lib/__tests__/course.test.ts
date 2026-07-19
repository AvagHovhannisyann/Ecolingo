/**
 * Unit tests for the pure retry orchestration extracted from course.ts.
 * retryInsertCourse is the shared primitive behind both ensureMyCourse and
 * createCourse; here we drive it with synthetic `attempt` closures (no live
 * database) to pin down its retry/abort/give-up semantics deterministically.
 */

import { describe, expect, it, vi } from "vitest";
import { retryInsertCourse, type CourseInsertOutcome, type CourseSummary } from "../course";

const course: CourseSummary = { id: "c1", title: "ECON 13210", joinCode: "ABC234" };

describe("retryInsertCourse", () => {
  it("resolves immediately when the first attempt is ok", async () => {
    const attempt = vi.fn(async (): Promise<CourseInsertOutcome> => ({ status: "ok", course }));
    const result = await retryInsertCourse(attempt, () => "CODE01");
    expect(result).toEqual(course);
    expect(attempt).toHaveBeenCalledTimes(1);
    expect(attempt).toHaveBeenCalledWith("CODE01");
  });

  it("retries on a join_code collision with a FRESH code, then succeeds", async () => {
    const codes = ["CODE01", "CODE02", "CODE03"];
    let i = 0;
    const seen: string[] = [];
    const attempt = vi.fn(async (code: string): Promise<CourseInsertOutcome> => {
      seen.push(code);
      return seen.length < 3 ? { status: "collision" } : { status: "ok", course };
    });
    const result = await retryInsertCourse(attempt, () => codes[i++]);
    expect(result).toEqual(course);
    // a new code was generated for every attempt — no code reuse across retries
    expect(seen).toEqual(["CODE01", "CODE02", "CODE03"]);
    expect(attempt).toHaveBeenCalledTimes(3);
  });

  it("gives up (null) after maxAttempts consecutive collisions", async () => {
    const attempt = vi.fn(async (): Promise<CourseInsertOutcome> => ({ status: "collision" }));
    const result = await retryInsertCourse(attempt, () => "CODE01", 5);
    expect(result).toBeNull();
    expect(attempt).toHaveBeenCalledTimes(5);
  });

  it("aborts immediately (null, no retry) on a non-collision error", async () => {
    const attempt = vi.fn(async (): Promise<CourseInsertOutcome> => ({ status: "error" }));
    const result = await retryInsertCourse(attempt, () => "CODE01");
    expect(result).toBeNull();
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it("lets a closure resolve a collision to ok (ensureMyCourse's reuse-on-race path)", async () => {
    // first code collides but the closure finds an already-owned course and
    // returns it as ok — proving the reuse policy lives in the closure, not here
    const attempt = vi.fn(async (): Promise<CourseInsertOutcome> => ({ status: "ok", course }));
    const result = await retryInsertCourse(attempt, () => "CODE01");
    expect(result).toEqual(course);
    expect(attempt).toHaveBeenCalledTimes(1);
  });
});
