import { describe, expect, it } from "vitest";
import { DeterministicExplainProvider } from "../../ai/explain";
import { concepts, conceptEdges, course, getConcept, getEquation, misconceptions, questions } from "../../../content/econ13210";
import type { LessonStepType } from "../types";

const provider = new DeterministicExplainProvider();

function explainInput(mode: Parameters<DeterministicExplainProvider["explain"]>[0]["mode"]) {
  const concept = getConcept("steady-state");
  return {
    mode,
    concept,
    equation: getEquation("eq-fundamental"),
    citations: course.citations.filter((c) => concept.citationIds.includes(c.id)),
    misconception: null,
    simplerVariant: "The steady state is where the bucket's inflow equals its leak.",
  };
}

describe("Explain provider honours grounding rules (spec §10)", () => {
  it("unverified content is never presented as fully grounded (GATE-001 / IDEA-182)", () => {
    const out = provider.explain(explainInput("three_sentences"));
    expect(out.uncertainty).toBe("partially_grounded");
    expect(out.citations.every((c) => c.status === "planned_unverified")).toBe(true);
    expect(out.citations.every((c) => c.sourceFileId === null)).toBe(true);
  });

  it("never fabricates citations: output citations ⊆ input citations", () => {
    const input = explainInput("step_by_step");
    const out = provider.explain(input);
    const inputIds = new Set(input.citations.map((c) => c.id));
    expect(out.citations.every((c) => inputIds.has(c.id))).toBe(true);
  });

  it("locked definitions are interpolated verbatim, even in simpler mode (GATE-004)", () => {
    const input = explainInput("simpler");
    const locked = { ...input, concept: { ...input.concept, locked: true } };
    const out = provider.explain(locked);
    const text = out.segments.filter((s) => s.kind === "text").map((s) => (s as { text: string }).text).join(" ");
    expect(text).toContain(locked.concept.definition);
    expect(text).not.toContain("bucket"); // simpler variant suppressed under lock
  });

  it("why_wrong uses the misconception registry when available", () => {
    const input = { ...explainInput("why_wrong"), misconception: misconceptions[1] };
    const out = provider.explain(input);
    const text = out.segments.filter((s) => s.kind === "text").map((s) => (s as { text: string }).text).join(" ");
    expect(text).toContain(misconceptions[1].remediationHint);
  });

  it("graph mode routes to a code-rendered lab, never an image (GATE-002)", () => {
    const out = provider.explain(explainInput("graph"));
    expect(out.segments.some((s) => s.kind === "graph_ref")).toBe(true);
  });
});

describe("ECON 13210 seed content integrity", () => {
  it("every lesson contains the full six-step anatomy in canonical order (LESSON-01..06)", () => {
    const expected: LessonStepType[] = ["core_idea", "intuition", "visual", "math", "guided", "mastery_check"];
    expect(course.lessons.length).toBeGreaterThanOrEqual(2);
    for (const lesson of course.lessons) {
      expect(lesson.steps.map((s) => s.type)).toEqual(expected);
      for (const s of lesson.steps) expect(s.completionCriterion).toBeTruthy();
    }
  });

  it("every visual step carries deterministic target + success descriptions", () => {
    for (const lesson of course.lessons) {
      for (const s of lesson.steps) {
        if (s.type === "visual") {
          expect(s.targetDescription.length).toBeGreaterThan(0);
          expect(s.successDescription.length).toBeGreaterThan(0);
          expect(s.target.value).toBeGreaterThan(0);
        }
      }
    }
  });

  it("every mastery check is a transfer question (LESSON-06: new context, not memorization)", () => {
    for (const lesson of course.lessons) {
      const check = lesson.steps.find((s) => s.type === "mastery_check");
      const q = questions.find((x) => check && "questionId" in check && x.id === check.questionId);
      expect(q?.transferDistance).toBeGreaterThan(0);
    }
  });

  it("every lesson step question id and equation id resolves", () => {
    const qIds = new Set(questions.map((q) => q.id));
    const eqIds = new Set(course.equations.map((e) => e.id));
    for (const lesson of course.lessons) {
      for (const s of lesson.steps) {
        if ("questionId" in s) expect(qIds.has(s.questionId)).toBe(true);
        if (s.type === "math") expect(eqIds.has(s.equationId)).toBe(true);
      }
    }
  });

  it("prerequisite graph is a DAG over known concepts (MOAT-02)", () => {
    const slugs = new Set(concepts.map((c) => c.slug));
    for (const e of conceptEdges) {
      expect(slugs.has(e.prereqSlug)).toBe(true);
      expect(slugs.has(e.conceptSlug)).toBe(true);
      expect(e.prereqSlug).not.toBe(e.conceptSlug);
    }
    // topological sort must consume every node
    const inDeg = new Map<string, number>([...slugs].map((s) => [s, 0]));
    for (const e of conceptEdges) inDeg.set(e.conceptSlug, (inDeg.get(e.conceptSlug) ?? 0) + 1);
    const queue = [...inDeg].filter(([, d]) => d === 0).map(([s]) => s);
    let seen = 0;
    while (queue.length) {
      const s = queue.shift()!;
      seen++;
      for (const e of conceptEdges.filter((x) => x.prereqSlug === s)) {
        const d = (inDeg.get(e.conceptSlug) ?? 0) - 1;
        inDeg.set(e.conceptSlug, d);
        if (d === 0) queue.push(e.conceptSlug);
      }
    }
    expect(seen).toBe(slugs.size);
  });

  it("every question has an answer key, hint, citations, and provenance (GATE-003, §23)", () => {
    for (const q of questions) {
      // match_pairs has no separate answerKey by design: each pair's shared id
      // IS the key (engine/match-pairs.ts). Everything else carries answerKey.
      if (q.type === "match_pairs") expect(q.pairs.length).toBeGreaterThanOrEqual(3);
      else expect(q.answerKey).toBeTruthy();
      expect(q.hint.length).toBeGreaterThan(0);
      expect(q.citationIds.length).toBeGreaterThan(0);
      expect(["teacher_authored", "ai_draft", "ai_approved"]).toContain(q.provenance);
    }
  });

  it("all seed content is flagged planned_unverified until ingestion (D-005)", () => {
    expect(course.sourceStatus).toBe("planned_unverified");
    for (const c of concepts) expect(c.sourceStatus).toBe("planned_unverified");
  });

  it("wrong options map to registered misconceptions (MOAT-03)", () => {
    const known = new Set(misconceptions.map((m) => m.slug));
    for (const q of questions) {
      if (q.type === "mc_single" || q.type === "mc_multi") {
        for (const o of q.options) {
          if (o.misconceptionSlug) expect(known.has(o.misconceptionSlug)).toBe(true);
        }
      }
    }
  });
});
