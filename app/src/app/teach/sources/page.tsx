import type { Metadata } from "next";
import { SourceSuggesterClient } from "@/components/teach/SourceSuggesterClient";

export const metadata: Metadata = {
  title: "Source suggester — Ecolingo",
  description: "Match each course concept to the section of your material that best grounds it.",
};

export default function TeachSourcesPage() {
  return <SourceSuggesterClient />;
}
