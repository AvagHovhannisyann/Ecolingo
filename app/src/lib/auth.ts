"use client";

/**
 * Real accounts (D-022) on top of the guest-first anonymous flow.
 *
 * The funnel is Duolingo's: everyone starts as a zero-friction guest
 * (anonymous Supabase session, existing behavior), and creating an account
 * UPGRADES that anonymous user in place via auth.updateUser — the user id
 * never changes, so every RLS-owned row (mastery, plans, enrollments,
 * economy) survives account creation. Signing IN on a device that holds a
 * guest session simply replaces the session (that guest's cloud rows remain
 * under the old id; local state re-hydrates from the signed-in account).
 *
 * GATE-009: without Supabase env vars every call resolves to a typed
 * "unavailable" result — the UI shows an honest degrade, never a crash.
 */

import { getSupabase } from "./supabase";

export type Role = "teacher" | "student";

export type AuthResult =
  | { ok: true; userId: string }
  | {
      ok: false;
      reason: "unavailable" | "invalid" | "exists" | "weak_password" | "rate_limited" | "confirm_email" | "error";
      message: string;
    };

/** Where a pending (email-confirmation) role is stashed until first login. */
const pendingRoleKey = (email: string) => `eco:pending-role:${email.trim().toLowerCase()}`;

export interface AccountInfo {
  userId: string;
  email: string | null;
  isAnonymous: boolean;
  role: Role | null;
  displayName: string | null;
}

/** Pure validation shared by UI and tests. */
export function validateCredentials(email: string, password: string): { ok: boolean; message: string } {
  const e = email.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) return { ok: false, message: "That doesn't look like an email address." };
  if (password.length < 8) return { ok: false, message: "Password needs at least 8 characters." };
  return { ok: true, message: "" };
}

/** Map Supabase auth errors to honest, learner-readable reasons. */
export function mapAuthError(message: string): Exclude<AuthResult, { ok: true }> {
  const m = message.toLowerCase();
  if (m.includes("already registered") || m.includes("already been registered") || m.includes("already exists"))
    return { ok: false, reason: "exists", message: "An account with this email already exists — try logging in." };
  if (m.includes("password") && (m.includes("weak") || m.includes("at least")))
    return { ok: false, reason: "weak_password", message: "Password needs at least 8 characters." };
  if (m.includes("invalid login credentials") || m.includes("invalid email or password"))
    return { ok: false, reason: "invalid", message: "Email or password is incorrect." };
  if (m.includes("email not confirmed") || m.includes("not confirmed"))
    return {
      ok: false,
      reason: "confirm_email",
      message: "Confirm your email first — check your inbox for the link, then log in.",
    };
  // Supabase's built-in mailer is rate-limited; a burst of sign-ups trips it
  // (error_code over_email_send_rate_limit / "email rate limit exceeded").
  if (m.includes("rate limit") || m.includes("over_email_send") || m.includes("too many requests"))
    return {
      ok: false,
      reason: "rate_limited",
      message: "The email service is busy right now (rate-limited). Wait a minute and try again.",
    };
  if (m.includes("provider is not enabled") || m.includes("unsupported provider"))
    return {
      ok: false,
      reason: "unavailable",
      message: "Google sign-in isn't switched on for this project yet — use email for now.",
    };
  return { ok: false, reason: "error", message: "Couldn't reach the account service — your progress is still safe on this device." };
}

const UNAVAILABLE: AuthResult = {
  ok: false,
  reason: "unavailable",
  message: "Accounts aren't available in this environment — progress stays on this device.",
};

/**
 * Create an account. If the current session is anonymous, upgrade it in
 * place (preserves the user id and all owned data); otherwise sign up fresh.
 */
export async function signUpWithEmail(email: string, password: string, role: Role, displayName: string): Promise<AuthResult> {
  const supabase = getSupabase();
  if (!supabase) return UNAVAILABLE;
  const valid = validateCredentials(email, password);
  if (!valid.ok) return { ok: false, reason: "invalid", message: valid.message };

  const { data: sess } = await supabase.auth.getSession();
  const anon = sess.session?.user?.is_anonymous === true;

  let userId: string | null = null;
  if (anon) {
    const { data, error } = await supabase.auth.updateUser({ email: email.trim(), password });
    if (error) return mapAuthError(error.message);
    userId = data.user?.id ?? sess.session!.user.id;
  } else {
    const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
    if (error) return mapAuthError(error.message);
    userId = data.user?.id ?? null;
    if (!userId) return { ok: false, reason: "error", message: "Sign-up did not return a user." };
    // When "Confirm email" is ON, signUp returns NO session — the account
    // exists but must be verified before login, and RLS blocks writing the
    // profile now. Stash the chosen role so first login applies it, and tell
    // the learner to confirm (an honest state, not the old broken half-success).
    if (!data.session) {
      stashPendingRole(email, role, displayName);
      return {
        ok: false,
        reason: "confirm_email",
        message: "Almost there! Check your email for a confirmation link, then come back and log in.",
      };
    }
  }

  // Role + name live on the owner-scoped profiles row (D-022 migration).
  const saved = await saveProfile(userId, role, displayName);
  if (!saved) return { ok: false, reason: "error", message: "Account created, but saving your role failed — set it again in Settings." };
  return { ok: true, userId };
}

/** Remember the role chosen at signup so first login can apply it. */
function stashPendingRole(email: string, role: Role, displayName: string): void {
  try {
    window.localStorage.setItem(pendingRoleKey(email), JSON.stringify({ role, displayName }));
  } catch {
    /* private mode / no storage — role can be set later in Settings */
  }
}

/** Apply and clear any role stashed at signup for this email (post-confirmation login). */
async function applyPendingRole(email: string, userId: string): Promise<void> {
  let stored: { role: Role; displayName: string } | null = null;
  try {
    const raw = window.localStorage.getItem(pendingRoleKey(email));
    if (raw) stored = JSON.parse(raw);
  } catch {
    return;
  }
  if (!stored) return;
  const ok = await saveProfile(userId, stored.role, stored.displayName ?? "");
  if (ok) {
    try {
      window.localStorage.removeItem(pendingRoleKey(email));
    } catch {
      /* ignore */
    }
  }
}

/** Upsert the owner-scoped profiles row. Shared by email signup and the OAuth callback. */
export async function saveProfile(userId: string, role: Role, displayName: string): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;
  const { error } = await supabase
    .from("profiles")
    .upsert({ user_id: userId, role, display_name: displayName.trim() || null }, { onConflict: "user_id" });
  return !error;
}

/**
 * Google OAuth (Duolingo's GOOGLE button). Redirects to Google via Supabase
 * and lands back on /auth/callback, which captures the session and — for
 * first-time OAuth users — asks who they are (student/teacher) before
 * routing home. Returns only on failure (success navigates away).
 */
export async function signInWithGoogle(): Promise<AuthResult> {
  const supabase = getSupabase();
  if (!supabase) return UNAVAILABLE;
  const redirectTo = typeof window !== "undefined" ? `${window.location.origin}/auth/callback` : undefined;
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: redirectTo ? { redirectTo } : undefined,
  });
  if (error) return mapAuthError(error.message);
  return { ok: true, userId: "" }; // browser is navigating to Google
}

export async function signInWithEmail(email: string, password: string): Promise<AuthResult> {
  const supabase = getSupabase();
  if (!supabase) return UNAVAILABLE;
  const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) return mapAuthError(error.message);
  // First login after a confirmation-required signup: apply the role they
  // picked back then (their profile has none yet).
  await applyPendingRole(email, data.user.id);
  return { ok: true, userId: data.user.id };
}

/** Duolingo's "FORGOT?" — email a recovery link that lands on /auth/reset. */
export async function requestPasswordReset(email: string): Promise<{ ok: boolean; message: string }> {
  const supabase = getSupabase();
  if (!supabase)
    return { ok: false, message: "Accounts aren't available in this environment — progress stays on this device." };
  const e = email.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) return { ok: false, message: "Enter your email above first, then tap FORGOT." };
  const redirectTo = typeof window !== "undefined" ? `${window.location.origin}/auth/reset` : undefined;
  const { error } = await supabase.auth.resetPasswordForEmail(e, redirectTo ? { redirectTo } : undefined);
  if (error) return { ok: false, message: mapAuthError(error.message).message };
  return { ok: true, message: "Check your email — we sent you a link to reset your password." };
}

/** Complete a recovery: set the new password on the recovery session. */
export async function completePasswordReset(password: string): Promise<AuthResult> {
  const supabase = getSupabase();
  if (!supabase) return UNAVAILABLE;
  if (password.length < 8) return { ok: false, reason: "weak_password", message: "Password needs at least 8 characters." };
  const { data, error } = await supabase.auth.updateUser({ password });
  if (error) return mapAuthError(error.message);
  return { ok: true, userId: data.user?.id ?? "" };
}

export async function signOut(): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;
  await supabase.auth.signOut().catch(() => {});
}

/** Current account info for UI (null = no session / no supabase). */
export async function fetchAccountInfo(): Promise<AccountInfo | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  const user = data.session?.user;
  if (!user) return null;
  let role: Role | null = null;
  let displayName: string | null = null;
  const { data: prof } = await supabase.from("profiles").select("role, display_name").eq("user_id", user.id).maybeSingle();
  if (prof) {
    role = (prof.role as Role | null) ?? null;
    displayName = (prof.display_name as string | null) ?? null;
  }
  return {
    userId: user.id,
    email: user.email ?? null,
    isAnonymous: user.is_anonymous === true,
    role,
    displayName,
  };
}
