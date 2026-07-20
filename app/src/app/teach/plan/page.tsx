import type { Metadata } from "next";
import { LessonPlanClient } from "@/components/teach/LessonPlanClient";

export const metadata: Metadata = {
  title: "Lesson pacing plan — Ecolingo",
  description: "Spread your course across classes using each lesson's time estimate.",
};

export default function TeachPlanPage() {
  return <LessonPlanClient />;
}
