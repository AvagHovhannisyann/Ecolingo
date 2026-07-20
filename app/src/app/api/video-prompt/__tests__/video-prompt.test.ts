import { afterEach, describe, expect, it, vi } from "vitest";
import { POST, VIDEO_PROMPT_SYSTEM, buildVideoPromptUser, sanitizeVideoPrompt } from "../route";

function makeReq(body: unknown): Request {
  return new Request("http://localhost/api/video-prompt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("prompt shape", () => {
  it("system forbids on-screen text and asks for a single filmable prompt", () => {
    expect(VIDEO_PROMPT_SYSTEM).toMatch(/no on-screen text/i);
    expect(VIDEO_PROMPT_SYSTEM).toMatch(/ONLY the prompt/i);
  });
  it("user message carries the course title and topics", () => {
    const u = buildVideoPromptUser("Solow Growth", ["Capital", "Steady state"]);
    expect(u).toContain("Solow Growth");
    expect(u).toContain("Capital");
    expect(u).toContain("Steady state");
  });
});

describe("sanitizeVideoPrompt", () => {
  it("takes the first non-empty line, strips fences/quotes, and caps length", () => {
    expect(sanitizeVideoPrompt('```\n"A slow drone shot over a misty forest"\n```')).toBe(
      "A slow drone shot over a misty forest",
    );
    expect(sanitizeVideoPrompt("\n\n  first line  \nsecond")).toBe("first line");
    expect(sanitizeVideoPrompt("x".repeat(400)).length).toBe(300);
  });
});

describe("route contract", () => {
  it("no OpenRouter key ⇒ 503 no_provider, no upstream call", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const res = await POST(makeReq({ title: "Solow Growth", units: ["Capital"] }));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe("no_provider");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("missing title ⇒ 400", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "k");
    vi.stubGlobal("fetch", vi.fn());
    const res = await POST(makeReq({ units: ["x"] }));
    expect(res.status).toBe(400);
  });

  it("returns the model's prompt on success", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "k");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({ choices: [{ message: { content: "A cinematic sunrise over rolling hills, slow push-in" } }] }),
          { status: 200 },
        ),
      ),
    );
    const res = await POST(makeReq({ title: "Ecology", units: ["Ecosystems"] }));
    expect(res.status).toBe(200);
    expect((await res.json()).prompt).toBe("A cinematic sunrise over rolling hills, slow push-in");
  });
});
