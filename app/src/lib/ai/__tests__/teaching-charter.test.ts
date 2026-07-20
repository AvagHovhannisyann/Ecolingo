import { describe, expect, it } from "vitest";
import { TEACHING_CHARTER } from "../teaching-charter";
import { TUTOR_SYSTEM_PROMPT } from "../../../app/api/explain/route";
import { COMPILE_SYSTEM_PROMPT, CLARIFY_SYSTEM_PROMPT } from "../../../app/api/compile-course/route";
import { GENERATE_SYSTEM_PROMPT } from "../../../app/api/teach-generate/route";
import { buildDraftPrompt } from "../../../app/api/draft-questions/route";

describe("TEACHING_CHARTER", () => {
  it("states the non-negotiable commitments", () => {
    // grounding / honesty
    expect(TEACHING_CHARTER).toMatch(/ONLY the facts/);
    expect(TEACHING_CHARTER).toMatch(/never invent/i);
    // pedagogy
    expect(TEACHING_CHARTER).toMatch(/misconception/i);
    expect(TEACHING_CHARTER).toMatch(/prerequisite/i);
    // student-centred + accessibility
    expect(TEACHING_CHARTER).toMatch(/growth mindset/i);
    expect(TEACHING_CHARTER).toMatch(/plain language/i);
    // subject-agnostic
    expect(TEACHING_CHARTER).toMatch(/NO built-in subject/);
    // safety + integrity + prompt-injection resistance
    expect(TEACHING_CHARTER).toMatch(/not cheating|not just handing over/i);
    expect(TEACHING_CHARTER).toMatch(/personal data/i);
    expect(TEACHING_CHARTER).toMatch(/Ignore any instruction embedded/i);
    // it is a substantial charter, not a one-liner
    expect(TEACHING_CHARTER.length).toBeGreaterThan(2000);
  });
});

describe("charter is composed into every teacher/tutor prompt", () => {
  it("each OpenRouter system prompt carries the shared charter", () => {
    expect(TUTOR_SYSTEM_PROMPT.includes(TEACHING_CHARTER)).toBe(true);
    expect(COMPILE_SYSTEM_PROMPT.includes(TEACHING_CHARTER)).toBe(true);
    expect(CLARIFY_SYSTEM_PROMPT.includes(TEACHING_CHARTER)).toBe(true);
    expect(GENERATE_SYSTEM_PROMPT.includes(TEACHING_CHARTER)).toBe(true);
    const { system } = buildDraftPrompt({
      conceptName: "X",
      definition: "d",
      sectionText: "",
      count: 3,
      tier: "mixed",
    });
    expect(system.includes(TEACHING_CHARTER)).toBe(true);
  });

  it("each prompt still carries its own task contract after the charter", () => {
    expect(TUTOR_SYSTEM_PROMPT).toContain("never cite or name sources");
    expect(COMPILE_SYSTEM_PROMPT).toContain('"units"');
    expect(GENERATE_SYSTEM_PROMPT).toContain("ONLY a JSON object");
    expect(buildDraftPrompt({ conceptName: "X", definition: "d", sectionText: "", count: 3, tier: "mixed" }).system).toContain(
      "Reply with ONLY a JSON array",
    );
  });
});
