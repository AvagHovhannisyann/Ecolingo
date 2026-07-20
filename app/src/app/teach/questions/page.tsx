import type { Metadata } from "next";
import { QuestionFactoryClient } from "@/components/teach/QuestionFactoryClient";

export const metadata: Metadata = {
  title: "Question factory — Ecolingo",
  description: "Draft grounded questions per concept, confirm each answer, and fill your exam bank.",
};

export default function TeachQuestionsPage() {
  return <QuestionFactoryClient />;
}
