"use client";

/**
 * Published authored questions (Phase 4b, D-014). Reads *teacher-ratified*
 * AI-drafted questions from Supabase — across teachers, via the published-read
 * RLS policy — so a learner on any device/account sees the questions a teacher
 * approved, not just the teacher on the same browser. Every row in
 * authored_questions is by definition approved (only toAuthoredQuestion writes
 * there, behind the D-014 ratification gate), so the policy exposes them all.
 * Local teacher questions are still merged on top in BankClient, so an offline
 * teacher sees their own pending approvals instantly (GATE-009).
 *
 * Parsing is defensive: any row whose jsonb fails a minimal mc_single shape
 * check is skipped rather than crashing the bank. Degrades to [] when Supabase
 * is unconfigured or unreachable (GATE-009).
 */

import { useSyncExternalStore } from "react";
import type { Question } from "./engine/types";
import { getSupabase, ensureSession } from "./supabase";

let cache: Question[] | null = null;
let started = false;
const listeners = new Set<() => void>();

function notify() {
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** minimal shape guard — a malformed published row must never crash the bank */
function isValidPublishedQuestion(raw: unknown): raw is Question {
  if (!raw || typeof raw !== "object") return false;
  const q = raw as Record<string, unknown>;
  if (typeof q.id !== "string" || !q.id) return false;
  if (typeof q.conceptSlug !== "string" || !q.conceptSlug) return false;
  if (q.type !== "mc_single") return false;
  if (!Array.isArray(q.options) || q.options.length === 0) return false;
  const key = q.answerKey as Record<string, unknown> | undefined;
  if (!key || typeof key.correctOptionId !== "string" || !key.correctOptionId) return false;
  return true;
}

/** fetch every published authored question; [] on any degrade path */
export async function fetchPublishedQuestions(): Promise<Question[]> {
  const supabase = getSupabase();
  if (!supabase) return [];
  try {
    await ensureSession(); // published read requires an authenticated session
    const res = await supabase.from("authored_questions").select("question");
    if (res.error || !res.data?.length) return [];
    const out: Question[] = [];
    const seen = new Set<string>();
    for (const row of res.data) {
      const q = (row as { question: unknown }).question;
      if (!isValidPublishedQuestion(q)) continue; // skip, never throw
      if (seen.has(q.id)) continue;
      seen.add(q.id);
      out.push(q);
    }
    return out;
  } catch {
    return [];
  }
}

function getSnapshot(): Question[] | null {
  if (!started) {
    started = true;
    void fetchPublishedQuestions().then((qs) => {
      cache = qs;
      notify();
    });
  }
  return cache;
}

function getServerSnapshot(): Question[] | null {
  return null;
}

/** null until the first fetch resolves; then the list of published questions */
export function usePublishedQuestions(): Question[] | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
