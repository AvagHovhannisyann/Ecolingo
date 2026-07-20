"use client";

/**
 * Client-side resolver for COMPILED course lessons (D-022).
 *
 * The /lesson/[lessonId] route statically knows only the demo course's
 * lessons; a lesson from an enrolled course's teacher-ratified plan is
 * resolved here at runtime and handed to the same LessonPlayer, with the
 * plan's concepts/questions as the lookup context. Unknown ids get an
 * honest not-found state, never a crash.
 */

import Image from "next/image";
import Link from "next/link";
import { useEnrolledCourse } from "@/lib/enrolled-course";
import { LessonPlayer } from "../LessonPlayer";
import { LoadingScreen } from "../LoadingScreen";

export function CompiledLesson({ lessonId }: { lessonId: string }) {
  const enrolled = useEnrolledCourse();

  if (enrolled === "loading") return <LoadingScreen label="Loading your lesson…" />;

  const lesson =
    typeof enrolled === "object" ? enrolled.lessons.find((l) => l.id === lessonId) : undefined;

  if (!lesson || typeof enrolled !== "object") {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center py-12 text-center">
        <Image src="/art-v2/eco-shrug.webp" alt="" width={140} height={140} className="h-36 w-36 rounded-3xl object-cover" />
        <h1 className="mt-4 text-xl font-extrabold">That lesson isn&apos;t on your path</h1>
        <p className="mt-2 text-sm text-app-muted">
          It may belong to a different course, or your teacher may have updated the plan.
        </p>
        <Link href="/learn" className="btn-primary mt-5 min-h-12 px-6 text-white">
          BACK TO YOUR PATH
        </Link>
      </div>
    );
  }

  return (
    <>
      <h1 className="sr-only">{lesson.title}</h1>
      <LessonPlayer lesson={lesson} extraConcepts={enrolled.concepts} extraQuestions={[]} />
    </>
  );
}
