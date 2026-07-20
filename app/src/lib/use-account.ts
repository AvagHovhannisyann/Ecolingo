"use client";

/**
 * Account state for UI surfaces (D-022). One fetch per mount, resolved
 * asynchronously; "loading" → null | AccountInfo. A guest (anonymous
 * session) and a signed-out visitor both surface as needsProfile so the
 * Duolingo-style "create a profile" wall shows in both cases.
 */

import { useEffect, useState } from "react";
import { fetchAccountInfo, type AccountInfo } from "./auth";

export type AccountState = { phase: "loading" } | { phase: "ready"; info: AccountInfo | null };

export function useAccountInfo(): AccountState {
  const [state, setState] = useState<AccountState>({ phase: "loading" });
  useEffect(() => {
    let alive = true;
    void fetchAccountInfo()
      .then((info) => {
        if (alive) setState({ phase: "ready", info });
      })
      .catch(() => {
        if (alive) setState({ phase: "ready", info: null });
      });
    return () => {
      alive = false;
    };
  }, []);
  return state;
}

/** True when the visitor has no real (email) account yet. */
export function needsProfile(state: AccountState): boolean {
  return state.phase === "ready" && (state.info === null || state.info.isAnonymous);
}
