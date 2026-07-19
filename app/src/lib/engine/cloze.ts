/**
 * CLOZE (fill-in-the-blank with a word bank, Duolingo-style) exercise format.
 *
 * A cloze question's `template` is plain text with 1–3 `{{blankId}}`
 * placeholders. The learner fills each blank by tapping a word from the
 * question's `bank` (correct fills + distractors, every entry distinct).
 * Scoring is deterministic and AI never grades (mirrors the posture of the
 * six MVP formats in scoring.ts).
 *
 * This module owns three responsibilities, kept separate on purpose:
 *   - parseTemplate:        template string -> ordered segments (pure parsing)
 *   - scoreCloze:           ScoreResult for the scoring.ts switch (thin)
 *   - scoreClozeDetailed:   per-blank breakdown for learner-facing feedback
 *   - validateClozeQuestion: content-authoring guardrail (throws)
 */

import type { ClozeQuestion } from "./types";
import type { ScoreResult } from "./scoring";

export interface ClozeSegment {
  /** "text" segments render verbatim; "blank" segments are fill points */
  kind: "text" | "blank";
  /** literal text for kind "text"; the blank id for kind "blank" */
  value: string;
}

export interface ClozeBlankResult {
  blankId: string;
  /** what the learner submitted for this blank, trimmed; null if omitted */
  submitted: string | null;
  correct: boolean;
}

export interface ClozeScoreDetail {
  correct: boolean;
  blanks: ClozeBlankResult[];
}

/**
 * A blank id must look like an identifier: a letter, then letters/digits/underscore.
 * This keeps `{{...}}` unambiguous — no whitespace, no punctuation, no nesting.
 */
const BLANK_ID_RE = /^[A-Za-z][A-Za-z0-9_]*$/;

const MIN_BLANKS = 1;
const MAX_BLANKS = 3;

/**
 * Parses a cloze template into an ordered list of text/blank segments.
 *
 * Strict by design: any placeholder syntax the author didn't intend (a stray
 * "{" or "}", an unterminated "{{", nested braces, an empty or malformed
 * blank id) throws immediately, as does a template with 0 blanks or more
 * than 3. The intent is that malformed content throws at content-build time
 * (i.e. when the seed file that calls this — or validateClozeQuestion, which
 * calls this — is imported/executed), so a bad template can never reach a
 * learner. There is no silent recovery path here on purpose.
 */
export function parseTemplate(template: string): ClozeSegment[] {
  const segments: ClozeSegment[] = [];
  const blankIds: string[] = [];
  const n = template.length;
  let i = 0;
  let textStart = 0;

  const flushText = (end: number) => {
    if (end > textStart) segments.push({ kind: "text", value: template.slice(textStart, end) });
  };

  while (i < n) {
    const ch = template[i];
    if (ch === "{") {
      if (template[i + 1] !== "{") {
        throw new Error(`malformed cloze template: stray "{" at index ${i} (did you mean "{{"?)`);
      }
      const closeIdx = template.indexOf("}}", i + 2);
      if (closeIdx === -1) {
        throw new Error(`malformed cloze template: unterminated "{{" starting at index ${i}`);
      }
      const inner = template.slice(i + 2, closeIdx);
      if (inner.includes("{") || inner.includes("}")) {
        throw new Error(`malformed cloze template: nested braces inside placeholder at index ${i}`);
      }
      if (!BLANK_ID_RE.test(inner)) {
        throw new Error(
          `malformed cloze template: invalid blank id "${inner}" at index ${i} (must match ${BLANK_ID_RE})`
        );
      }
      flushText(i);
      segments.push({ kind: "blank", value: inner });
      blankIds.push(inner);
      i = closeIdx + 2;
      textStart = i;
      continue;
    }
    if (ch === "}") {
      // Any "}}" that legitimately closes a blank was already consumed above
      // (i jumps past closeIdx+2), so a "}" reachable here is always stray.
      throw new Error(`malformed cloze template: stray "}" at index ${i}`);
    }
    i++;
  }
  flushText(n);

  if (blankIds.length < MIN_BLANKS) {
    throw new Error(
      `malformed cloze template: no blanks found — a cloze template must contain ${MIN_BLANKS}-${MAX_BLANKS} {{blankId}} placeholders`
    );
  }
  if (blankIds.length > MAX_BLANKS) {
    throw new Error(
      `malformed cloze template: ${blankIds.length} blanks found, at most ${MAX_BLANKS} are allowed`
    );
  }
  const dupes = [...new Set(blankIds.filter((id, idx) => blankIds.indexOf(id) !== idx))];
  if (dupes.length > 0) {
    throw new Error(`malformed cloze template: duplicate blank id(s): ${dupes.join(", ")}`);
  }

  return segments;
}

/** Inverse of parseTemplate — reconstructs the template string from segments. */
export function renderTemplate(segments: ClozeSegment[]): string {
  return segments.map((s) => (s.kind === "blank" ? `{{${s.value}}}` : s.value)).join("");
}

/** The ordered blank ids a template declares, in reading order. */
export function templateBlankIds(template: string): string[] {
  return parseTemplate(template)
    .filter((s): s is ClozeSegment & { kind: "blank" } => s.kind === "blank")
    .map((s) => s.value);
}

/**
 * Per-blank scoring with a full breakdown, for learner-facing feedback (which
 * specific blank(s) were wrong) rather than just pass/fail.
 *
 * Contract decisions, made explicit and tested:
 *  - Match rule: exact string equality after trimming whitespace, CASE
 *    SENSITIVE. No case-folding. Economics vocabulary in this course (e.g.
 *    "break-even" vs "golden-rule" investment, "GDP") is canonical
 *    terminology, not free prose — accepting arbitrary casing would blur the
 *    signal a wrong-case answer gives (e.g. it can indicate the learner
 *    munged a bank word rather than recalling the term), and every bank entry
 *    is authored in one canonical casing that the learner taps verbatim, so
 *    there is no legitimate reason for a differently-cased submission to
 *    exist. This mirrors the numeric format's insistence on mathematical
 *    (not typographic) equivalence, just applied to a discrete vocabulary.
 *  - Missing fill: a blank absent from `answer.fills` is scored incorrect
 *    (not thrown) — the engine stays defensive even though the UI layer is
 *    expected to prevent incomplete submissions.
 *  - Extra fill keys: keys in `answer.fills` that don't correspond to any
 *    blank in the template are IGNORED. We only ever read the blank ids the
 *    template itself declares; nothing about an unrelated extra key affects
 *    scoring. This keeps the scorer robust to a client that (for example)
 *    carries stale keys across a template edit, and avoids inventing a new
 *    failure mode ("unknown blank") that the other five formats have no
 *    equivalent of.
 */
export function scoreClozeDetailed(
  question: ClozeQuestion,
  answer: { type: "cloze"; fills: Record<string, string> }
): ClozeScoreDetail {
  const blankIds = templateBlankIds(question.template);

  const blanks: ClozeBlankResult[] = blankIds.map((blankId) => {
    const expectedRaw = question.answerKey.fills[blankId];
    const submittedRaw = answer.fills[blankId];
    const submitted = typeof submittedRaw === "string" ? submittedRaw.trim() : null;
    const expected = typeof expectedRaw === "string" ? expectedRaw.trim() : null;
    const correct = submitted !== null && expected !== null && submitted === expected;
    return { blankId, submitted, correct };
  });

  return { correct: blanks.every((b) => b.correct), blanks };
}

/** ScoreResult-shaped entry point, wired into scoring.ts's scoreAnswer switch. */
export function scoreCloze(
  question: ClozeQuestion,
  answer: { type: "cloze"; fills: Record<string, string> }
): ScoreResult {
  const detail = scoreClozeDetailed(question, answer);
  if (detail.correct) return { correct: true, misconceptionSlugs: [], failedStep: null };
  const wrongIds = detail.blanks.filter((b) => !b.correct).map((b) => b.blankId);
  return { correct: false, misconceptionSlugs: [], failedStep: `blank:${wrongIds.join(",")}` };
}

/**
 * Validates a cloze question's internal consistency:
 *  - the template parses (strict — see parseTemplate)
 *  - every blank the template declares has an answerKey fill, and vice versa
 *  - bank entries are all distinct
 *  - every answerKey fill value is present in the bank (so the learner can
 *    always tap their way to a correct answer)
 *
 * Throws a single Error joining every violation found, rather than returning
 * a result object, so content files can call this unconditionally at module
 * load: bad content fails the build/test run loudly instead of shipping.
 */
export function validateClozeQuestion(q: ClozeQuestion): void {
  const errors: string[] = [];

  let blankIds: string[];
  try {
    blankIds = templateBlankIds(q.template);
  } catch (e) {
    throw new Error(`invalid cloze question "${q.id}": ${e instanceof Error ? e.message : String(e)}`);
  }

  for (const id of blankIds) {
    if (!(id in q.answerKey.fills)) errors.push(`missing answerKey fill for blank "${id}"`);
  }
  for (const id of Object.keys(q.answerKey.fills)) {
    if (!blankIds.includes(id)) errors.push(`answerKey fill "${id}" does not match any blank in the template`);
  }

  const dupeBank = [...new Set(q.bank.filter((b, i) => q.bank.indexOf(b) !== i))];
  if (dupeBank.length > 0) errors.push(`bank contains duplicate entries: ${dupeBank.join(", ")}`);

  for (const [blankId, fillValue] of Object.entries(q.answerKey.fills)) {
    if (!q.bank.includes(fillValue)) {
      errors.push(`answerKey fill for "${blankId}" ("${fillValue}") is not present in bank`);
    }
  }

  if (errors.length > 0) {
    throw new Error(`invalid cloze question "${q.id}":\n- ${errors.join("\n- ")}`);
  }
}
