import type { Metadata } from "next";
import { QuestsIcon } from "@/components/icons";

export const metadata: Metadata = { title: "Quests — Ecolingo" };

/**
 * Quests placeholder (D-020). A later stream builds the real quests page
 * (daily goals, progress bars, chest rewards). This is an honest empty state —
 * title + one-line description — so the route never 404s.
 */
export default function Quests() {
  return (
    <section className="mt-2">
      <h1 className="text-2xl font-black">Quests</h1>
      <p className="mt-1 text-app-muted">Daily goals and challenges that reward steady practice.</p>
      <div className="card mt-6 flex flex-col items-center gap-4 p-10 text-center">
        <QuestsIcon className="h-16 w-16 art-enter" />
        <p className="max-w-sm text-app-muted">
          Your quests will appear here as you learn — earn rewards for keeping your streak and finishing lessons.
        </p>
      </div>
    </section>
  );
}
