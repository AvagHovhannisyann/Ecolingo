"use client";

/**
 * Login / signup — Duolingo-parity auth screen (D-022):
 * a top bar with an X (back to the landing page) and the mode toggle as a
 * bordered blue chip on the right, a centered single-column form with fat
 * rounded inputs, FORGOT? inside the password field, a big 3D primary
 * button, an OR divider, and the terms fine print. Signup asks WHO you are
 * (student/teacher cards) because the two roles land in different homes.
 *
 * Guests are first-class: creating an account upgrades the anonymous session
 * in place, so nothing a guest did is ever lost (see lib/auth.ts).
 * GATE-009: without a reachable backend the submit surfaces the typed
 * "unavailable" message — never a silent failure.
 */

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import {
  fetchAccountInfo,
  requestPasswordReset,
  signInWithEmail,
  signInWithGoogle,
  signUpWithEmail,
  validateCredentials,
  type Role,
} from "@/lib/auth";
import { playSfx } from "@/lib/sfx";

type Mode = "login" | "signup";

function GoogleG() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path fill="#4285F4" d="M23.5 12.27c0-.85-.08-1.66-.22-2.45H12v4.64h6.45a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.1 3.57-5.17 3.57-8.81z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.88-3c-1.08.72-2.45 1.15-4.06 1.15-3.13 0-5.78-2.11-6.72-4.95H1.27v3.1A12 12 0 0 0 12 24z" />
      <path fill="#FBBC05" d="M5.28 14.29a7.2 7.2 0 0 1 0-4.58v-3.1H1.27a12 12 0 0 0 0 10.78l4.01-3.1z" />
      <path fill="#EA4335" d="M12 4.77c1.76 0 3.35.6 4.6 1.8l3.44-3.44A11.97 11.97 0 0 0 12 0 12 12 0 0 0 1.27 6.61l4.01 3.1C6.22 6.88 8.87 4.77 12 4.77z" />
    </svg>
  );
}

export function AuthClient() {
  const router = useRouter();
  const params = useSearchParams();
  const [mode, setMode] = useState<Mode>(params.get("mode") === "signup" ? "signup" : "login");
  const [role, setRole] = useState<Role | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const destinationFor = (r: Role | null) => (r === "teacher" ? "/teach" : "/learn");

  const submit = async () => {
    setError(null);
    setNotice(null);
    const valid = validateCredentials(email, password);
    if (!valid.ok) return setError(valid.message);
    if (mode === "signup" && !role) return setError("Pick who you are — student or teacher.");
    setBusy(true);
    const result =
      mode === "signup"
        ? await signUpWithEmail(email, password, role as Role, displayName)
        : await signInWithEmail(email, password);
    if (!result.ok) {
      setBusy(false);
      return setError(result.message);
    }
    playSfx("complete");
    const info = mode === "login" ? await fetchAccountInfo() : null;
    router.push(destinationFor(mode === "signup" ? role : (info?.role ?? null)));
  };

  const forgot = async () => {
    setError(null);
    setBusy(true);
    const res = await requestPasswordReset(email);
    setBusy(false);
    if (res.ok) setNotice(res.message);
    else setError(res.message);
  };

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-6rem)] max-w-md flex-col px-1 py-2">
      {/* top bar: X back to landing, mode toggle chip on the right */}
      <div className="flex items-center justify-between">
        <Link href="/" aria-label="Close and go back" className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-app-muted hover:bg-[color:var(--app-surface-2)]">
          <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
        </Link>
        <button
          type="button"
          className="btn-secondary min-h-11 px-5 text-sm font-extrabold uppercase tracking-wide text-[var(--model-blue-text)]"
          onClick={() => {
            setError(null);
            setNotice(null);
            setMode((m) => (m === "login" ? "signup" : "login"));
          }}
        >
          {mode === "login" ? "Sign up" : "Log in"}
        </button>
      </div>

      <div className="flex flex-1 flex-col justify-center py-6">
        <h1 className="text-center text-2xl font-extrabold">
          {mode === "login" ? "Log in" : "Create your profile"}
        </h1>
        {mode === "signup" && (
          <p className="mt-1 text-center text-sm text-app-muted">
            Been learning as a guest? Creating a profile keeps everything — streak, progress, all of it.
          </p>
        )}

        {mode === "signup" && (
          <fieldset className="mt-5">
            <legend className="sr-only">I&apos;m joining as…</legend>
            <div className="grid grid-cols-2 gap-3">
              {(
                [
                  { r: "student" as Role, img: "/art-v2/eco-wave.webp", label: "Student", sub: "Learn a course" },
                  { r: "teacher" as Role, img: "/art-v2/eco-books.webp", label: "Teacher", sub: "Build a course" },
                ]
              ).map(({ r, img, label, sub }) => (
                <button
                  key={r}
                  type="button"
                  aria-pressed={role === r}
                  onClick={() => {
                    playSfx("pop");
                    setRole(r);
                  }}
                  className={`flex min-h-28 flex-col items-center justify-center gap-1 rounded-2xl border-2 p-3 text-center transition ${
                    role === r
                      ? "border-[var(--model-blue)] bg-[var(--model-blue-tint)]"
                      : "border-[color:var(--app-border)] hover:bg-[color:var(--app-surface-2)]"
                  }`}
                >
                  <Image src={img} alt="" width={56} height={56} className="h-14 w-14 rounded-xl object-cover" />
                  <span className="text-sm font-extrabold">{label}</span>
                  <span className="text-xs text-app-muted">{sub}</span>
                </button>
              ))}
            </div>
          </fieldset>
        )}

        {/* Duolingo-style stacked input group */}
        <div className="mt-5 overflow-hidden rounded-2xl border-2 border-[color:var(--app-border)]">
          {mode === "signup" && (
            <input
              type="text"
              autoComplete="name"
              placeholder="Name (optional — shown to your class)"
              aria-label="Display name"
              maxLength={60}
              className="block w-full border-b-2 border-[color:var(--app-border)] bg-[color:var(--app-surface-2)] p-4 text-base outline-none focus:bg-[color:var(--app-surface)]"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          )}
          <input
            type="email"
            autoComplete="email"
            placeholder="Email"
            aria-label="Email"
            className="block w-full border-b-2 border-[color:var(--app-border)] bg-[color:var(--app-surface-2)] p-4 text-base outline-none focus:bg-[color:var(--app-surface)]"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              placeholder="Password"
              aria-label="Password"
              className="block w-full bg-[color:var(--app-surface-2)] p-4 pr-28 text-base outline-none focus:bg-[color:var(--app-surface)]"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !busy) void submit();
              }}
            />
            <span className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-2">
              {/* eye toggle (reference signup screen) */}
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-app-muted hover:text-[var(--model-blue-text)]"
              >
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12z" />
                  <circle cx="12" cy="12" r="2.6" />
                  {showPassword && <path d="M4 4l16 16" strokeLinecap="round" />}
                </svg>
              </button>
              {mode === "login" && (
                <button
                  type="button"
                  onClick={() => void forgot()}
                  disabled={busy}
                  className="text-xs font-extrabold uppercase tracking-wide text-app-muted hover:text-[var(--model-blue-text)]"
                >
                  Forgot?
                </button>
              )}
            </span>
          </div>
        </div>

        {error && (
          <p className="mt-3 rounded-xl border-2 border-[var(--soft-coral)] bg-[var(--coral-tint)] p-3 text-sm font-bold text-[color:var(--duo-red-text)]" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="mt-3 rounded-xl border-2 border-[color:var(--app-border)] p-3 text-sm font-bold text-app" role="status">
            {notice}
          </p>
        )}

        <button
          type="button"
          disabled={busy}
          onClick={() => void submit()}
          className="btn-primary mt-4 min-h-13 w-full text-base"
        >
          {busy ? "One moment…" : mode === "login" ? "LOG IN" : "CREATE ACCOUNT"}
        </button>

        <div className="my-5 flex items-center gap-3 text-xs font-bold uppercase tracking-wide text-app-muted" aria-hidden>
          <span className="h-0.5 flex-1 bg-[color:var(--app-border)]" />
          or
          <span className="h-0.5 flex-1 bg-[color:var(--app-border)]" />
        </div>

        {/* Google OAuth (reference signup screen): live button through
            Supabase signInWithOAuth; if the provider is off server-side the
            typed error surfaces honestly instead of a dead redirect. */}
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setError(null);
            setNotice(null);
            void signInWithGoogle().then((res) => {
              if (!res.ok) setError(res.message);
            });
          }}
          className="btn-secondary inline-flex min-h-13 w-full items-center justify-center gap-2 text-sm font-extrabold uppercase tracking-wide"
        >
          <GoogleG />
          Google
        </button>

        <p className="mt-6 text-center text-xs leading-relaxed text-app-muted">
          By signing in to Ecolingo, you agree to our Terms and Privacy Policy. Your learning data belongs to you
          and is only ever visible to you and the teacher of a course you join.
        </p>
      </div>
    </div>
  );
}
