"use client";

/**
 * The "printable" handoff (D-030). The exam builder and the AI toolkit both
 * produce something the teacher wants on paper; they stash it here and send the
 * teacher to /teach/print, which renders it print-friendly. Same localStorage
 * discipline as plan-store: versioned, try/catch guarded (a full/blocked quota
 * never crashes the flow — GATE-009).
 */

import type { Exam } from "@/lib/engine/exam";
import type { GuideSection } from "@/app/api/teach-generate/route";

export const PRINTABLE_KEY = "ecolingo.printable.v1";

export interface PrintableExam {
  kind: "exam";
  exam: Exam;
}

export interface PrintableHandout {
  kind: "handout";
  title: string;
  /** which generator mode produced it (for a subtle provenance line) */
  mode: string;
  sourceTitle: string;
  model: string | null;
  generatedAtISO: string;
  sections: GuideSection[];
}

export type PrintableDoc = PrintableExam | PrintableHandout;

export function savePrintable(doc: PrintableDoc): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PRINTABLE_KEY, JSON.stringify(doc));
  } catch {
    /* quota blocked — the caller still holds the value in memory */
  }
}

export function loadPrintable(): PrintableDoc | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PRINTABLE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PrintableDoc;
    if (parsed?.kind === "exam" && parsed.exam) return parsed;
    if (parsed?.kind === "handout" && Array.isArray(parsed.sections)) return parsed;
    return null;
  } catch {
    return null;
  }
}
