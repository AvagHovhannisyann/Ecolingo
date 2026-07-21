/**
 * Client for the grounded teacher-document generator (D-030). Calls the
 * same-origin /api/teach-generate route (which holds the OpenRouter key) and
 * returns clean {heading, body} sections, or an honest failure the caller can
 * surface (GATE-009 — never a silent empty success vs. real failure).
 */

import type { GuideSection } from "@/app/api/teach-generate/route";
import type { TeachingStyle } from "@/lib/engine/teaching-style";

export type GenerateOutcome =
  | { ok: true; sections: GuideSection[]; model: string | null }
  | { ok: false; reason: "no_provider" | "empty" | "error" };

export async function generateHandout(
  mode: string,
  sections: { heading: string; text: string }[],
  style?: TeachingStyle | null,
  opts?: {
    level?: "simpler" | "advanced";
    /** reading_level: concrete target audience */
    audience?: string;
    /** rubric: number of performance levels + total points */
    rubricLevels?: number;
    rubricPoints?: number;
  },
): Promise<GenerateOutcome> {
  try {
    const res = await fetch("/api/teach-generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode,
        sections,
        style: style ?? undefined,
        level: opts?.level,
        audience: opts?.audience,
        rubricLevels: opts?.rubricLevels,
        rubricPoints: opts?.rubricPoints,
      }),
    });
    if (res.status === 503) return { ok: false, reason: "no_provider" };
    if (!res.ok) return { ok: false, reason: "error" };
    const data = (await res.json()) as { sections?: GuideSection[]; model?: string };
    const out = Array.isArray(data.sections) ? data.sections : [];
    if (out.length === 0) return { ok: false, reason: "empty" };
    return { ok: true, sections: out, model: typeof data.model === "string" ? data.model : null };
  } catch {
    return { ok: false, reason: "error" };
  }
}
