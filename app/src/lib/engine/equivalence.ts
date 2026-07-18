/**
 * Deterministic answer-equivalence checking (IDEA-183, TEST-ECON-015).
 * A mathematically equivalent answer must never be marked wrong.
 *
 * Accepted numeric input forms: decimals ("0.25"), commas as decimal
 * separators ("0,25"), percentages when the key is a rate ("25%"),
 * simple fractions ("1/4"), leading +, and surrounding whitespace.
 */

export interface NumericKey {
  value: number;
  relTolerance: number;
  equivalentForms?: string[];
}

export type ParseResult = { ok: true; value: number } | { ok: false; reason: string };

export function parseNumericAnswer(raw: string): ParseResult {
  const trimmed = raw.trim().replace(/\s+/g, "");
  if (trimmed === "") return { ok: false, reason: "empty" };

  let s = trimmed;
  let percent = false;
  if (s.endsWith("%")) {
    percent = true;
    s = s.slice(0, -1);
  }
  // comma as decimal separator (only when unambiguous: single comma, no dot)
  if (s.includes(",") && !s.includes(".")) {
    if ((s.match(/,/g) ?? []).length === 1) s = s.replace(",", ".");
    else return { ok: false, reason: "ambiguous_separators" };
  }

  // simple fraction a/b
  const frac = s.match(/^([+-]?\d+(?:\.\d+)?)\/([+-]?\d+(?:\.\d+)?)$/);
  if (frac) {
    const num = Number(frac[1]);
    const den = Number(frac[2]);
    if (den === 0) return { ok: false, reason: "division_by_zero" };
    const v = num / den;
    return { ok: true, value: percent ? v / 100 : v };
  }

  if (!/^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/.test(s)) {
    return { ok: false, reason: "not_a_number" };
  }
  const v = Number(s);
  if (!Number.isFinite(v)) return { ok: false, reason: "not_finite" };
  return { ok: true, value: percent ? v / 100 : v };
}

export function numericallyEquivalent(a: number, b: number, relTolerance: number): boolean {
  if (a === b) return true;
  const scale = Math.max(Math.abs(a), Math.abs(b), 1e-12);
  return Math.abs(a - b) / scale <= relTolerance;
}

export interface EquivalenceVerdict {
  correct: boolean;
  parsed: number | null;
  /** why an incorrect verdict was reached — feeds feedback, never silent */
  reason: "match" | "match_alt_form" | "wrong_value" | "unparseable";
}

export function checkNumericAnswer(raw: string, key: NumericKey): EquivalenceVerdict {
  const parsed = parseNumericAnswer(raw);
  if (!parsed.ok) {
    // an alternate accepted literal form (e.g. "k*" symbolic tokens) may still match
    const alt = key.equivalentForms?.some((f) => f.replace(/\s+/g, "") === raw.trim().replace(/\s+/g, ""));
    if (alt) return { correct: true, parsed: null, reason: "match_alt_form" };
    return { correct: false, parsed: null, reason: "unparseable" };
  }
  // percentage-of-rate convention: if the key is a rate in (0,1) and the learner
  // typed the same number scaled by 100 without a % sign (e.g. "25" for 0.25),
  // accept it — the value is mathematically the same quantity in percent units.
  if (numericallyEquivalent(parsed.value, key.value, key.relTolerance)) {
    return { correct: true, parsed: parsed.value, reason: "match" };
  }
  if (key.value > 0 && key.value < 1 && numericallyEquivalent(parsed.value / 100, key.value, key.relTolerance)) {
    return { correct: true, parsed: parsed.value / 100, reason: "match_alt_form" };
  }
  return { correct: false, parsed: parsed.value, reason: "wrong_value" };
}
