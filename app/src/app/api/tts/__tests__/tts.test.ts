import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_VOICE_ID, POST, buildElevenBody, sanitizeVoiceId } from "../route";

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
  it("accepts plain alphanumeric ids and rejects anything that could inject into the URL", () => {
    expect(sanitizeVoiceId("21m00Tcm4TlvDq8ikWAM")).toBe("21m00Tcm4TlvDq8ikWAM");
    expect(sanitizeVoiceId("../../evil")).toBe(DEFAULT_VOICE_ID);
    expect(sanitizeVoiceId("abc?x=1")).toBe(DEFAULT_VOICE_ID);
    expect(sanitizeVoiceId(123)).toBe(DEFAULT_VOICE_ID);
    expect(sanitizeVoiceId("short")).toBe(DEFAULT_VOICE_ID);
  });
});

describe("buildElevenBody", () => {
  it("carries the text, model, and safe default voice settings", () => {
    const b = buildElevenBody("hello there", "eleven_multilingual_v2");
    expect(b.text).toBe("hello there");
    expect(b.model_id).toBe("eleven_multilingual_v2");
    expect(b.voice_settings.use_speaker_boost).toBe(true);
  });
});

describe("route contract", () => {
  it("no key ⇒ 503 no_provider (client falls back to the browser voice), no upstream call", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const res = await POST(makeReq({ text: "hi" }));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe("no_provider");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("empty text ⇒ 400 with a key set", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "k");
    vi.stubGlobal("fetch", vi.fn());
    const res = await POST(makeReq({ text: "   " }));
    expect(res.status).toBe(400);
  });

  it("on success returns audio bytes and sends the key as xi-api-key (never leaked to client)", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "secret-voice-key");
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        return new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "content-type": "audio/mpeg" } });
      }),
    );
    const res = await POST(makeReq({ text: "Read this", voiceId: "MF3mGyEYCl7XYWbV9V6O" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("audio/mpeg");
    expect(calls[0].url).toContain("MF3mGyEYCl7XYWbV9V6O");
    expect((calls[0].init.headers as Record<string, string>)["xi-api-key"]).toBe("secret-voice-key");
  });

  it("provider error ⇒ 502 upstream_unavailable", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "k");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 401 })));
    const res = await POST(makeReq({ text: "hello" }));
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe("upstream_unavailable");
  });
});
