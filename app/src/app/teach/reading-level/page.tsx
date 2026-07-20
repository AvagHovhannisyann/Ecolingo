import type { Metadata } from "next";
import { ReadingLevelClient } from "@/components/teach/ReadingLevelClient";

export const metadata: Metadata = {
  title: "Reading-level adapter — Ecolingo",
  description: "Re-pitch a passage simpler or more advanced without changing the facts.",
};

export default function TeachReadingLevelPage() {
  return <ReadingLevelClient />;
}
