import type { Metadata } from "next";
import { RubricBuilderClient } from "@/components/teach/RubricBuilderClient";

export const metadata: Metadata = {
  title: "Rubric builder — Ecolingo",
  description: "Draft a grading rubric with level descriptors from your assignment prompt.",
};

export default function TeachRubricPage() {
  return <RubricBuilderClient />;
}
