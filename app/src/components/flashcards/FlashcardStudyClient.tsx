"use client";

/**
 * Flashcard study page (D-046). Reads the most recently generated flashcards
 * from the printable store (the AI toolkit stashes them there before routing
 * here) and plays them as an interactive deck. If the current printable isn't a
 * flashcard set, it degrades to an honest "generate some first" state (GATE-009).
 *
 * Implementation only; reuses existing design tokens (Fabel owns aesthetic).
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { cardsFromSections, type Flashcard } from "@/lib/engine/flashcards";
import { loadPrintable } from "@/lib/teach/printable-store";
import { FlashcardStudy } from "./FlashcardStudy";
import { LoadingScreen } from "../LoadingScreen";

type Loaded = { status: "loading" } | { status: "ready"; cards: Flashcard[]; sourceTitle: string } | { status: "none" };

export function FlashcardStudyClient() {
  const [loaded, setLoaded] = useState<Loaded>({ status: "loading" });

  useEffect(() => {
    let alive = true;
    // read after mount (localStorage is client-only) via a microtask so this is
    // not a synchronous state cascade in the effect body.
    void Promise.resolve().then(() => {
      if (!alive) return;
      const doc = loadPrintable();
      if (doc && doc.kind === "handout" && doc.mode === "flashcards") {
        const cards = cardsFromSections(doc.sections);
        setLoaded(cards.length > 0 ? { status: "ready", cards, sourceTitle: doc.sourceTitle } : { status: "none" });
      } else {
        setLoaded({ status: "none" });
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  if (loaded.status === "loading") return <LoadingScreen label="Loading your flashcards…" />;

  return (
    <div>
      <Link href="/teach" className="text-sm text-[var(--model-blue-text)] underline">
        ← Back to teacher workspace
      </Link>
      <h1 className="mt-2 text-2xl font-bold">Flashcards</h1>

      {loaded.status === "none" ? (
        <div className="card mt-4 p-4">
          <p className="text-sm font-bold">No flashcards to study yet.</p>
          <p className="mt-1 text-sm text-app-muted">
            Generate a set from your material first — open the AI toolkit and choose “Flashcards”. They&apos;ll open
            here as an interactive deck.
          </p>
          <Link href="/teach" className="btn-primary mt-3 inline-block min-h-12 px-5 py-3 text-white">
            Back to the toolkit
          </Link>
        </div>
      ) : (
        <>
          <p className="mt-1 text-sm text-app-muted">
            From “{loaded.sourceTitle}” · {loaded.cards.length} card{loaded.cards.length === 1 ? "" : "s"}. Flip each
            card, then sort it into “Still learning” or “Know it”.
          </p>
          <div className="mt-4 max-w-xl">
            <FlashcardStudy cards={loaded.cards} title={loaded.sourceTitle} />
          </div>
          <p className="mt-4 text-xs text-app-muted">
            Want them on paper instead?{" "}
            <Link href="/teach/print" className="text-[var(--model-blue-text)] underline">
              Open the printable version
            </Link>
            .
          </p>
        </>
      )}
    </div>
  );
}
