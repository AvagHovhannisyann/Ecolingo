import type { Metadata } from "next";
import { QuestsClient } from "@/components/quests/QuestsClient";

export const metadata: Metadata = { title: "Quests — Ecolingo" };

/**
 * Quests (D-020, Wave 2 Stream K): daily + monthly quest board backed by the
 * deterministic economy engine. The interactive board is a client component;
 * this server component only owns the route metadata.
 */
export default function Quests() {
  return <QuestsClient />;
}
