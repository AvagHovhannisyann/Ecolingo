import type { Metadata } from "next";
import { SectionsClient } from "@/components/sections/SectionsClient";

export const metadata: Metadata = { title: "Sections — Ecolingo" };

/** Duolingo-style roadmap (D-022): where you are, what's next, what's locked. */
export default function SectionsPage() {
  return <SectionsClient />;
}
