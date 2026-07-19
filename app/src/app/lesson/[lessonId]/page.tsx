import { course } from "@/content/econ13210";
import { LessonPlayer } from "@/components/LessonPlayer";
import { CompiledLesson } from "@/components/lesson/CompiledLesson";

export function generateStaticParams() {
  return course.lessons.map((l) => ({ lessonId: l.id }));
}

export default async function LessonPage({ params }: { params: Promise<{ lessonId: string }> }) {
  const { lessonId } = await params;
  const lesson = course.lessons.find((l) => l.id === lessonId);
  // Not a demo lesson → try the enrolled course's compiled plan (D-022);
  // CompiledLesson renders its own honest not-found state for unknown ids.
  if (!lesson) return <CompiledLesson lessonId={lessonId} />;
  return (
    <>
      {/* Accessible page landmark. The D-020 lesson flow renders its own chrome
          (close / progress / hearts) and per-step headings; the title stays as a
          visually-hidden h1 so the heading hierarchy and page label are intact. */}
      <h1 className="sr-only">{lesson.title}</h1>
      <LessonPlayer lesson={lesson} />
    </>
  );
}
