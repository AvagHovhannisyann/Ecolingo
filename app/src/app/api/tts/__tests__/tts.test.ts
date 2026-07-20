import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_VOICE_ID, POST, buildSpeechBody, sanitizeVoiceId, speechUrl } from "../route";

function makeReq(body: unknown): Request {
  return new Request("http://localhost/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("sanitizeVoiceId", () => {
  it("accepts Kokoro-style ids and rejects anything else", () => {
    expect(sanitizeVoiceId("af_heart")).toBe("af_heart");
    expect(sanitizeVoiceId("am_adam")).toBe("am_adam");
    expect(sanitizeVoiceId("../../evil")).toBe(DEFAULT_VOICE_ID);
    expect(sanitizeVoiceId("AF_HEART")).toBe(DEFAULT_VOICE_ID);
    expect(sanitizeVoiceId(123)).toBe(DEFAULT_VOICE_ID);
  });
});

describe("buildSpeechBody / speechUrl", () => {
  it("builds the OpenAI-compatible speech body a Kokoro server accepts", () => {
    const b = buildSpeechBody("hello there", "af_bella", "kokoro");
    expect(b).toEqual({ model: "kokoro", input: "hello there", voice: "af_bella", response_format: "mp3" });
  });
  it("joins the endpoint without doubling slashes", () => {
    expect(speechUrl("https://tts.example.com/")).toBe("https://tts.example.com/v1/audio/speech");
    expect(speechUrl("https://tts.example.com")).toBe("https://tts.example.com/v1/audio/speech");
  });
});

describe("route contract", () => {
  it("no TTS_ENDPOINT ⇒ 503 no_provider (client falls back to the browser voice), no upstream call", async () => {
    vi.stubEnv("TTS_ENDPOINT", "");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const res = await POST(makeReq({ text: "hi" }));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe("no_provider");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("empty text ⇒ 400 with an endpoint set", async () => {
    vi.stubEnv("TTS_ENDPOINT", "https://tts.example.com");
    vi.stubGlobal("fetch", vi.fn());
    const res = await POST(makeReq({ text: "   " }));
    expect(res.status).toBe(400);
  });

  it("on success returns audio bytes and calls the Kokoro server with the mapped voice", async () => {
    vi.stubEnv("TTS_ENDPOINT", "https://tts.example.com");
    vi.stubEnv("TTS_API_KEY", "server-key");
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        return new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "content-type": "audio/mpeg" } });
      }),
    );
    const res = await POST(makeReq({ text: "Read this", voiceId: "bf_emma" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("audio/mpeg");
    expect(calls[0].url).toBe("https://tts.example.com/v1/audio/speech");
    const sent = JSON.parse(calls[0].init.body as string);
    expect(sent.voice).toBe("bf_emma");
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe("Bearer server-key");
  });

  it("provider error ⇒ 502 upstream_unavailable", async () => {
    vi.stubEnv("TTS_ENDPOINT", "https://tts.example.com");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 500 })));
    const res = await POST(makeReq({ text: "hello" }));
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe("upstream_unavailable");
  });
});
