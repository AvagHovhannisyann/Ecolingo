/**
 * Neural text-to-speech (D-033). SERVER-SIDE key only.
 *
 * Gives the app an ElevenLabs-grade voice: natural, professional narration for
 * the read-aloud buttons. Same honest-degrade posture as the other AI routes —
 * with no `ELEVENLABS_API_KEY` the route returns 503 and the client falls back
 * to the browser's built-in Web Speech voice, so the audio button ALWAYS works
 * (GATE-009), just at higher quality when the key is present.
 *
 * On success the clip is returned as raw audio bytes (audio/mpeg) so the client
 * can play it and meter its amplitude for the talking animation.
 */

import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** A warm, professional default voice ("Rachel"). Override per request or via env. */
export const DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM";

/** ElevenLabs voice ids must be plain alphanumeric — reject anything else and
 *  fall back to the default so a request can't inject into the upstream URL. */
export function sanitizeVoiceId(raw: unknown): string {
  return typeof raw === "string" && /^[A-Za-z0-9]{8,40}$/.test(raw) ? raw : DEFAULT_VOICE_ID;
}

export function buildElevenBody(text: string, modelId: string) {
  return {
    text,
    model_id: modelId,
    voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.0, use_speaker_boost: true },
  };
}

export async function POST(req: Request) {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) {
    return NextResponse.json(
      {
        error: "no_provider",
        message: "Neural voice isn't configured (set ELEVENLABS_API_KEY); the browser voice is used instead.",
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
  const voiceId = sanitizeVoiceId(body.voiceId);
  const modelId = process.env.ELEVENLABS_MODEL_ID || "eleven_multilingual_v2";

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
      {
        method: "POST",
        signal: controller.signal,
        headers: {
          "xi-api-key": key,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify(buildElevenBody(text, modelId)),
      },
    );
    if (!res.ok) {
      return NextResponse.json({ error: "upstream_unavailable", providerStatus: res.status }, { status: 502 });
    }
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.byteLength === 0) return NextResponse.json({ error: "empty" }, { status: 502 });
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
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
