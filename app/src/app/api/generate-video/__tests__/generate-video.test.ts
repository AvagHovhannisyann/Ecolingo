import { afterEach, describe, expect, it, vi } from "vitest";
import { POST, VIDEO_MODELS, resolveModel, sanitizeVideoParams } from "../route";

function makeReq(body: unknown): Request {
  return new Request("http://localhost/api/generate-video", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("resolveModel", () => {
  it("defaults to Wan 2.2 and selects HunyuanVideo on request", () => {
    expect(resolveModel(undefined)).toBe(VIDEO_MODELS["wan2.2"]);
    expect(resolveModel("wan2.2")).toBe(VIDEO_MODELS["wan2.2"]);
    expect(resolveModel("hunyuan")).toBe(VIDEO_MODELS.hunyuan);
    expect(resolveModel("garbage")).toBe(VIDEO_MODELS["wan2.2"]);
  });
});

describe("sanitizeVideoParams", () => {
  it("clamps frames to a safe range, validates seed, caps the negative prompt", () => {
    expect(sanitizeVideoParams({ numFrames: 48, seed: 7, negativePrompt: "  blurry  " })).toEqual({
      numFrames: 48,
      seed: 7,
      negativePrompt: "blurry",
    });
    expect(sanitizeVideoParams({ numFrames: 5 })).toEqual({}); // below min → dropped
    expect(sanitizeVideoParams({ numFrames: 9999 })).toEqual({}); // above max → dropped
    expect(sanitizeVideoParams({ seed: -1 })).toEqual({}); // invalid seed → dropped
    expect(sanitizeVideoParams("nope")).toEqual({});
    expect(sanitizeVideoParams({ negativePrompt: "x".repeat(500) }).negativePrompt?.length).toBe(400);
  });
});

describe("route contract", () => {
  it("no HF token ⇒ 503 no_provider with an actionable message, and never calls upstream", async () => {
    vi.stubEnv("HF_TOKEN", "");
    vi.stubEnv("HUGGINGFACE_API_KEY", "");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const res = await POST(makeReq({ prompt: "a cat surfing" }));
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.error).toBe("no_provider");
    expect(json.message).toMatch(/HF_TOKEN/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("a too-short prompt ⇒ 400 (with a token set), no upstream call", async () => {
    vi.stubEnv("HF_TOKEN", "hf_x");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const res = await POST(makeReq({ prompt: "hi" }));
    expect(res.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("on success returns the clip as a video data URL and forwards the token as a Bearer header", async () => {
    vi.stubEnv("HF_TOKEN", "hf_secret");
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        return new Response(new Uint8Array([1, 2, 3, 4]), {
          status: 200,
          headers: { "content-type": "video/mp4" },
        });
      }),
    );
    const res = await POST(makeReq({ prompt: "a slow pan over a forest", model: "hunyuan" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.video).toMatch(/^data:video\/mp4;base64,/);
    expect(json.model).toBe(VIDEO_MODELS.hunyuan);
    // token stays server-side in the Authorization header (never leaked to client)
    const auth = (calls[0].init.headers as Record<string, string>).Authorization;
    expect(auth).toBe("Bearer hf_secret");
    const sent = JSON.parse(calls[0].init.body as string);
    expect(sent.inputs).toBe("a slow pan over a forest");
    expect(sent.model).toBe(VIDEO_MODELS.hunyuan);
  });

  it("a provider 429/503 ⇒ 502 upstream_unavailable (never a fake clip)", async () => {
    vi.stubEnv("HF_TOKEN", "hf_x");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("busy", { status: 429 })));
    const res = await POST(makeReq({ prompt: "a cat surfing a wave" }));
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe("upstream_unavailable");
  });
});
