import type { Metadata } from "next";
import { PrintableView } from "@/components/teach/PrintableView";

export const metadata: Metadata = {
  title: "Print — Ecolingo",
  description: "Print or save your teacher handout as a PDF.",
};

export default function TeachPrintPage() {
  return <PrintableView />;
}
