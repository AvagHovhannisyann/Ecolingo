"use client";

/**
 * Client for AI video generation (D-031). Calls the same-origin
 * /api/generate-video route (which holds the HF token server-side) and returns
 * a previewable data URL, or an honest failure reason the UI can surface —
 * never a silent empty success (GATE-009).
 */

export type VideoModelChoice = "wan2.2" | "hunyuan";

export type VideoOutcome =
  | { ok: true; video: string; model: string }
  | { ok: false; reason: "no_provider" | "timeout" | "error"; message?: string };

/**
 * Fully automatic course-intro clip (D-032): the LLM writes a cinematic prompt
 * from the course topic, then HunyuanVideo renders it. The teacher never writes
 * a prompt. Best-effort — any step degrading (no key) surfaces as a clean
 * reason, never a blocked flow or a fake clip.
 */
export async function autoCourseIntroVideo(
  title: string,
  units: string[],
): Promise<VideoOutcome & { prompt?: string }> {
  let prompt = "";
  try {
    const res = await fetch("/api/video-prompt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, units }),
    });
    if (res.status === 503) return { ok: false, reason: "no_provider" };
    if (res.ok) {
      const data = (await res.json()) as { prompt?: string };
      prompt = typeof data.prompt === "string" ? data.prompt : "";
    }
  } catch {
    return { ok: false, reason: "error" };
  }
  // Fall back to a plain topic prompt if the writer was unavailable but video is.
  if (!prompt) prompt = `A cinematic, abstract visual evoking the subject of "${title}", soft light, slow camera.`;
  // The user's directive: intro clips are rendered by HunyuanVideo.
  const outcome = await generateVideo(prompt, { model: "hunyuan" });
  return { ...outcome, prompt };
}

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
