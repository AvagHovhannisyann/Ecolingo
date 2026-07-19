import { notFound } from "next/navigation";
import { course } from "@/content/econ13210";
import { LessonPlayer } from "@/components/LessonPlayer";

export function generateStaticParams() {
  return course.lessons.map((l) => ({ lessonId: l.id }));
}

export default async function LessonPage({ params }: { params: Promise<{ lessonId: string }> }) {
  const { lessonId } = await params;
  const lesson = course.lessons.find((l) => l.id === lessonId);
  if (!lesson) notFound();
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
