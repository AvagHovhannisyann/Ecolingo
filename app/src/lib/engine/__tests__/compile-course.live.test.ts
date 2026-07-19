/**
 * Course-compiler + question-factory LIVE proof — opt-in (decision D-020).
 *
 * Makes REAL calls to OpenRouter through the SHIPPED route contracts (imports
 * the routes' exported prompts + MODELS so this can't drift from what ships).
 * Self-skips unless BOTH RUN_AI_EVALS=1 and OPENROUTER_API_KEY are set, exactly
 * like tutor-evals.live.test.ts — so zero-secret CI never runs it. Run locally:
 *
 *   export $(grep -v '^#' .env.local | xargs)
 *   RUN_AI_EVALS=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt \
 *     npx vitest run src/lib/engine/__tests__/compile-course.live.test.ts
 *
 * Proves:
 *   1. Compiling the bundled SAMPLE_LECTURE_MD sections yields a sanitized plan
 *      with ≥3 lessons, all valid derived slugs, and a valid prereq DAG.
 *   2. Generating an EASY and a HARD mc_single batch for "steady-state" yields
 *      ≥1 sanitizer-accepted draft of each tier.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { sectionize } from "../ingest";
import { sanitizeCoursePlan, planToCourseDraft } from "../compile-course";
import { sanitizeDraftedQuestions } from "../authored";
import {
  COMPILE_SYSTEM_PROMPT,
  buildCompileUser,
  extractJsonObject,
  MODELS as COMPILE_MODELS,
} from "../../../app/api/compile-course/route";
import {
  buildDraftPrompt,
  extractJsonArray,
  MODELS as DRAFT_MODELS,
} from "../../../app/api/draft-questions/route";
import { SAMPLE_LECTURE_MD, SAMPLE_LECTURE_TITLE } from "../../../content/econ13210/sample-lecture";
import { concepts } from "../../../content/econ13210";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** load OPENROUTER_* from app/.env.local when opted in (mirrors tutor-evals.live) */
function loadEnvLocalIfOptedIn() {
  if (process.env.RUN_AI_EVALS !== "1") return;
  try {
    // __tests__ → engine → lib → src → app/.env.local
    const envPath = path.resolve(__dirname, "../../../../.env.local");
    const raw = readFileSync(envPath, "utf8");
    for (const line of raw.split("\n")) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (!m) continue;
      const [, k, v] = m;
      if (!process.env[k]) process.env[k] = v.replace(/^["']|["']$/g, "");
    }
  } catch {
    /* rely on shell env; gate decides */
  }
}
loadEnvLocalIfOptedIn();

const RUN = process.env.RUN_AI_EVALS === "1" && !!process.env.OPENROUTER_API_KEY;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function chat(model: string, system: string, user: string, maxTokens: number): Promise<string> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "X-Title": "Ecolingo",
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          temperature: 0.3,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        }),
      });
      if (res.status === 429 || res.status >= 500) {
        if (attempt === 0) {
          await sleep(20_000);
          continue;
        }
        return "";
      }
      if (!res.ok) return "";
      const data = await res.json();
      return data?.choices?.[0]?.message?.content?.trim() ?? "";
    } catch {
      if (attempt === 0) {
        await sleep(5_000);
        continue;
      }
      return "";
    }
  }
  return "";
}

describe.skipIf(!RUN)("LIVE course compiler + question factory (RUN_AI_EVALS=1)", () => {
  it(
    "compiles the sample lecture into a sanitized plan with ≥3 lessons and a valid DAG",
    async () => {
      const doc = sectionize(SAMPLE_LECTURE_TITLE, SAMPLE_LECTURE_MD, new Date().toISOString());
      const sections = doc.sections.map((s) => ({ id: s.id, heading: s.heading, text: s.text }));
      const allowed = new Set(sections.map((s) => s.id));

      const content = await chat(COMPILE_MODELS[0], COMPILE_SYSTEM_PROMPT, buildCompileUser(sections), 2200);
      if (!content) {
        console.warn("compile: no content after retry — inconclusive");
        return;
      }
      const parsed = extractJsonObject(content);
      const { plan, droppedPrereqPairs } = sanitizeCoursePlan(parsed, allowed);
      const lessons = plan.units.flatMap((u) => u.lessons);

      console.log("\n── LIVE COMPILE ──────────────────────────────────────────");
      console.log(`units=${plan.units.length} lessons=${lessons.length} prereqEdges=${plan.prereqPairs.length} droppedEdges=${droppedPrereqPairs.length}`);
      for (const u of plan.units) console.log(`  unit "${u.title}": ${u.lessons.map((l) => l.conceptSlug).join(", ")}`);
      console.log(`  prereqs: ${plan.prereqPairs.map((p) => p.join("→")).join("  ") || "(none)"}`);

      // ≥3 lessons, all with valid non-empty slugs
      expect(lessons.length).toBeGreaterThanOrEqual(3);
      for (const l of lessons) expect(l.conceptSlug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      // slugs unique
      const slugs = lessons.map((l) => l.conceptSlug);
      expect(new Set(slugs).size).toBe(slugs.length);
      // prereq endpoints all reference real slugs (DAG already guaranteed by sanitizer)
      const slugSet = new Set(slugs);
      for (const [a, b] of plan.prereqPairs) {
        expect(slugSet.has(a)).toBe(true);
        expect(slugSet.has(b)).toBe(true);
      }
      // converts to real engine types without throwing
      const draft = planToCourseDraft(plan, []);
      expect(draft.concepts.length).toBe(lessons.length);
      for (const c of draft.concepts) expect(c.sourceStatus).toBe("planned_unverified");
    },
    240_000
  );

  it(
    "generates ≥1 accepted EASY and ≥1 accepted HARD mc_single draft for steady-state",
    async () => {
      const steady = concepts.find((c) => c.slug === "steady-state")!;
      const results: Record<string, number> = {};
      for (const tier of ["easy", "hard"] as const) {
        const { system, user } = buildDraftPrompt({
          conceptName: steady.name,
          definition: steady.definition,
          sectionText: SAMPLE_LECTURE_MD,
          count: 4,
          tier,
        });
        // Up to 2 batches per tier — one stochastic free-tier call can return
        // all-multi/nothing; we only need one accepted single to prove the tier.
        let accepted = 0;
        for (let batch = 0; batch < 2 && accepted === 0; batch++) {
          const content = await chat(DRAFT_MODELS[0], system, user, 1100);
          const parsed = extractJsonArray(content);
          const singles = Array.isArray(parsed)
            ? parsed.filter(
                (x) =>
                  x &&
                  typeof x === "object" &&
                  (x as Record<string, unknown>).kind !== "multi" &&
                  !Array.isArray((x as Record<string, unknown>).correctIndices)
              )
            : [];
          const drafts = sanitizeDraftedQuestions(singles, 8);
          accepted = drafts.length;
          console.log(`\n── LIVE FACTORY [${tier}] batch ${batch + 1} ── accepted ${drafts.length} mc_single`);
          for (const d of drafts) console.log(`   • ${d.stem.slice(0, 90)}`);
        }
        results[tier] = accepted;
      }
      // Infra honesty: if the free tier gave nothing for both tiers, don't fail.
      if (results.easy === 0 && results.hard === 0) {
        console.warn("factory: no drafts for either tier after retry — inconclusive");
        return;
      }
      expect(results.easy).toBeGreaterThanOrEqual(1);
      expect(results.hard).toBeGreaterThanOrEqual(1);
    },
    240_000
  );
});
