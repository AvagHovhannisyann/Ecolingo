/**
 * AI video generation (D-031). SERVER-SIDE token only.
 *
 * Wires the app to a Chinese open-source text-to-video model via Hugging Face
 * Inference Providers: the default is Alibaba's **Wan 2.2** (Wan-AI/
 * Wan2.2-TI2V-5B, routed to fal-ai), with Tencent's **HunyuanVideo** as an
 * alternative. Same honest-degrade posture as the OpenRouter routes: with no
 * `HF_TOKEN` the route returns 503 and the UI shows an honest "not configured"
 * state (GATE-009) — it never fakes a clip.
 *
 * Provenance (GATE-002): a generated clip is ILLUSTRATIVE/decorative motion,
 * never a truth-critical artifact — equations, graphs, and answer keys stay
 * code-rendered elsewhere. The UI labels these videos as generative so they are
 * never mistaken for grounded course facts.
 *
 * Cost/latency reality (documented, not hidden): hosted text-to-video is GPU
 * inference — it is NOT free-unlimited (providers bill per second) and a clip
 * takes tens of seconds to minutes, so this route runs on the Node runtime with
 * an extended maxDuration. A production build should move to the provider's
 * async queue + object storage; this blocking form is the honest MVP.
 */

import { NextResponse } from "next/server";

export const runtime = "nodejs";
// video inference is slow — ask the platform for the longest window it allows.
export const maxDuration = 300;

/** Chinese open-source text-to-video models available via HF Inference Providers. */
export const VIDEO_MODELS = {
  "wan2.2": "Wan-AI/Wan2.2-TI2V-5B", // Alibaba — efficient, strong CN+EN prompts (default)
  hunyuan: "tencent/HunyuanVideo", // Tencent — 13B, top motion quality
} as const;

export type VideoModelKey = keyof typeof VIDEO_MODELS;

export function resolveModel(key: unknown): string {
  return key === "hunyuan" ? VIDEO_MODELS.hunyuan : VIDEO_MODELS["wan2.2"];
}

const ROUTER_BASE = "https://router.huggingface.co/v1/text-to-video";

export interface VideoParams {
  numFrames?: number;
  seed?: number;
  negativePrompt?: string;
}

/** clamp/normalise client-supplied generation params (never trust the client) */
export function sanitizeVideoParams(raw: unknown): VideoParams {
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;
  const out: VideoParams = {};
  const nf = Number(r.numFrames);
  if (Number.isInteger(nf) && nf >= 8 && nf <= 240) out.numFrames = nf;
  const seed = Number(r.seed);
  if (Number.isInteger(seed) && seed >= 0 && seed <= 2_147_483_647) out.seed = seed;
  if (typeof r.negativePrompt === "string" && r.negativePrompt.trim()) {
    out.negativePrompt = r.negativePrompt.trim().slice(0, 400);
  }
  return out;
}

export async function POST(req: Request) {
  // Accept either a dedicated var or the conventional HF token name.
  const token = process.env.HF_TOKEN || process.env.HUGGINGFACE_API_KEY;
  if (!token) {
    return NextResponse.json(
      {
        error: "no_provider",
        message:
          "Video generation isn't configured. Set HF_TOKEN (a Hugging Face token with Inference Providers access) on the server to enable it.",
      },
      { status: 503 },
    );
  }

  let body: { prompt?: unknown; model?: unknown; params?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (prompt.length < 3 || prompt.length > 1000) {
    return NextResponse.json(
      { error: "bad_request", message: "Provide a prompt between 3 and 1000 characters." },
      { status: 400 },
    );
  }
  const model = resolveModel(body.model);
  const params = sanitizeVideoParams(body.params);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 290_000);
  try {
    const res = await fetch(ROUTER_BASE, {
      method: "POST",
      signal: controller.signal,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        inputs: prompt,
        parameters: {
          ...(params.numFrames ? { num_frames: params.numFrames } : {}),
          ...(params.seed !== undefined ? { seed: params.seed } : {}),
          ...(params.negativePrompt ? { negative_prompt: [params.negativePrompt] } : {}),
        },
      }),
    });

    if (!res.ok) {
      // surface the provider's status honestly without leaking the token
      const status = res.status === 503 || res.status === 429 ? 502 : res.status;
      return NextResponse.json(
        { error: "upstream_unavailable", providerStatus: res.status },
        { status: status >= 400 && status < 600 ? status : 502 },
      );
    }

    // The task returns the clip as raw bytes; hand it back as a data URL so the
    // client can preview/download it with no extra round-trip.
    const contentType = res.headers.get("content-type") || "video/mp4";
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.byteLength === 0) {
      return NextResponse.json({ error: "empty" }, { status: 502 });
    }
    const dataUrl = `data:${contentType.startsWith("video/") ? contentType : "video/mp4"};base64,${bytes.toString(
      "base64",
    )}`;
    return NextResponse.json({ video: dataUrl, model });
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return NextResponse.json(
      { error: aborted ? "timeout" : "network" },
      { status: aborted ? 504 : 502 },
    );
  } finally {
    clearTimeout(timeout);
  }
}
