"use client";

/**
 * App-wide auth gate (D-023: accounts are mandatory).
 *
 * The old guest-first model let anyone open every page — including the
 * teacher workspace with its join codes — signed out. Now:
 *  - PUBLIC routes (landing, /auth*) render for everyone.
 *  - Every other route requires a real signed-in account (anonymous guest
 *    sessions do NOT count); otherwise the visitor is sent to /auth.
 *  - /teach* additionally requires the TEACHER role; students are sent
 *    back to their own home instead.
 * While the account resolves (or a redirect is in flight) the animated
 * LoadingScreen shows — gated content never flashes.
 *
 * This gate is UX-level routing; data security stays with owner-scoped RLS
 * on the backend (a gate in the client is never the security boundary).
 * E2E/CI runs have no session, so the harness sets the localStorage flag
 * "eco:e2e-open-gate" to exercise the gated surfaces headlessly.
 */

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import { hasTeacherAccess, needsProfile, useAccountInfo } from "@/lib/use-account";
import { LoadingScreen } from "../LoadingScreen";

const PUBLIC_ROUTES = new Set(["/", "/auth", "/auth/reset", "/auth/callback"]);

const subscribeNever = () => () => {};
const readBypass = () => {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem("eco:e2e-open-gate") === "1";
  } catch {
    return false;
  }
};
const readBypassServer = () => false;

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const account = useAccountInfo();
  const bypass = useSyncExternalStore(subscribeNever, readBypass, readBypassServer);

  const isPublic = PUBLIC_ROUTES.has(pathname);
  const teacherOnly = pathname === "/teach" || pathname.startsWith("/teach/");

  const signedOut = !isPublic && !bypass && needsProfile(account);
  // Teacher surfaces open to real teachers AND designated tester accounts
  // (who get full access to exercise every feature).
  const wrongRole =
    !isPublic &&
    !bypass &&
    teacherOnly &&
    account.phase === "ready" &&
    !needsProfile(account) &&
    !hasTeacherAccess(account);

  // Already signed in on the login screen → straight to your home (the
  // reverse illogic of the old guest-first flow).
  const signedInOnAuth =
    pathname === "/auth" && !bypass && account.phase === "ready" && !needsProfile(account);
  const homeFor = account.phase === "ready" && account.info?.role === "teacher" ? "/teach" : "/learn";

  useEffect(() => {
    if (signedOut) router.replace("/auth");
    else if (wrongRole) router.replace("/learn");
    else if (signedInOnAuth) router.replace(homeFor);
  }, [signedOut, wrongRole, signedInOnAuth, homeFor, router]);

  if (isPublic || bypass) return <>{children}</>;
  if (account.phase === "loading") return <LoadingScreen label="One moment…" />;
  if (signedOut) return <LoadingScreen label="Taking you to sign in…" />;
  if (wrongRole) return <LoadingScreen label="That page is for teachers — taking you home…" />;
  return <>{children}</>;
}
