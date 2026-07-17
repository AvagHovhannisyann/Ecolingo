import type { Metadata } from "next";
import { TeachClient } from "@/components/TeachClient";

export const metadata: Metadata = {
  title: "Teacher workspace — Ecolingo",
  description: "Upload course materials, review proposed concept links, and ground the course in real sources.",
};

export default function TeachPage() {
  return <TeachClient />;
}
