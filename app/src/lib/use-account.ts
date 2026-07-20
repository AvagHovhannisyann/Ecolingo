"use client";

/**
 * Account state for UI surfaces (D-022). Fetched on mount and re-fetched on
 * every Supabase auth state change (login, logout, OAuth return, guest
 * upgrade), so gates and nav update the moment the session changes.
 * A guest (anonymous session) and a signed-out visitor both surface as
 * needsProfile — accounts are mandatory (D-023), anonymity is not enough.
 */

import { useEffect, useState } from "react";
import { fetchAccountInfo, type AccountInfo } from "./auth";
import { getSupabase } from "./supabase";

export type AccountState = { phase: "loading" } | { phase: "ready"; info: AccountInfo | null };

export function useAccountInfo(): AccountState {
  const [state, setState] = useState<AccountState>({ phase: "loading" });
  useEffect(() => {
    let alive = true;
    const load = () =>
      void fetchAccountInfo()
        .then((info) => {
          if (alive) setState({ phase: "ready", info });
        })
        .catch(() => {
          if (alive) setState({ phase: "ready", info: null });
        });
    load();
    const sub = getSupabase()?.auth.onAuthStateChange(() => load());
    return () => {
      alive = false;
      sub?.data.subscription.unsubscribe();
    };
  }, []);
  return state;
}

/** True when the visitor has no real (email/OAuth) account yet. */
export function needsProfile(state: AccountState): boolean {
  return state.phase === "ready" && (state.info === null || state.info.isAnonymous);
}
