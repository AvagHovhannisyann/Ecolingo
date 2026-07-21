"use client";

/**
 * Interactive flashcard study mode (D-046) — the Quizlet-style flip-card loop.
 *
 * All deck logic lives in the pure engine (lib/engine/flashcards): this
 * component only renders the current card, wires the controls, and tracks which
 * side is showing. Click / Space flips; "Still learning" and "Know it" (or ← / →)
 * sort the card; the still-learning pile is restudied each round until the deck
 * is learned. Read-aloud reuses the shared SpeakButton (lib/tts).
 *
 * Implementation only; reuses existing design tokens. The exact card look, flip
 * animation and swipe gestures are Fabel's to refine.
 */

import { useCallback, useEffect, useState } from "react";
import {
  startStudy,
  mark,
  undo,
  canUndo,
  currentCard,
  roundProgress,
  type Flashcard,
  type StudyState,
} from "@/lib/engine/flashcards";
import { SpeakButton } from "../SpeakButton";

export function FlashcardStudy({ cards, title }: { cards: Flashcard[]; title?: string }) {
  const [state, setState] = useState<StudyState>(() => startStudy(cards.length));
  const [flipped, setFlipped] = useState(false);

  const idx = currentCard(state);
  const card = idx === null ? null : cards[idx];

  const doMark = useCallback((bucket: "known" | "still") => {
    setState((s) => mark(s, bucket));
    setFlipped(false);
  }, []);
  const doUndo = useCallback(() => {
    setState((s) => undo(s));
    setFlipped(false);
  }, []);
  const restart = useCallback(() => {
    setState(startStudy(cards.length));
    setFlipped(false);
  }, [cards.length]);

  // keyboard: Space/Enter flips, ← = still learning, → = know it
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (state.done || card === null) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        setFlipped((f) => !f);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        doMark("still");
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        doMark("known");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state.done, card, doMark]);

  if (cards.length === 0) {
    return (
      <p className="rounded-xl bg-[color:var(--app-surface-2)] p-4 text-sm text-app-muted" role="status">
        This deck has no cards yet.
      </p>
    );
  }

  const progress = roundProgress(state);
  const stillCount = state.stillThisRound.length;
  const knownCount = state.known.length;

  if (state.done) {
    return (
      <div className="card p-6 text-center" role="status">
        <p className="text-3xl" aria-hidden>
          🎉
        </p>
        <h2 className="mt-2 text-xl font-extrabold">You&apos;ve learned all {state.total} cards</h2>
        <p className="mt-1 text-sm text-app-muted">
          Every card ended up in “Know it”. Study again to keep it fresh.
        </p>
        <button type="button" onClick={restart} className="btn-primary mt-4 min-h-12 px-5 text-white">
          Study again
        </button>
      </div>
    );
  }

  const showBack = flipped;
  const faceText = card ? (showBack ? card.back : card.front) : "";

  return (
    <div>
      {/* progress + round counters */}
      <div className="flex items-center justify-between gap-3">
        <span
          className="min-w-10 rounded-full bg-[color:var(--coral-tint)] px-3 py-1 text-center text-sm font-extrabold text-[var(--deep-ink)]"
          aria-label={`${stillCount} still learning`}
        >
          {stillCount}
        </span>
        <span className="text-sm font-bold text-app-muted" aria-live="polite">
          {progress.current} / {progress.total}
          {state.round > 1 && <span className="ml-2 text-xs">round {state.round}</span>}
        </span>
        <span
          className="min-w-10 rounded-full bg-[color:var(--growth-green-tint)] px-3 py-1 text-center text-sm font-extrabold text-[var(--growth-green-text)]"
          aria-label={`${knownCount} known`}
        >
          {knownCount}
        </span>
      </div>

      {/* the card: click / Space to flip */}
      <button
        type="button"
        onClick={() => setFlipped((f) => !f)}
        aria-pressed={showBack}
        className="mt-3 flex min-h-64 w-full flex-col items-center justify-center rounded-2xl border-2 border-[color:var(--app-border)] bg-[color:var(--app-surface-2)] p-6 text-center transition hover:border-[var(--model-blue)]"
      >
        <span className="text-xs font-bold uppercase tracking-wide text-app-muted">
          {showBack ? "Answer" : "Term"}
        </span>
        <span className="mt-3 text-xl font-semibold text-app">{faceText}</span>
        <span className="mt-4 text-xs text-app-muted">Tap or press Space to flip</span>
      </button>

      <div className="mt-2 flex items-center justify-center gap-2">
        <SpeakButton text={faceText} label="Read this side aloud" />
      </div>

      {/* sort controls */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => doMark("still")}
          className="min-h-14 rounded-2xl border-2 border-[color:var(--soft-coral)] bg-[color:var(--coral-tint)] font-extrabold text-[var(--deep-ink)]"
        >
          ← Still learning
        </button>
        <button
          type="button"
          onClick={() => doMark("known")}
          className="min-h-14 rounded-2xl border-2 border-[color:var(--growth-green)] bg-[color:var(--growth-green-tint)] font-extrabold text-[var(--growth-green-text)]"
        >
          Know it →
        </button>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <button
          type="button"
          onClick={doUndo}
          disabled={!canUndo(state)}
          className="btn-secondary min-h-11 px-4 text-sm disabled:opacity-40"
        >
          ↶ Undo
        </button>
        <button type="button" onClick={restart} className="btn-secondary min-h-11 px-4 text-sm">
          Restart{title ? "" : " deck"}
        </button>
      </div>
    </div>
  );
}
