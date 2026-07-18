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
    <div>
      <h1 className="text-xl font-semibold">{lesson.title}</h1>
      <LessonPlayer lesson={lesson} />
    </div>
  );
}
