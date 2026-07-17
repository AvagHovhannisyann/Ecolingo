"use client";

/**
 * Published grounding (Phase 3, D-012). Reads *approved* course links from
 * Supabase — across teachers, via the published-read RLS policy — so a learner
 * on any device/account sees the real citations a teacher approved, not just
 * the teacher on the same browser. Unapproved uploads never surface here
 * (the policy only exposes status='approved' rows). Local teacher grounding is
 * merged on top in grounding.ts, so an offline teacher still sees their own
 * pending work instantly (GATE-009).
 */

import { useSyncExternalStore } from "react";
import type { Citation } from "./engine/types";
import type { DocSection } from "./engine/ingest";
import { citationFromLink } from "./engine/ingest";
import { getSupabase, ensureSession } from "./supabase";

export type PublishedGrounding = Record<string, Citation[]>;

let cache: PublishedGrounding | null = null;
let started = false;
const listeners = new Set<() => void>();

function notify() {
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** fetch approved links + their documents and assemble per-concept citations */
export async function fetchPublishedGrounding(): Promise<PublishedGrounding> {
  const supabase = getSupabase();
  if (!supabase) return {};
  try {
    await ensureSession(); // published read requires an authenticated session
    const linksRes = await supabase
      .from("concept_links")
      .select("owner_id, doc_id, section_id, concept_slug")
      .eq("status", "approved");
    if (linksRes.error || !linksRes.data?.length) return {};

    const docKeys = [...new Set(linksRes.data.map((l) => `${l.owner_id}:${l.doc_id}`))];
    const docsRes = await supabase.from("source_documents").select("owner_id, doc_id, title, sections");
    if (docsRes.error) return {};
    const docById = new Map<string, { title: string; sections: DocSection[] }>();
    for (const d of docsRes.data ?? []) {
      docById.set(`${d.owner_id}:${d.doc_id}`, { title: d.title, sections: (d.sections ?? []) as DocSection[] });
    }

    const out: PublishedGrounding = {};
    const seen = new Set<string>();
    for (const l of linksRes.data) {
      const doc = docById.get(`${l.owner_id}:${l.doc_id}`);
      const section = doc?.sections.find((s) => s.id === l.section_id);
      if (!doc || !section) continue;
      const cit = citationFromLink({ id: l.doc_id, title: doc.title, uploadedAtISO: "", charCount: 0, sections: doc.sections }, section, l.concept_slug);
      const dedupe = `${l.concept_slug}:${cit.id}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      (out[l.concept_slug] ??= []).push(cit);
    }
    void docKeys; // (kept for clarity; docs are fetched in one round-trip)
    return out;
  } catch {
    return {};
  }
}

function getSnapshot(): PublishedGrounding | null {
  if (!started) {
    started = true;
    void fetchPublishedGrounding().then((g) => {
      cache = g;
      notify();
    });
  }
  return cache;
}

function getServerSnapshot(): PublishedGrounding | null {
  return null;
}

/** null until the first fetch resolves; then a per-concept citation map */
export function usePublishedGrounding(): PublishedGrounding | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
