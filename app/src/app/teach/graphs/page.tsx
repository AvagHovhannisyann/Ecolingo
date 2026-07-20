import type { Metadata } from "next";
import { GraphStudioClient } from "@/components/teach/GraphStudioClient";

export const metadata: Metadata = {
  title: "Graph studio — Ecolingo",
  description: "Build mathematically exact, code-rendered function graphs and print them.",
};

export default function TeachGraphsPage() {
  return <GraphStudioClient />;
}
