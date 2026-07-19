import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  parseTemplate,
  renderTemplate,
  templateBlankIds,
  scoreCloze,
  scoreClozeDetailed,
  validateClozeQuestion,
  type ClozeSegment,
} from "../cloze";
import { scoreAnswer } from "../scoring";
import type { ClozeQuestion } from "../types";

function makeQuestion(overrides: Partial<ClozeQuestion> = {}): ClozeQuestion {
  return {
    id: "q-cloze-test-1",
    conceptSlug: "steady-state",
    type: "cloze",
    stem: "Fill in the blank.",
    template: "At the steady state, actual investment equals {{b1}} investment.",
    bank: ["break-even", "golden-rule", "gross", "replacement"],
    answerKey: { fills: { b1: "break-even" } },
    difficulty: 2,
    expectedSeconds: 30,
    transferDistance: 0,
    provenance: "ai_draft",
    hint: "The two investment curves cross here.",
    citationIds: ["cit-pending-solow"],
    ...overrides,
  };
}

describe("parseTemplate: strict template parsing", () => {
  it("rejects a template with 0 blanks", () => {
    expect(() => parseTemplate("no blanks here")).toThrow(/no blanks found/);
  });

  it("accepts 1, 2, and 3 blanks", () => {
    expect(parseTemplate("one {{b1}} blank").filter((s) => s.kind === "blank")).toHaveLength(1);
    expect(parseTemplate("two {{b1}} and {{b2}} blanks").filter((s) => s.kind === "blank")).toHaveLength(2);
    expect(
      parseTemplate("three {{b1}}, {{b2}}, and {{b3}} blanks").filter((s) => s.kind === "blank")
    ).toHaveLength(3);
  });

  it("rejects more than 3 blanks", () => {
    expect(() => parseTemplate("{{b1}} {{b2}} {{b3}} {{b4}}")).toThrow(/at most 3/);
  });

  it.each([
    ["a stray single {", "stray {brace"],
    ["a stray single }", "stray }brace"],
    ["unterminated open", "{{unterminated"],
    ["nested braces", "{{outer{{inner}}}}"],
    ["empty blank id", "{{}}"],
    ["blank id starting with a digit", "{{1blank}}"],
    ["blank id with a space", "{{blank one}}"],
    ["blank id with punctuation", "{{blank-1}}"],
  ])("throws on malformed braces: %s", (_label, template) => {
    expect(() => parseTemplate(template)).toThrow();
  });

  it("rejects duplicate blank ids", () => {
    expect(() => parseTemplate("{{b1}} and again {{b1}}")).toThrow(/duplicate blank id/);
  });

  it("preserves literal text segments in order around blanks", () => {
    const segments = parseTemplate("Start {{b1}} middle {{b2}} end.");
    expect(segments).toEqual([
      { kind: "text", value: "Start " },
      { kind: "blank", value: "b1" },
      { kind: "text", value: " middle " },
      { kind: "blank", value: "b2" },
      { kind: "text", value: " end." },
    ]);
  });

  it("allows a template that starts or ends directly on a blank (no boundary text)", () => {
    expect(parseTemplate("{{b1}} trails off")).toEqual([
      { kind: "blank", value: "b1" },
      { kind: "text", value: " trails off" },
    ]);
    expect(parseTemplate("leads into {{b1}}")).toEqual([
      { kind: "text", value: "leads into " },
      { kind: "blank", value: "b1" },
    ]);
  });

  it("templateBlankIds returns just the ordered blank ids", () => {
    expect(templateBlankIds("{{b2}} then {{b1}}")).toEqual(["b2", "b1"]);
  });
});

describe("scoreCloze / scoreClozeDetailed: contract decisions", () => {
  it("all blanks correct -> correct: true", () => {
    const q = makeQuestion({
      template: "{{b1}} and {{b2}}",
      answerKey: { fills: { b1: "depreciated", b2: "new" } },
      bank: ["depreciated", "new", "borrowed", "existing"],
    });
    const result = scoreCloze(q, { type: "cloze", fills: { b1: "depreciated", b2: "new" } });
    expect(result).toEqual({ correct: true, misconceptionSlugs: [], failedStep: null });
  });

  it("one wrong blank -> correct: false, failedStep names it", () => {
    const q = makeQuestion({
      template: "{{b1}} and {{b2}}",
      answerKey: { fills: { b1: "depreciated", b2: "new" } },
      bank: ["depreciated", "new", "borrowed", "existing"],
    });
    const result = scoreCloze(q, { type: "cloze", fills: { b1: "depreciated", b2: "borrowed" } });
    expect(result.correct).toBe(false);
    expect(result.failedStep).toBe("blank:b2");
    expect(result.misconceptionSlugs).toEqual([]);
  });

  it("both blanks wrong -> failedStep names both, in blank order", () => {
    const q = makeQuestion({
      template: "{{b1}} and {{b2}}",
      answerKey: { fills: { b1: "depreciated", b2: "new" } },
      bank: ["depreciated", "new", "borrowed", "existing"],
    });
    const result = scoreCloze(q, { type: "cloze", fills: { b1: "existing", b2: "borrowed" } });
    expect(result.correct).toBe(false);
    expect(result.failedStep).toBe("blank:b1,b2");
  });

  it("CONTRACT: a missing fill counts as incorrect for that blank, not a throw", () => {
    const q = makeQuestion();
    const result = scoreCloze(q, { type: "cloze", fills: {} });
    expect(result.correct).toBe(false);
    const detail = scoreClozeDetailed(q, { type: "cloze", fills: {} });
    expect(detail.blanks).toEqual([{ blankId: "b1", submitted: null, correct: false }]);
  });

  it("CONTRACT: extra fill keys not corresponding to any blank are ignored", () => {
    const q = makeQuestion();
    const withExtra = scoreCloze(q, {
      type: "cloze",
      fills: { b1: "break-even", "not-a-real-blank": "whatever", another: "junk" },
    });
    const clean = scoreCloze(q, { type: "cloze", fills: { b1: "break-even" } });
    expect(withExtra).toEqual(clean);
    expect(withExtra.correct).toBe(true);
  });

  it("CONTRACT: matching is exact after trim, and CASE SENSITIVE (no case-folding)", () => {
    const q = makeQuestion();
    // trimming whitespace is forgiven
    expect(scoreCloze(q, { type: "cloze", fills: { b1: "  break-even  " } }).correct).toBe(true);
    // but case is not: canonical economics terminology is authored in one
    // casing, tapped verbatim from the bank, so a different-cased submission
    // is treated as a genuine mismatch rather than silently accepted.
    expect(scoreCloze(q, { type: "cloze", fills: { b1: "Break-Even" } }).correct).toBe(false);
    expect(scoreCloze(q, { type: "cloze", fills: { b1: "BREAK-EVEN" } }).correct).toBe(false);
  });

  it("wires up through the shared scoreAnswer switch in scoring.ts", () => {
    const q = makeQuestion();
    const right = scoreAnswer(q, { type: "cloze", fills: { b1: "break-even" } });
    expect(right.correct).toBe(true);
    const wrong = scoreAnswer(q, { type: "cloze", fills: { b1: "gross" } });
    expect(wrong.correct).toBe(false);
  });

  it("rejects a mismatched answer/question type instead of guessing", () => {
    const q = makeQuestion();
    expect(() => scoreAnswer(q, { type: "numeric", raw: "1" })).toThrow(/does not match/);
  });
});

describe("validateClozeQuestion", () => {
  it("passes for a well-formed question", () => {
    expect(() => validateClozeQuestion(makeQuestion())).not.toThrow();
  });

  it("fails when an answerKey fill's value is not present in the bank", () => {
    const q = makeQuestion({ answerKey: { fills: { b1: "not-in-bank" } } });
    expect(() => validateClozeQuestion(q)).toThrow(/not present in bank/);
  });

  it("fails when the bank has duplicate entries", () => {
    const q = makeQuestion({ bank: ["break-even", "gross", "break-even"] });
    expect(() => validateClozeQuestion(q)).toThrow(/duplicate entries/);
  });

  it("fails when the template declares a blank with no answerKey fill", () => {
    const q = makeQuestion({
      template: "{{b1}} and {{b2}}",
      answerKey: { fills: { b1: "break-even" } },
      bank: ["break-even", "gross"],
    });
    expect(() => validateClozeQuestion(q)).toThrow(/missing answerKey fill for blank "b2"/);
  });

  it("fails when answerKey has a fill for a blank that doesn't exist in the template", () => {
    const q = makeQuestion({
      template: "{{b1}}",
      answerKey: { fills: { b1: "break-even", b2: "gross" } },
      bank: ["break-even", "gross"],
    });
    expect(() => validateClozeQuestion(q)).toThrow(/"b2" does not match any blank/);
  });

  it("propagates a malformed-template error from parseTemplate", () => {
    const q = makeQuestion({ template: "no blanks at all" });
    expect(() => validateClozeQuestion(q)).toThrow(/no blanks found/);
  });

  it("reports multiple violations together in one throw", () => {
    const q = makeQuestion({
      answerKey: { fills: { b1: "not-in-bank" } },
      bank: ["gross", "gross"],
    });
    try {
      validateClozeQuestion(q);
      throw new Error("expected validateClozeQuestion to throw");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      expect(msg).toMatch(/not present in bank/);
      expect(msg).toMatch(/duplicate entries/);
    }
  });
});

describe("parseTemplate / renderTemplate: fast-check round-trip property", () => {
  // Safe text: never contains "{" or "}" (which are structurally meaningful)
  // and is non-empty, so every rendered segment reappears verbatim in the
  // parse (parseTemplate never emits an empty text segment, so an arbitrary
  // that could produce one would make the round-trip comparison ill-posed).
  const safeText = fc
    .string({ minLength: 1, maxLength: 12, unit: fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,!?-_ ".split("")) })
    .filter((s) => s.length > 0);

  const blankId = fc
    .tuple(fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz".split("")), fc.string({ minLength: 0, maxLength: 6, unit: fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789_".split("")) }))
    .map(([first, rest]) => first + rest);

  /** numBlanks distinct blank ids, plus numBlanks+1 mandatory non-empty text runs around them */
  const arbCanonicalSegments = fc
    .integer({ min: 1, max: 3 })
    .chain((numBlanks) =>
      fc.tuple(
        fc.uniqueArray(blankId, { minLength: numBlanks, maxLength: numBlanks }),
        fc.array(safeText, { minLength: numBlanks + 1, maxLength: numBlanks + 1 })
      )
    )
    .map(([ids, texts]): ClozeSegment[] => {
      const segments: ClozeSegment[] = [];
      for (let i = 0; i < ids.length; i++) {
        segments.push({ kind: "text", value: texts[i] });
        segments.push({ kind: "blank", value: ids[i] });
      }
      segments.push({ kind: "text", value: texts[texts.length - 1] });
      return segments;
    });

  it("parse(render(segments)) reproduces the original segments exactly", () => {
    fc.assert(
      fc.property(arbCanonicalSegments, (segments) => {
        const rendered = renderTemplate(segments);
        const reparsed = parseTemplate(rendered);
        expect(reparsed).toEqual(segments);
      }),
      { numRuns: 300 }
    );
  });

  it("render(parse(template)) reproduces the original template string", () => {
    fc.assert(
      fc.property(arbCanonicalSegments, (segments) => {
        const template = renderTemplate(segments);
        expect(renderTemplate(parseTemplate(template))).toBe(template);
      }),
      { numRuns: 300 }
    );
  });
});
