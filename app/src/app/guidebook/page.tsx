import type { Metadata } from "next";
import { GuidebookClient } from "@/components/guidebook/GuidebookClient";

export const metadata: Metadata = {
  title: "Guidebook — Ecolingo",
  description: "The key ideas of your current section, straight from your course's ratified plan.",
};

export default function GuidebookPage() {
  return <GuidebookClient />;
}
