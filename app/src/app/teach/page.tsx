import type { Metadata } from "next";
import { TeachClient } from "@/components/TeachClient";

export const metadata: Metadata = {
  title: "Teacher workspace — Ecolingo",
  description: "Upload your materials, let the AI draft a course, and share a join code with your students.",
};

export default function TeachPage() {
  return <TeachClient />;
}
