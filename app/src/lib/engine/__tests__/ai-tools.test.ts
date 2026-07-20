import { describe, expect, it } from "vitest";
import { AI_TOOLS, liveGenerateModes, liveTools, plannedTools } from "../ai-tools";

describe("AI tools registry", () => {
  it("has unique ids and complete, teacher-facing copy on every tool", () => {
    const ids = AI_TOOLS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of AI_TOOLS) {
      expect(t.label.length).toBeGreaterThan(0);
      expect(t.description.length).toBeGreaterThan(0);
      expect(t.glyph.length).toBeGreaterThan(0);
    }
  });

  it("live/planned partitions are exhaustive and disjoint", () => {
    expect(liveTools().length + plannedTools().length).toBe(AI_TOOLS.length);
    expect(liveTools().every((t) => t.status === "live")).toBe(true);
    expect(plannedTools().every((t) => t.status === "planned")).toBe(true);
  });

  it("every live tool has an actionable action; planned tools do nothing", () => {
    for (const t of liveTools()) expect(t.action.kind).not.toBe("none");
    for (const t of plannedTools()) expect(t.action.kind).toBe("none");
  });

  it("route tools carry an in-app href; generate tools carry a mode", () => {
    for (const t of AI_TOOLS) {
      if (t.action.kind === "route") expect(t.action.href.startsWith("/")).toBe(true);
      if (t.action.kind === "generate") expect(t.action.mode.length).toBeGreaterThan(0);
    }
  });

  it("live generate modes are exactly the grounded generator's contract", () => {
    // These must match /api/teach-generate's accepted modes.
    expect(new Set(liveGenerateModes())).toEqual(new Set(["study_guide", "worked_examples", "key_points"]));
  });
});
