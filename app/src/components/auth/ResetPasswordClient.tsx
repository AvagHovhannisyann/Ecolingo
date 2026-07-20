"use client";

/**
 * Password-recovery landing page. The email link from requestPasswordReset
 * opens this page with a recovery session already established by Supabase;
 * the user just sets a new password (auth.updateUser). Opening it without a
 * recovery session shows an honest explanation instead of a broken form.
 */

import Link from "next/link";
import { useState } from "react";
import { completePasswordReset } from "@/lib/auth";
import { playSfx } from "@/lib/sfx";

export function ResetPasswordClient() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError(null);
    setBusy(true);
    const res = await completePasswordReset(password);
    setBusy(false);
    if (!res.ok) return setError(res.message);
    playSfx("complete");
    setDone(true);
  };

  if (done) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center text-center">
        <h1 className="text-2xl font-extrabold">Password updated</h1>
        <p className="mt-2 text-sm text-app-muted">You&apos;re signed in — pick up right where you left off.</p>
        <Link href="/learn" className="btn-primary mt-6 min-h-13 px-8 text-base">
          CONTINUE LEARNING
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col justify-center">
      <h1 className="text-center text-2xl font-extrabold">Choose a new password</h1>
      <input
        type="password"
        autoComplete="new-password"
        placeholder="New password (8+ characters)"
        aria-label="New password"
        className="mt-5 block w-full rounded-2xl border-2 border-[color:var(--app-border)] bg-[color:var(--app-surface-2)] p-4 text-base outline-none focus:bg-[color:var(--app-surface)]"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !busy) void submit();
        }}
      />
      {error && (
        <p className="mt-3 rounded-xl border-2 border-[var(--soft-coral)] bg-[var(--coral-tint)] p-3 text-sm font-bold text-[color:var(--duo-red-text)]" role="alert">
          {error}
        </p>
      )}
      <button type="button" disabled={busy} onClick={() => void submit()} className="btn-primary mt-4 min-h-13 w-full text-base">
        {busy ? "One moment…" : "SET NEW PASSWORD"}
      </button>
      <p className="mt-4 text-center text-xs text-app-muted">
        This page works from the link in your reset email. If you landed here another way,{" "}
        <Link className="underline" href="/auth">
          go back to log in
        </Link>
        .
      </p>
    </div>
  );
}
