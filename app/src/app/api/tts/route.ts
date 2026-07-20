/**
 * Neural text-to-speech — OUR OWN open voice model (D-034). SERVER-SIDE only.
 *
 * No ElevenLabs. This proxies to a self-hosted **Kokoro-82M** server (Apache-2.0,
 * 54 voices, free) that speaks the OpenAI `/v1/audio/speech` shape — e.g.
 * kokoro-fastapi or kokoro-web. Point `TTS_ENDPOINT` at your Kokoro server
 * (optionally `TTS_API_KEY`) and the read-aloud buttons use it.
 *
 * Why a server proxy and not in-browser: the app's CSP is deliberately strict
 * (`script-src 'self'`, `connect-src 'self'`, no `wasm-unsafe-eval`), which
 * blocks running an ONNX/WASM model in the page. Proxying keeps the browser
 * talking only to our own origin, so the security posture is unchanged.
 *
 * Honest degrade (GATE-009): no `TTS_ENDPOINT` → 503, and the client falls back
 * to the browser's built-in Web Speech voice, so audio ALWAYS works. On success
 * the clip is returned as raw audio bytes for playback + amplitude metering.
 */

import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** A warm, natural default Kokoro voice. */
export const DEFAULT_VOICE_ID = "af_heart";

/** Kokoro voice ids look like "af_heart" / "am_adam" (nationality+gender+name);
 *  reject anything else so a request can't smuggle arbitrary values upstream. */
export function sanitizeVoiceId(raw: unknown): string {
  return typeof raw === "string" && /^[a-z]{2}_[a-z]+$/.test(raw) ? raw : DEFAULT_VOICE_ID;
}

/** OpenAI-compatible /v1/audio/speech body — what Kokoro servers accept. */
export function buildSpeechBody(text: string, voice: string, model: string) {
  return { model, input: text, voice, response_format: "mp3" };
}

/** Join base + path without doubling slashes. */
export function speechUrl(base: string): string {
  return base.replace(/\/+$/, "") + "/v1/audio/speech";
}

export async function POST(req: Request) {
  const endpoint = process.env.TTS_ENDPOINT;
  if (!endpoint) {
    return NextResponse.json(
      {
        error: "no_provider",
        message:
          "Neural voice isn't configured. Set TTS_ENDPOINT to a self-hosted Kokoro server; the browser voice is used until then.",
      },
      { status: 503 },
    );
  }

  let body: { text?: unknown; voiceId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (text.length < 1 || text.length > 1200) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const voice = sanitizeVoiceId(body.voiceId);
  const model = process.env.TTS_MODEL || "kokoro";
  const key = process.env.TTS_API_KEY;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch(speechUrl(endpoint), {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
        ...(key ? { Authorization: `Bearer ${key}` } : {}),
      },
      body: JSON.stringify(buildSpeechBody(text, voice, model)),
    });
    if (!res.ok) {
      return NextResponse.json({ error: "upstream_unavailable", providerStatus: res.status }, { status: 502 });
    }
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.byteLength === 0) return NextResponse.json({ error: "empty" }, { status: 502 });
    const type = res.headers.get("content-type");
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type": type && type.startsWith("audio/") ? type : "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return NextResponse.json({ error: aborted ? "timeout" : "network" }, { status: aborted ? 504 : 502 });
  } finally {
    clearTimeout(timeout);
  }
}
