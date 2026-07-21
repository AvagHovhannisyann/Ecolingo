import type { Metadata } from "next";
import { FlashcardStudyClient } from "@/components/flashcards/FlashcardStudyClient";

export const metadata: Metadata = {
  title: "Flashcards — Ecolingo",
  description: "Study your generated flashcards as an interactive flip-card deck.",
};

export default function TeachFlashcardsPage() {
  return <FlashcardStudyClient />;
}
