import type { Metadata } from "next";
import { ClassAnalyticsClient } from "@/components/ClassAnalyticsClient";

export const metadata: Metadata = {
  title: "Class analytics — Ecolingo",
  description:
    "See what your class has mastered and what to reteach next, from live enrollment and mastery data — no student names, no single grade.",
};

export default function ClassAnalyticsPage() {
  return <ClassAnalyticsClient />;
}
