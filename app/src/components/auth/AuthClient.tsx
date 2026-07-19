"use client";

/**
 * Login / signup (D-022) — Duolingo-parity: one centered card, fat rounded
 * inputs, a big blue primary action, quiet mode toggle. Signup asks WHO you
 * are (student/teacher cards) because the two roles land in different homes.
 *
 * Guests are first-class: creating an account upgrades the anonymous session
 * in place, so nothing a guest did is ever lost (see lib/auth.ts).
 * GATE-009: without Supabase this renders an honest "device-only" notice.
 */

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { fetchAccountInfo, signInWithEmail, signUpWithEmail, validateCredentials, type Role } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { playSfx } from "@/lib/sfx";

type Mode = "login" | "signup";

export function AuthClient() {
  const router = useRouter();
  const params = useSearchParams();
  const [mode, setMode] = useState<Mode>(params.get("mode") === "signup" ? "signup" : "login");
  const [role, setRole] = useState<Role | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const cloudless = getSupabase() === null;

  const destinationFor = (r: Role | null) => (r === "teacher" ? "/teach" : "/learn");

  const submit = async () => {
    setError(null);
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

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center py-8">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">{mode === "login" ? "Log in" : "Create your profile"}</h1>
        <button
          type="button"
          className="btn-secondary min-h-11 px-4 text-sm font-bold uppercase tracking-wide text-[var(--model-blue-text)]"
          onClick={() => {
            setError(null);
            setMode((m) => (m === "login" ? "signup" : "login"));
          }}
        >
          {mode === "login" ? "Sign up" : "Log in"}
        </button>
      </div>

      {cloudless && (
        <p className="mb-4 rounded-2xl border-2 border-[color:var(--app-border)] p-4 text-sm text-app-muted" role="note">
          Accounts aren&apos;t available in this environment — everything you do is saved on this device, and you can
          keep learning as a guest from the <Link className="underline" href="/learn">learning path</Link>.
        </p>
      )}

      {mode === "signup" && (
        <fieldset className="mb-4">
          <legend className="mb-2 text-sm font-bold text-app-muted">I&apos;m joining as…</legend>
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

      <div className="space-y-3">
        {mode === "signup" && (
          <input
            type="text"
            autoComplete="name"
            placeholder="Name (shown to your class)"
            aria-label="Display name"
            maxLength={60}
            className="block w-full rounded-2xl border-2 border-[color:var(--app-border)] bg-[color:var(--app-surface-2)] p-4 text-base"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        )}
        <input
          type="email"
          autoComplete="email"
          placeholder="Email"
          aria-label="Email"
          className="block w-full rounded-2xl border-2 border-[color:var(--app-border)] bg-[color:var(--app-surface-2)] p-4 text-base"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          type="password"
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          placeholder="Password"
          aria-label="Password"
          className="block w-full rounded-2xl border-2 border-[color:var(--app-border)] bg-[color:var(--app-surface-2)] p-4 text-base"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !busy) void submit();
          }}
        />
      </div>

      {error && (
        <p className="mt-3 rounded-xl border-2 border-[var(--soft-coral)] bg-[var(--coral-tint)] p-3 text-sm font-bold text-[var(--duo-red-text)]" role="alert">
          {error}
        </p>
      )}

      <button
        type="button"
        disabled={busy || cloudless}
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

      {/* Google OAuth ships once provider credentials exist in the Supabase
          dashboard — rendered honestly disabled rather than pretending. */}
      <button
        type="button"
        disabled
        aria-disabled="true"
        title="Google sign-in is coming — it needs OAuth credentials configured on the project."
        className="btn-secondary min-h-13 w-full text-sm font-bold uppercase tracking-wide text-app-muted"
      >
        Google — coming soon
      </button>

      {mode === "signup" && (
        <p className="mt-4 text-center text-xs text-app-muted">
          Been learning as a guest on this device? Creating an account keeps everything — streak, progress, all of it.
        </p>
      )}
    </div>
  );
}
