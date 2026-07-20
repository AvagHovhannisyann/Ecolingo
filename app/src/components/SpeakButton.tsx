"use client";

/**
 * Reusable read-aloud button (D-033). Drop it next to any written text — a
 * question stem, a tutor explanation — and clicking it speaks that text with
 * the shared voice engine (neural ElevenLabs when configured, browser Web
 * Speech otherwise). Accessible, SSR-safe, and never throws into the UI.
 */

import { useEffect, useState, useSyncExternalStore } from "react";
import { speak, stopSpeaking } from "@/lib/tts";

const subNever = () => () => {};
const inBrowser = () => typeof window !== "undefined";
const onServer = () => false;

export function SpeakButton({
  text,
  characterId,
  label = "Read aloud",
  className = "",
}: {
  text: string;
  characterId?: string;
  label?: string;
  className?: string;
}) {
  const canSpeak = useSyncExternalStore(subNever, inBrowser, onServer);
  const [playing, setPlaying] = useState(false);

  useEffect(() => () => stopSpeaking(), []);

  if (!canSpeak || !text.trim()) return null;

  const toggle = () => {
    if (playing) {
      stopSpeaking();
      setPlaying(false);
      return;
    }
    setPlaying(true);
    speak(text, { characterId, onEnd: () => setPlaying(false) });
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={playing ? "Stop reading aloud" : label}
      aria-pressed={playing}
      className={
        "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border-2 border-[color:var(--app-border)] bg-[color:var(--app-surface-2)] text-[var(--duo-blue)] hover:bg-[color:var(--app-surface)] " +
        className
      }
    >
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.1" aria-hidden="true">
        <path d="M4 9.5v5h3.5L12 18V6L7.5 9.5z" fill="currentColor" stroke="none" />
        <path d="M15.5 8.5a5 5 0 0 1 0 7" strokeLinecap="round" />
        {playing && <path d="M18 6a8.5 8.5 0 0 1 0 12" strokeLinecap="round" />}
      </svg>
    </button>
  );
}
