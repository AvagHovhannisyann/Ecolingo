"use client";

/**
 * Cloud-sync status indicator (GATE-009: no silent provider failure).
 * local_only = no Supabase env configured; error = sync failed but progress
 * is safe in localStorage.
 */

import { useSyncExternalStore } from "react";
import { getSyncStatus, onSyncStatus, type SyncStatus } from "@/lib/sync";

const LABELS: Record<SyncStatus, { text: string; cls: string }> = {
  local_only: { text: "Local only", cls: "text-gray-500" },
  syncing: { text: "Syncing…", cls: "text-gray-600" },
  synced: { text: "Synced ✓", cls: "text-green-700" },
  error: { text: "Sync error — progress kept locally", cls: "text-orange-700" },
};

export function SyncBadge() {
  const status = useSyncExternalStore(
    onSyncStatus,
    getSyncStatus,
    () => "local_only" as SyncStatus
  );
  const l = LABELS[status];
  return (
    <span className={`text-xs ${l.cls}`} role="status" aria-live="polite" title="Cloud sync status">
      {l.text}
    </span>
  );
}
