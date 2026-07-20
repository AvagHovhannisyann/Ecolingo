"use client";

/**
 * Supabase browser client (Phase 1, decision D-008).
 * Env-guarded: when the public env vars are absent the app runs in
 * local-only mode — a typed degrade path, never a silent failure (GATE-009).
 * Only the publishable (anon) key is ever used client-side; RLS restricts
 * every table to the signed-in user's own rows.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Baked-in defaults so auth works on ANY deployment (Vercel previews included)
// without per-host env configuration. These are the PUBLISHABLE client values —
// shipped to every browser by design; RLS is the security boundary, not these.
// Env vars still win when present (e.g. pointing a fork at another project).
const DEFAULT_URL = "https://gucwcjsvuuoytzptoqdk.supabase.co";
const DEFAULT_PUBLISHABLE_KEY = "sb_publishable_dp59K9pbPMbZUnpO8bWrmg_X6tlUMyN";

let client: SupabaseClient | null | undefined;

export function getSupabase(): SupabaseClient | null {
  if (client !== undefined) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || DEFAULT_PUBLISHABLE_KEY;
  client = url && key ? createClient(url, key) : null;
  return client;
}

/** anonymous session: zero-friction demo auth (enabled on the project) */
export async function ensureSession(): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  if (data.session) return data.session.user.id;
  const { data: anon, error } = await supabase.auth.signInAnonymously();
  if (error || !anon.session) return null;
  return anon.session.user.id;
}
