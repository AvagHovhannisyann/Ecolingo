"use client";

/**
 * Video studio (D-031). The teacher describes a short clip; the app generates it
 * with a Chinese open-source text-to-video model (Wan 2.2 / HunyuanVideo) via
 * the server route. Honest about everything a generative feature must be honest
 * about: it's ILLUSTRATIVE motion (never a factual source), it needs the
 * provider configured, and a clip takes real time to render.
 *
 * Implementation only; existing design tokens (project rule: Fabel owns aesthetic).
 */

import Link from "next/link";
import { useState } from "react";
import { generateVideo, VIDEO_MODEL_LABELS, type VideoModelChoice, type VideoOutcome } from "@/lib/ai/video";

export function VideoStudioClient() {
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState<VideoModelChoice>("wan2.2");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<VideoOutcome | null>(null);

  const run = async () => {
    if (prompt.trim().length < 3) return;
    setBusy(true);
    setResult(null);
    const outcome = await generateVideo(prompt.trim(), { model });
    setResult(outcome);
    setBusy(false);
  };

  return (
    <div>
      <Link href="/teach" className="text-sm text-[var(--model-blue-text)] underline">
        ← Back to teacher workspace
      </Link>
      <h1 className="mt-2 text-2xl font-bold">Video studio</h1>
      <p className="mt-1 text-sm text-app">
        Describe a short clip and generate it with an open-source text-to-video model. These clips are{" "}
        <strong>illustrative</strong> — great for a hook or an intro, but never a factual source (equations, graphs
        and answer keys stay exact and code-rendered).
      </p>

      <div className="card mt-4 space-y-4 p-4">
        <div>
          <label htmlFor="video-prompt" className="block text-sm font-bold">
            Describe the clip
          </label>
          <textarea
            id="video-prompt"
            rows={3}
            maxLength={1000}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g. A slow zoom over a sunlit rainforest canopy, birds gliding between the trees, cinematic."
            className="mt-1 block w-full rounded-xl border-2 border-[color:var(--app-border)] bg-[color:var(--app-surface-2)] p-3 text-sm"
          />
          <p className="mt-0.5 text-right text-xs text-app-muted">{prompt.length}/1000</p>
        </div>

        <div>
          <label htmlFor="video-model" className="block text-sm font-bold">
            Model
          </label>
          <select
            id="video-model"
            value={model}
            onChange={(e) => setModel(e.target.value as VideoModelChoice)}
            className="mt-1 block w-full rounded-xl border-2 border-[color:var(--app-border)] bg-app p-2 text-sm text-app"
          >
            {(Object.keys(VIDEO_MODEL_LABELS) as VideoModelChoice[]).map((k) => (
              <option key={k} value={k}>
                {VIDEO_MODEL_LABELS[k]}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={() => void run()}
          disabled={busy || prompt.trim().length < 3}
          className="btn-primary min-h-12 px-5 py-3 text-white disabled:opacity-50"
        >
          {busy ? "Generating… this can take a minute" : "Generate video"}
        </button>
        {busy && (
          <p className="text-xs text-app-muted" role="status">
            Rendering on the provider&apos;s GPU — hang tight, text-to-video is slow.
          </p>
        )}
      </div>

      {result && result.ok && (
        <div className="card mt-4 p-4">
          <video controls src={result.video} className="w-full rounded-xl border border-[color:var(--app-border)]" />
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <a href={result.video} download="ecolingo-clip.mp4" className="btn-secondary min-h-12 px-4 py-3 text-sm">
              Download clip
            </a>
            <span className="text-xs text-app-muted">Illustrative · {result.model}</span>
          </div>
        </div>
      )}

      {result && !result.ok && (
        <p className="mt-4 rounded-xl bg-[var(--coral-tint)] p-3 text-sm text-[var(--deep-ink)]" role="alert">
          {result.reason === "no_provider"
            ? result.message ??
              "Video generation isn't configured yet. Add an HF_TOKEN (Hugging Face, with Inference Providers access) on the server to enable it."
            : result.reason === "timeout"
              ? "The clip took too long to render and timed out. Try a shorter prompt or the faster model."
              : "Couldn't generate that clip just now — try again in a moment."}
        </p>
      )}
    </div>
  );
}
