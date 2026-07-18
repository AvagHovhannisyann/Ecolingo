import { afterEach, describe, expect, it, vi } from "vitest";
import { DeterministicExplainProvider, LLMExplainProvider, type ExplainInput } from "../explain";
import { concepts, getEquation } from "../../../content/econ13210";

const concept = concepts.find((c) => c.slug === "steady-state")!;
const equation = getEquation("eq-fundamental");

const input = (mode: ExplainInput["mode"]): ExplainInput => ({
  mode,
  concept,
  equation,
  citations: [{ id: "pending", label: "pending", sourceFileId: null, pageStart: null, pageEnd: null, status: "planned_unverified" }],
  misconception: null,
  simplerVariant: null,
});

afterEach(() => vi.unstubAllGlobals());

describe("LLMExplainProvider (D-010) — live tutor with deterministic fallback", () => {
  it("layers AI prose over the deterministic output on success", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ text: "A friendly grounded explanation." }), { status: 200 })));
    const out = await new LLMExplainProvider().explain(input("simpler"));
    expect(out.generatedBy).toBe("ai");
    expect(out.segments[0]).toEqual({ kind: "text", text: "A friendly grounded explanation." });
  });

  it("keeps equations code-rendered, never model-authored (GATE-002)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ text: "Here is the idea in words." }), { status: 200 })));
    const out = await new LLMExplainProvider().explain(input("mathematics"));
    // the only math segment must equal the deterministic equation LaTeX
    const mathSegs = out.segments.filter((s) => s.kind === "math");
    expect(mathSegs.length).toBeGreaterThan(0);
    expect(mathSegs.some((s) => s.kind === "math" && s.latex === equation.latex)).toBe(true);
  });

  it("preserves the graph reference for graph mode", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ text: "Watch the two curves cross." }), { status: 200 })));
    const out = await new LLMExplainProvider().explain(input("graph"));
    expect(out.segments.some((s) => s.kind === "graph_ref")).toBe(true);
  });

  it("falls back to the deterministic output when the route errors (GATE-009)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 502 })));
    const out = await new LLMExplainProvider().explain(input("intuition"));
    const det = new DeterministicExplainProvider().explain(input("intuition"));
    expect(out.generatedBy).toBe("deterministic");
    expect(out.segments).toEqual(det.segments);
  });

  it("falls back when the network throws", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network"); }));
    const out = await new LLMExplainProvider().explain(input("three_sentences"));
    expect(out.generatedBy).toBe("deterministic");
  });

  it("falls back when the model returns empty prose", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ text: "   " }), { status: 200 })));
    const out = await new LLMExplainProvider().explain(input("simpler"));
    expect(out.generatedBy).toBe("deterministic");
  });

  it("never fabricates citations — passes through the deterministic ones (GATE-001)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ text: "See Lecture 9 page 4." }), { status: 200 })));
    const out = await new LLMExplainProvider().explain(input("simpler"));
    // even if the model names a source in prose, citations come from input only
    expect(out.citations).toHaveLength(1);
    expect(out.citations[0].status).toBe("planned_unverified");
  });
});
