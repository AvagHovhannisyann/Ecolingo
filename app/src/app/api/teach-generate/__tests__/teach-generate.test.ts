import { afterEach, describe, expect, it, vi } from "vitest";
import {
  GENERATE_SYSTEM_PROMPT,
  POST,
  buildGenerateUser,
  extractJsonObject,
  normalizeMode,
  sanitizeGuide,
} from "../route";

function makeReq(body: unknown): Request {
  return new Request("http://localhost/api/teach-generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("normalizeMode", () => {
  it("accepts every live mode and defaults everything else to study_guide", () => {
    for (const m of ["worked_examples", "key_points", "study_guide", "flashcards", "misconceptions", "rubric", "reading_level"]) {
      expect(normalizeMode(m)).toBe(m);
    }
    expect(normalizeMode("nonsense")).toBe("study_guide");
    expect(normalizeMode(undefined)).toBe("study_guide");
  });
});

describe("buildGenerateUser reading-level", () => {
  it("bakes the target level into the reading_level task", () => {
    const simpler = buildGenerateUser("reading_level", [{ heading: "P", text: "the passage" }], "simpler");
    const advanced = buildGenerateUser("reading_level", [{ heading: "P", text: "the passage" }], "advanced");
    expect(simpler).toMatch(/SIMPLER reader/);
    expect(advanced).toMatch(/MORE ADVANCED reader/);
    expect(simpler).toContain("the passage");
  });
});

describe("sanitizeGuide", () => {
  it("keeps only well-formed {heading, body} sections and trims/caps them", () => {
    const out = sanitizeGuide({
      sections: [
        { heading: "  A  ", body: "  hello  " },
        { heading: "", body: "no heading" }, // dropped
        { heading: "B", body: "" }, // dropped
        { heading: "C", body: "x".repeat(2000) }, // capped
        "garbage",
      ],
    });
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({ heading: "A", body: "hello" });
    expect(out[1].body.length).toBe(1200);
  });

  it("caps at 20 sections and degrades non-objects to []", () => {
    const many = { sections: Array.from({ length: 40 }, (_, i) => ({ heading: `H${i}`, body: "b" })) };
    expect(sanitizeGuide(many)).toHaveLength(20);
    expect(sanitizeGuide(null)).toEqual([]);
    expect(sanitizeGuide({ sections: "no" })).toEqual([]);
  });
});

describe("prompt contract", () => {
  it("system prompt enforces grounding (facts only, no citations)", () => {
    expect(GENERATE_SYSTEM_PROMPT).toContain("ONLY the facts");
    expect(GENERATE_SYSTEM_PROMPT).toContain("never cite");
    expect(GENERATE_SYSTEM_PROMPT).toContain("never invent");
  });

  it("user message embeds the material and the mode task", () => {
    const user = buildGenerateUser("key_points", [{ heading: "Topic", text: "the content" }]);
    expect(user).toContain("Topic");
    expect(user).toContain("the content");
    expect(user).toContain("KEY-POINTS");
  });
});

describe("extractJsonObject", () => {
  it("pulls a JSON object out of fenced/prose-wrapped model output", () => {
    expect(extractJsonObject('noise ```json {"sections":[]} ``` tail')).toEqual({ sections: [] });
    expect(extractJsonObject("not json at all")).toBeNull();
  });
});

describe("route contract", () => {
  it("no server key ⇒ 503 no_provider with an empty section list", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "");
    const res = await POST(makeReq({ mode: "study_guide", sections: [{ heading: "h", text: "t" }] }));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "no_provider", sections: [] });
  });

  it("with a key but no usable sections ⇒ empty result, no upstream call", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "k");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const res = await POST(makeReq({ mode: "study_guide", sections: [{ heading: "h" }] }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ sections: [] });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
