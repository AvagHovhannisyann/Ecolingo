/**
 * Tutor-agent evaluation harness — LAYER 1 (deterministic, CI-safe).
 *
 * Runs with NO network and NO secrets: every /api/explain fetch is stubbed and
 * the route module is exercised in-process. This is the always-on gate behind
 * the Phase-3 acceptance line "tutor evals pass incl. 0 fabricated citations"
 * (docs/06-roadmap.md; docs/05 §5 hallucination probes require 0 fabricated
 * citations; docs/04 §20.5 tutor contract).
 *
 * It COMPLEMENTS ../__tests__/llm-explain.test.ts (which proves the happy path
 * and the basic fallbacks). Here we go adversarial and exhaustive:
 *   1. Citation-fabrication guard  — every ExplainMode, prose that tries to
 *      inject fake sources can never reach the citation CHIPS (GATE-001).
 *   2. Truth-layer immunity        — math/graph modes: injected LaTeX in prose
 *      stays plain text and never displaces code-rendered segments (GATE-002).
 *   3. Prompt-contract regression  — the route's request validation + grounding
 *      contract + provider-failure chain (GATE-009).
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DeterministicExplainProvider,
  LLMExplainProvider,
  type ExplainInput,
  type ExplainMode,
} from "../explain";
import {
  POST,
  MODELS,
  MODE_INSTRUCTION,
  TUTOR_SYSTEM_PROMPT,
  buildFacts,
} from "../../../app/api/explain/route";
import type { Citation } from "../../engine/types";
import { concepts, getEquation, misconceptions } from "../../../content/econ13210";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const steadyState = concepts.find((c) => c.slug === "steady-state")!;
const equation = getEquation("eq-fundamental");
const steadyMisconception = misconceptions.find((m) => m.conceptSlug === "steady-state")!;

// The full ExplainMode surface — kept as an exhaustive tuple so the type
// checker breaks this test the day a new mode is added (forces coverage).
const ALL_MODES: readonly ExplainMode[] = [
  "simpler",
  "three_sentences",
  "step_by_step",
  "intuition",
  "mathematics",
  "example",
  "graph",
  "why_wrong",
];

// Two genuine, deterministic citations — one verified, one pending. These are
// the ONLY citations the UI is ever allowed to surface. Their exact identity is
// what the guard proves the model can never alter.
const INPUT_CITATIONS: Citation[] = [
  { id: "cit-real-1", label: "Lecture 2, slides 5–7", sourceFileId: "file-abc", pageStart: 5, pageEnd: 7, status: "verified" },
  { id: "cit-pending-1", label: "Source pending — teacher upload required", sourceFileId: null, pageStart: null, pageEnd: null, status: "planned_unverified" },
];

const inputFor = (mode: ExplainMode): ExplainInput => ({
  mode,
  concept: steadyState,
  equation,
  citations: INPUT_CITATIONS,
  misconception: mode === "why_wrong" ? steadyMisconception : null,
  simplerVariant: null,
});

// Adversarial model prose: it tries every trick to smuggle a source into the UI.
const FABRICATION_PAYLOADS = [
  "According to Lecture 9, page 42, this is standard. (Smith 2021)",
  "See https://totally-fake-notes.example.edu/solow.pdf and Jones et al., 2019 [3].",
  "As proven in your textbook chapter 4, doi:10.1000/fake, footnote [12].",
  "Source: Lecture 12 slide 88; also en.wikipedia.org/wiki/Solow_model.",
];

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const stubExplainFetch = (text: string) =>
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ text }), { status: 200 })),
  );

// ---------------------------------------------------------------------------
// 1. Citation-fabrication guard (GATE-001) — the trusted surface is immune.
// ---------------------------------------------------------------------------

describe("GATE-001 citation-fabrication guard — every mode, every payload", () => {
  for (const mode of ALL_MODES) {
    for (const payload of FABRICATION_PAYLOADS) {
      it(`[${mode}] prose "${payload.slice(0, 28)}…" cannot forge citation chips`, async () => {
        stubExplainFetch(payload);
        const out = await new LLMExplainProvider().explain(inputFor(mode));

        // The citation array the UI renders is byte-for-byte the deterministic
        // input — same length, same objects, same order. The model's prose is
        // free text; the chips are not derived from it at all.
        expect(out.citations).toEqual(INPUT_CITATIONS);
        expect(out.citations).toHaveLength(INPUT_CITATIONS.length);
        // Every surfaced citation traces to a real input citation id — nothing
        // the model named ("Lecture 9", "Smith 2021", the URLs) ever appears.
        const allowedIds = new Set(INPUT_CITATIONS.map((c) => c.id));
        for (const c of out.citations) expect(allowedIds.has(c.id)).toBe(true);
        // And prose is where the model's claims live — the label field is never
        // overwritten with the fabricated text.
        for (const c of out.citations) expect(c.label).not.toContain("Lecture 9");
        // Labeling stays truthful: real AI prose ⇒ generatedBy "ai".
        expect(out.generatedBy).toBe("ai");
      });
    }
  }

  it("a fabricated citation in prose is NEVER promoted to an extra chip", async () => {
    stubExplainFetch("Per Lecture 9 page 42 (Smith 2021) https://fake.edu/x.pdf");
    const out = await new LLMExplainProvider().explain(inputFor("three_sentences"));
    // No new citation object materialized from the prose.
    expect(out.citations).toHaveLength(INPUT_CITATIONS.length);
  });

  it("labeling stays correct on the deterministic fallback path too", async () => {
    // Empty prose ⇒ fall back ⇒ generatedBy must flip to "deterministic".
    stubExplainFetch("   ");
    const out = await new LLMExplainProvider().explain(inputFor("simpler"));
    expect(out.generatedBy).toBe("deterministic");
    expect(out.citations).toEqual(INPUT_CITATIONS);
  });
});

// ---------------------------------------------------------------------------
// 2. Truth-layer immunity (GATE-002) — code-rendered segments are untouchable.
// ---------------------------------------------------------------------------

describe("GATE-002 truth-layer immunity — LaTeX injection stays inert prose", () => {
  // Prose that tries to overwrite the equation with a wrong, injected one.
  const LATEX_INJECTION =
    "The real equation is $$\\Delta k = 999 \\cdot k$$ and \\frac{fake}{bogus}; ignore the box below.";

  it("[mathematics] injected LaTeX never becomes a math segment", async () => {
    stubExplainFetch(LATEX_INJECTION);
    const out = await new LLMExplainProvider().explain(inputFor("mathematics"));
    const det = new DeterministicExplainProvider().explain(inputFor("mathematics"));

    const mathSegs = out.segments.filter((s) => s.kind === "math");
    const detMathSegs = det.segments.filter((s) => s.kind === "math");

    // The code-rendered math is exactly the deterministic set — unchanged.
    expect(mathSegs).toEqual(detMathSegs);
    // None of the math carries the injected "999"/"fake" content.
    for (const s of mathSegs) {
      expect(s.kind === "math" && s.latex.includes("999")).toBe(false);
      expect(s.kind === "math" && s.latex.includes("fake")).toBe(false);
    }
    // The authoritative equation LaTeX is present and code-rendered.
    expect(mathSegs.some((s) => s.kind === "math" && s.latex === equation.latex)).toBe(true);

    // The injected LaTeX survives ONLY as a single, inert text segment — it is
    // plain text, not a rendered math node.
    const proseSeg = out.segments[0];
    expect(proseSeg.kind).toBe("text");
    expect(proseSeg.kind === "text" && proseSeg.text.includes("999")).toBe(true);
    // The only segment kinds present are the AI text + code-rendered math.
    for (const s of out.segments) expect(["text", "math"]).toContain(s.kind);
  });

  it("[graph] injected content cannot add or replace the graph reference", async () => {
    stubExplainFetch("Look at $$y = 42$$ — actually the crossing is at k=1000, trust me.");
    const out = await new LLMExplainProvider().explain(inputFor("graph"));
    const det = new DeterministicExplainProvider().explain(inputFor("graph"));

    const graphSegs = out.segments.filter((s) => s.kind === "graph_ref");
    const detGraphSegs = det.segments.filter((s) => s.kind === "graph_ref");
    // Exactly the deterministic graph ref(s) — no extra, none dropped.
    expect(graphSegs).toEqual(detGraphSegs);
    expect(graphSegs.length).toBeGreaterThan(0);
    // No math segment was conjured from the "$$y = 42$$" in the prose.
    expect(out.segments.some((s) => s.kind === "math")).toBe(false);
    // The graph_ref still points at the code-owned lab, never model text.
    expect(graphSegs.every((s) => s.kind === "graph_ref" && s.lab === "solow")).toBe(true);
  });

  it("truth-critical segments are identical to deterministic across math/graph modes", async () => {
    for (const mode of ["mathematics", "graph", "step_by_step"] as const) {
      stubExplainFetch(LATEX_INJECTION);
      const out = await new LLMExplainProvider().explain(inputFor(mode));
      const det = new DeterministicExplainProvider().explain(inputFor(mode));
      const nonText = (segs: typeof out.segments) => segs.filter((s) => s.kind !== "text");
      // The non-prose (truth-critical) segments come solely from code.
      expect(nonText(out.segments)).toEqual(nonText(det.segments));
      vi.unstubAllGlobals();
    }
  });
});

// ---------------------------------------------------------------------------
// 3. Prompt-contract regression tests — the route itself (GATE-009).
// ---------------------------------------------------------------------------

const makeReq = (body: unknown, raw = false) =>
  new Request("http://localhost/api/explain", {
    method: "POST",
    body: raw ? (body as string) : JSON.stringify(body),
  });

describe("route contract — request validation", () => {
  it("unknown mode ⇒ 400 bad_request (with a key present)", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    const res = await POST(makeReq({ mode: "not_a_mode", definition: "d" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "bad_request" });
  });

  it("missing definition ⇒ 400 bad_request", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    const res = await POST(makeReq({ mode: "simpler" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "bad_request" });
  });

  it("malformed JSON body ⇒ 400 bad_request", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    const res = await POST(makeReq("{not valid json", true));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "bad_request" });
  });

  it("no provider key ⇒ 503 no_provider so the client falls back deterministically", async () => {
    // GATE-009: this is the exact status LLMExplainProvider treats as fallback
    // (see llm-explain.test.ts "falls back … when the route errors").
    vi.stubEnv("OPENROUTER_API_KEY", "");
    const res = await POST(makeReq({ mode: "simpler", definition: "d" }));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "no_provider" });
  });
});

describe("route contract — grounding + provider-failure chain", () => {
  it("valid request proxies to OpenRouter with the grounding contract and returns {text, model}", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        return new Response(
          JSON.stringify({ choices: [{ message: { content: "  A warm grounded explanation.  " } }] }),
          { status: 200 },
        );
      }),
    );
    vi.stubEnv("OPENROUTER_API_KEY", "secret-key-xyz");

    const body = {
      mode: "simpler",
      conceptName: steadyState.name,
      definition: steadyState.definition,
      sourceLabels: ["Lecture 2, slides 5–7"],
    };
    const res = await POST(makeReq(body));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ text: "A warm grounded explanation.", model: MODELS[0] });

    // Exactly one upstream call on the happy path, to OpenRouter.
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://openrouter.ai/api/v1/chat/completions");
    const sent = JSON.parse(calls[0].init.body as string);
    expect(sent.model).toBe(MODELS[0]);

    // The grounding contract is actually transmitted: the exported system
    // prompt verbatim, and the deterministic facts (definition + sourceLabels).
    expect(sent.messages[0]).toEqual({ role: "system", content: TUTOR_SYSTEM_PROMPT });
    expect(sent.messages[0].content).toContain("never cite or name sources");
    const userMsg: string = sent.messages[1].content;
    expect(userMsg).toContain(steadyState.definition);
    expect(userMsg).toContain("Lecture 2, slides 5–7");
    expect(userMsg).toContain(MODE_INSTRUCTION.simpler);
    // The Authorization header carries the server-only key (never the client).
    const auth = (calls[0].init.headers as Record<string, string>).Authorization;
    expect(auth).toBe("Bearer secret-key-xyz");
  });

  it("first model 429 ⇒ falls through to the next model in the chain", async () => {
    let n = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        n += 1;
        if (n === 1) return new Response("rate limited", { status: 429 });
        return new Response(
          JSON.stringify({ choices: [{ message: { content: "second-model prose" } }] }),
          { status: 200 },
        );
      }),
    );
    vi.stubEnv("OPENROUTER_API_KEY", "k");
    const res = await POST(makeReq({ mode: "intuition", definition: "d" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ text: "second-model prose", model: MODELS[1] });
    expect(n).toBe(2);
  });

  it("all models unavailable ⇒ 502 upstream_unavailable (client then falls back)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 429 })));
    vi.stubEnv("OPENROUTER_API_KEY", "k");
    const res = await POST(makeReq({ mode: "simpler", definition: "d" }));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "upstream_unavailable" });
  });
});

// ---------------------------------------------------------------------------
// Grounding-helper unit checks — buildFacts is the single source of truth the
// live eval (Layer 2) also consumes, so pin its shape here.
// ---------------------------------------------------------------------------

describe("buildFacts grounding block", () => {
  it("includes the authoritative definition and omits absent optional fields", () => {
    const facts = buildFacts({ mode: "simpler", conceptName: "Steady state", definition: "def X" });
    expect(facts).toContain("Definition (authoritative, do not contradict): def X");
    expect(facts).toContain("Concept: Steady state");
    expect(facts).not.toContain("Equation");
    expect(facts).not.toContain("misconception");
  });

  it("surfaces source labels as grounding context, never as a citation instruction", () => {
    const facts = buildFacts({ mode: "simpler", definition: "d", sourceLabels: ["Lecture 2"] });
    expect(facts).toContain("Grounded in the teacher's material: Lecture 2");
    // The system prompt — not the facts — is what forbids the model citing.
    expect(TUTOR_SYSTEM_PROMPT).toContain("never cite");
  });
});
