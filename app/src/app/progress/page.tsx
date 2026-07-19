import type { Metadata } from "next";
import { ProgressClient } from "@/components/ProgressClient";

export const metadata: Metadata = { title: "Progress — Ecolingo" };

export default function ProgressPage() {
  return <ProgressClient />;
}
