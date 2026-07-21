import { afterEach, describe, expect, it, vi } from "vitest";
import { POST, buildGraphSpecUser, GRAPH_SPEC_SYSTEM_PROMPT, extractJsonObject } from "../route";

const makeReq = (body: unknown, raw = false) =>
  new Request("http://localhost/api/graph-spec", {
    method: "POST",
    body: raw ? (body as string) : JSON.stringify(body),
  });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("graph-spec prompt", () => {
  it("system prompt forbids drawing and demands a listed family", () => {
    expect(GRAPH_SPEC_SYSTEM_PROMPT).toMatch(/never draw the curve yourself/i);
    expect(GRAPH_SPEC_SYSTEM_PROMPT).toContain('"familyId"');
  });
  it("user message embeds the family catalogue and the request verbatim", () => {
    const u = buildGraphSpecUser("a diminishing returns curve");
    expect(u).toContain('id "power"');
    expect(u).toContain("a diminishing returns curve");
  });
  it("extractJsonObject pulls the object out of fenced prose", () => {
    expect(extractJsonObject('sure:\n```json\n{"familyId":"linear"}\n```')).toEqual({ familyId: "linear" });
  });
});

describe("graph-spec route contract", () => {
  it("no provider key ⇒ 503", async () => {
    vi.stubEnv("GROQ_API_KEY", "");
    vi.stubEnv("OPENROUTER_API_KEY", "");
    const res = await POST(makeReq({ request: "a linear graph" }));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "no_provider", spec: null });
  });

  it("malformed JSON ⇒ 400", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "k");
    const res = await POST(makeReq("{not json", true));
    expect(res.status).toBe(400);
  });

  it("too-short request ⇒ 400", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "k");
    const res = await POST(makeReq({ request: "x" }));
    expect(res.status).toBe(400);
  });

  it("model returns an UNKNOWN family ⇒ 502 (never an invalid spec)", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "k");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ choices: [{ message: { content: '{"familyId":"wormhole","params":{}}' } }] }), {
          status: 200,
        }),
      ),
    );
    const res = await POST(makeReq({ request: "some exotic curve" }));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "upstream_unavailable", spec: null });
  });

  it("a valid mapping ⇒ 200 with a sanitized, in-range spec", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "k");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content:
                    '{"familyId":"power","params":{"A":2,"alpha":50},"title":"Output","xLabel":"capital","yLabel":"output"}',
                },
              },
            ],
          }),
          { status: 200 },
        ),
      ),
    );
    const res = await POST(makeReq({ request: "diminishing returns" }));
    expect(res.status).toBe(200);
    const { spec } = (await res.json()) as { spec: { familyId: string; params: Record<string, number>; xLabel: string } };
    expect(spec.familyId).toBe("power");
    expect(spec.params.alpha).toBe(2); // clamped from 50 to the max
    expect(spec.xLabel).toBe("capital");
  });
});
