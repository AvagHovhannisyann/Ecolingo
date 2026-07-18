/**
 * Tutor-agent evaluation harness — LAYER 2 (LIVE, opt-in).
 *
 * This layer makes REAL calls to OpenRouter. It is gated exactly like the
 * Supabase integration tests: it self-skips unless BOTH
 *   - RUN_AI_EVALS=1
 *   - OPENROUTER_API_KEY is present in the environment
 * are true. CI is zero-secret by design, so this NEVER runs there (see the
 * note in .github/workflows/ci.yml). Run it locally with:
 *
 *   export $(grep -v '^#' .env.local | xargs)
 *   RUN_AI_EVALS=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt \
 *     npx vitest run src/lib/ai/__tests__/tutor-evals.live.test.ts
 *
 * It exercises the SHIPPED grounding contract — importing the route's exported
 * TUTOR_SYSTEM_PROMPT + buildFacts + MODE_INSTRUCTION + MODELS — so the live
 * probe can never silently drift from what the route actually sends.
 *
 * What it checks, per case (docs/05 §5 hallucination probes; docs/04 §20.5):
 *   (a) non-empty prose ....................... HARD gate (fail)
 *   (b) no invented digit-bearing quantities .. WARN, unless egregious (>2 ⇒ fail)
 *   (c) no citation-like patterns ............. HARD gate (fail)   ← 0 fabricated citations
 *   (d) under a sane length bound ............. WARN
 *
 * Judgment call on (b): the free-tier models paraphrase, and a stray "2" in
 * prose ("the two curves cross") is not a hallucinated quantity. So a small
 * number of unmatched digits is reported as a warning; only an egregious count
 * (>2 invented numbers) is treated as a real fabrication and fails the case.
 * (a) and (c) are the non-negotiable truth gates.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  TUTOR_SYSTEM_PROMPT,
  MODE_INSTRUCTION,
  MODELS,
  buildFacts,
} from "../../../app/api/explain/route";
import { concepts, getEquation, misconceptions } from "../../../content/econ13210";

// ---------------------------------------------------------------------------
// Gating + env loading (only when explicitly opted in)
// ---------------------------------------------------------------------------

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Tiny dotenv-style loader: populate OPENROUTER_* from app/.env.local when the
 *  eval is opted in but the shell didn't export them. No-op if the file is
 *  absent. Never runs unless RUN_AI_EVALS=1, so CI stays zero-network. */
function loadEnvLocalIfOptedIn() {
  if (process.env.RUN_AI_EVALS !== "1") return;
  try {
    // __tests__ → ai → lib → src → app/.env.local
    const envPath = path.resolve(__dirname, "../../../../.env.local");
    const raw = readFileSync(envPath, "utf8");
    for (const line of raw.split("\n")) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (!m) continue;
      const [, k, v] = m;
      if (!process.env[k]) process.env[k] = v.replace(/^["']|["']$/g, "");
    }
  } catch {
    /* file missing → rely on the shell env; gate below decides */
  }
}
loadEnvLocalIfOptedIn();

const RUN = process.env.RUN_AI_EVALS === "1" && !!process.env.OPENROUTER_API_KEY;

// ---------------------------------------------------------------------------
// Battery: 3 modes × 2 concepts = 6 cases (free-tier budget ≈ 6–8 calls)
// ---------------------------------------------------------------------------

const steadyState = concepts.find((c) => c.slug === "steady-state")!;
const goldenRule = concepts.find((c) => c.slug === "golden-rule")!;
const steadyMisc = misconceptions.find((m) => m.conceptSlug === "steady-state")!;
const goldenMisc = misconceptions.find((m) => m.conceptSlug === "golden-rule")!;

type Mode = "simpler" | "why_wrong" | "example";

interface Case {
  mode: Mode;
  concept: typeof steadyState;
  misconception: string | null;
  equationLatex: string | null;
  equationMeaning: string | null;
}

const BATTERY: Case[] = [
  { mode: "simpler", concept: steadyState, misconception: null, equationLatex: getEquation("eq-steady").latex, equationMeaning: null },
  { mode: "why_wrong", concept: steadyState, misconception: steadyMisc.description, equationLatex: getEquation("eq-steady").latex, equationMeaning: null },
  { mode: "example", concept: steadyState, misconception: null, equationLatex: getEquation("eq-steady").latex, equationMeaning: null },
  { mode: "simpler", concept: goldenRule, misconception: null, equationLatex: getEquation("eq-golden").latex, equationMeaning: null },
  { mode: "why_wrong", concept: goldenRule, misconception: goldenMisc.description, equationLatex: getEquation("eq-golden").latex, equationMeaning: null },
  { mode: "example", concept: goldenRule, misconception: null, equationLatex: getEquation("eq-golden").latex, equationMeaning: null },
];

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

// (c) citation-like patterns — any hit means the model tried to fabricate a
// source, which the tutor contract forbids outright.
const CITATION_PATTERNS: { name: string; re: RegExp }[] = [
  { name: "Lecture N", re: /lecture\s+\d/i },
  { name: "page N", re: /\bp(?:age|p?)\.?\s*\d/i },
  { name: "slide N", re: /slide\s+\d/i },
  { name: "et al", re: /\bet al\b/i },
  { name: "http link", re: /https?:\/\//i },
  { name: "(Author YEAR)", re: /\([A-Z][A-Za-z]+,?\s+\d{4}\)/ },
  { name: "doi", re: /doi:/i },
  { name: "bracket ref", re: /\[\d+\]/ },
];

const extractNumbers = (s: string): string[] => s.match(/\d+(?:\.\d+)?/g) ?? [];

interface Result {
  mode: string;
  concept: string;
  model: string;
  status: number | "network";
  proseLen: number;
  proseOk: boolean;
  citationHits: string[];
  invented: string[];
  lenOk: boolean;
  verdict: "PASS" | "WARN" | "FAIL" | "INCONCLUSIVE";
  sample: string;
}

const LEN_BOUND = 1400; // max_tokens 220 ⇒ well under this; a runaway answer trips it
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** One live call through the SHIPPED prompt/facts, primary model, retry-once on
 *  429/5xx. Mirrors the route's request exactly (system + user construction). */
async function callTutor(c: Case): Promise<{ status: number | "network"; text: string; model: string }> {
  const model = MODELS[0];
  const facts = buildFacts({
    mode: c.mode,
    conceptName: c.concept.name,
    definition: c.concept.definition,
    equationLatex: c.equationLatex,
    equationMeaning: c.equationMeaning,
    misconception: c.misconception,
    sourceLabels: ["Lecture 2, slides 5–7"],
  });
  const user = `${facts}\n\nTask: ${MODE_INSTRUCTION[c.mode]}`;

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
          max_tokens: 220,
          temperature: 0.3,
          messages: [
            { role: "system", content: TUTOR_SYSTEM_PROMPT },
            { role: "user", content: user },
          ],
        }),
      });
      if (res.status === 429 || res.status >= 500) {
        if (attempt === 0) {
          await sleep(20_000); // back off once, then retry
          continue;
        }
        return { status: res.status, text: "", model };
      }
      if (!res.ok) return { status: res.status, text: "", model };
      const data = await res.json();
      const text: string = data?.choices?.[0]?.message?.content?.trim() ?? "";
      return { status: 200, text, model };
    } catch {
      if (attempt === 0) {
        await sleep(5_000);
        continue;
      }
      return { status: "network", text: "", model };
    }
  }
  return { status: "network", text: "", model };
}

function scoreCase(c: Case, resp: { status: number | "network"; text: string; model: string }): Result {
  const text = resp.text;
  const proseOk = text.trim().length > 0;

  // Allowed numbers = everything already present in the grounded prompt.
  const promptCorpus =
    buildFacts({
      mode: c.mode,
      conceptName: c.concept.name,
      definition: c.concept.definition,
      equationLatex: c.equationLatex,
      equationMeaning: c.equationMeaning,
      misconception: c.misconception,
      sourceLabels: ["Lecture 2, slides 5–7"],
    }) +
    " " +
    MODE_INSTRUCTION[c.mode];
  const allowed = new Set(extractNumbers(promptCorpus));
  const invented = extractNumbers(text).filter((n) => !allowed.has(n));

  const citationHits = CITATION_PATTERNS.filter((p) => p.re.test(text)).map((p) => p.name);
  const lenOk = text.length <= LEN_BOUND;

  let verdict: Result["verdict"];
  if (resp.status !== 200) verdict = "INCONCLUSIVE";
  else if (!proseOk || citationHits.length > 0 || invented.length > 2) verdict = "FAIL";
  else if (invented.length > 0 || !lenOk) verdict = "WARN";
  else verdict = "PASS";

  return {
    mode: c.mode,
    concept: c.concept.slug,
    model: resp.model,
    status: resp.status,
    proseLen: text.length,
    proseOk,
    citationHits,
    invented,
    lenOk,
    verdict,
    sample: text.replace(/\s+/g, " ").slice(0, 120),
  };
}

function printTable(rows: Result[]) {
  const line = "─".repeat(112);
  console.log("\n" + line);
  console.log("LIVE TUTOR EVAL — model: " + (rows[0]?.model ?? MODELS[0]));
  console.log(line);
  console.log(
    ["mode".padEnd(11), "concept".padEnd(14), "st".padEnd(4), "len".padEnd(5), "prose", "cites".padEnd(6), "inv", "verdict"].join(" | "),
  );
  console.log(line);
  for (const r of rows) {
    console.log(
      [
        r.mode.padEnd(11),
        r.concept.padEnd(14),
        String(r.status).padEnd(4),
        String(r.proseLen).padEnd(5),
        (r.proseOk ? "ok " : "EMPTY").padEnd(5),
        (r.citationHits.length ? r.citationHits.join(",") : "—").padEnd(6),
        String(r.invented.length).padEnd(3),
        r.verdict,
      ].join(" | "),
    );
    if (r.citationHits.length) console.log("      ⚠ citation-like: " + r.citationHits.join(", "));
    if (r.invented.length) console.log("      ⚠ unmatched numbers: " + r.invented.join(", "));
    console.log("      » " + r.sample);
  }
  console.log(line + "\n");
}

// ---------------------------------------------------------------------------
// The gated suite
// ---------------------------------------------------------------------------

describe.skipIf(!RUN)("LIVE tutor evals (RUN_AI_EVALS=1) — real OpenRouter, grounded contract", () => {
  it(
    "battery of 6 grounded probes: 0 fabricated citations, non-empty prose, no egregious invented quantities",
    async () => {
      const rows: Result[] = [];
      for (const c of BATTERY) {
        const resp = await callTutor(c);
        rows.push(scoreCase(c, resp));
      }
      printTable(rows);

      const answered = rows.filter((r) => r.status === 200);
      // Infra honesty: if the free tier rate-limited EVERY case even after the
      // retry, don't assert a false failure — surface it and let the human rerun.
      if (answered.length === 0) {
        console.warn("All live cases were rate-limited/unavailable after retry — inconclusive run.");
        expect(rows.length).toBe(BATTERY.length); // suite executed; nothing to gate
        return;
      }

      // HARD GATES on every case that actually answered:
      for (const r of answered) {
        // (a) non-empty prose
        expect(r.proseOk, `[${r.mode}/${r.concept}] returned empty prose`).toBe(true);
        // (c) 0 fabricated citations — the headline Phase-3 acceptance criterion
        expect(r.citationHits, `[${r.mode}/${r.concept}] fabricated citation(s): ${r.citationHits.join(", ")}`).toEqual([]);
        // (b) egregious fabrication only (tolerant otherwise — see file header)
        expect(r.invented.length, `[${r.mode}/${r.concept}] egregious invented numbers: ${r.invented.join(", ")}`).toBeLessThanOrEqual(2);
      }
    },
    240_000,
  );
});
