import type { Metadata } from "next";
import { ExamBuilderClient } from "@/components/teach/ExamBuilderClient";

export const metadata: Metadata = {
  title: "Exam & quiz builder — Ecolingo",
  description: "Assemble a printable test from your approved question bank, with an answer key.",
};

export default function TeachExamPage() {
  return <ExamBuilderClient />;
}
