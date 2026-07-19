/**
 * Section switcher — lets a teacher who runs several sections of the same
 * course (IDEA-205) view analytics per section. A plain <select> so it stays
 * keyboard- and screen-reader-friendly; each option shows the section title
 * and its live enrolled count. Restyled onto the dark game surface, same
 * behavior as before.
 */

import type { OwnedCourse } from "@/lib/course";
import { SectionsIcon } from "./icons";

export function CourseSwitcher({
  courses,
  selectedId,
  onSwitch,
}: {
  courses: OwnedCourse[];
  selectedId: string;
  onSwitch: (id: string) => void;
}) {
  return (
    <div className="analytics-card mt-4 flex flex-wrap items-center gap-3">
      <label htmlFor="section-switcher" className="flex items-center gap-2 text-sm font-bold">
        <SectionsIcon className="h-6 w-6" />
        Section
      </label>
      <select
        id="section-switcher"
        className="analytics-select min-h-12 flex-1"
        value={selectedId}
        onChange={(e) => onSwitch(e.target.value)}
      >
        {courses.map((c) => (
          <option key={c.id} value={c.id}>
            {c.title} — {c.studentCount} enrolled
          </option>
        ))}
      </select>
    </div>
  );
}
