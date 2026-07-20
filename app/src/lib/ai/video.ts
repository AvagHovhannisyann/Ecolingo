"use client";

/**
 * Client for AI video generation (D-031). Calls the same-origin
 * /api/generate-video route (which holds the HF token server-side) and returns
 * a previewable data URL, or an honest failure reason the UI can surface —
 * never a silent empty success (GATE-009).
 */

export type VideoModelChoice = "wan2.2" | "hunyuan";

export const VIDEO_MODEL_LABELS: Record<VideoModelChoice, string> = {
  "wan2.2": "Wan 2.2 (Alibaba) — fast, efficient",
  hunyuan: "HunyuanVideo (Tencent) — highest quality",
};

export type VideoOutcome =
  | { ok: true; video: string; model: string }
  | { ok: false; reason: "no_provider" | "timeout" | "error"; message?: string };

export async function generateVideo(
  prompt: string,
  opts: { model?: VideoModelChoice; numFrames?: number; seed?: number; negativePrompt?: string } = {},
): Promise<VideoOutcome> {
  try {
    const res = await fetch("/api/generate-video", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        model: opts.model ?? "wan2.2",
        params: {
          numFrames: opts.numFrames,
          seed: opts.seed,
          negativePrompt: opts.negativePrompt,
        },
      }),
    });
    if (res.status === 503) {
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      return { ok: false, reason: "no_provider", message: data.message };
    }
    if (res.status === 504) return { ok: false, reason: "timeout" };
    if (!res.ok) return { ok: false, reason: "error" };
    const data = (await res.json()) as { video?: string; model?: string };
    if (!data.video) return { ok: false, reason: "error" };
    return { ok: true, video: data.video, model: data.model ?? "wan2.2" };
  } catch {
    return { ok: false, reason: "error" };
  }
}
