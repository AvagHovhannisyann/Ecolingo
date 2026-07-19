import type { Metadata } from "next";
import { CompileCourseClient } from "@/components/teach-compile/CompileCourseClient";

export const metadata: Metadata = {
  title: "Compile a course — Ecolingo",
  description:
    "Draft a whole course from your uploaded materials — units, lessons, and prerequisites — then review and ratify it. AI drafts, you approve.",
};

export default function CompileCoursePage() {
  return <CompileCourseClient />;
}
