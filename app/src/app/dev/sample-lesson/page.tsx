"use client";

/**
 * DEV-ONLY harness: plays the sample course's first lesson through the real
 * LessonPlayer with the sample plan's concepts/questions/equations threaded in
 * — exactly as CompiledLesson does for a tester. Proves the sample lesson is
 * fully playable (visual lab, math step, questions, feedback) without needing
 * a live enrolled session. Never linked from the app.
 */

import { SAMPLE_ENROLLED_PLAN } from "@/content/sample-course";
import { LessonPlayer } from "@/components/LessonPlayer";

export default function SampleLessonDemoPage() {
  const lesson = SAMPLE_ENROLLED_PLAN.lessons[0];
  return (
    <LessonPlayer
      lesson={lesson}
      extraConcepts={SAMPLE_ENROLLED_PLAN.concepts}
      extraQuestions={SAMPLE_ENROLLED_PLAN.questions}
      extraEquations={SAMPLE_ENROLLED_PLAN.equations}
    />
  );
}
