import type { Metadata } from "next";
import { SettingsClient } from "@/components/settings/SettingsClient";
import "./settings.css";

export const metadata: Metadata = { title: "Settings — Ecolingo" };

/**
 * /settings (D-020): the learner's controls in one place — sound effects,
 * daily goal, exam date, and an honest "about your data" card. All state work
 * happens in the client component; this stays a server page for metadata.
 */
export default function SettingsPage() {
  return (
    <section className="mt-2">
      <SettingsClient />
    </section>
  );
}
