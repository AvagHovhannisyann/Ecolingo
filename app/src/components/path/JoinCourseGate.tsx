"use client";

/**
 * The no-course state (D-022): a student who hasn't joined a course yet.
 * Duolingo-warm, zero dead ends — enter a join code, or go build a course
 * as a teacher. This replaces the old econ demo as the cloud default.
 */

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { joinCourseByCode } from "@/lib/course";
import { playSfx } from "@/lib/sfx";

export function JoinCourseGate({ onJoined }: { onJoined: () => void }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const join = async () => {
    const clean = code.trim().toUpperCase();
    if (!/^[A-Z0-9]{6,8}$/.test(clean)) {
      setError("Codes are 6–8 letters and numbers — ask your teacher for theirs.");
      return;
    }
    setBusy(true);
    setError(null);
    const result = await joinCourseByCode(clean);
    setBusy(false);
    if (result.ok) {
      playSfx("complete");
      onJoined();
    } else if (result.error === "not_found") {
      setError("No course found with that code — double-check it with your teacher.");
    } else {
      setError("Couldn't reach the classroom service — try again in a moment.");
    }
  };

  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-10 text-center">
      <Image
        src="/art-v2/eco-wave.webp"
        alt=""
        width={160}
        height={160}
        priority
        className="h-40 w-40 rounded-3xl object-cover"
      />
      <h1 className="mt-4 text-2xl font-extrabold">Join your course</h1>
      <p className="mt-2 text-sm text-app-muted">
        Your teacher has a join code for you. Enter it and your whole course appears here — lessons,
        practice, progress, all of it.
      </p>

      <label className="mt-6 block w-full text-left text-sm font-bold text-app-muted" htmlFor="join-code">
        Join code
      </label>
      <input
        id="join-code"
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !busy) void join();
        }}
        placeholder="e.g. QX7PLM"
        autoCapitalize="characters"
        autoComplete="off"
        maxLength={8}
        className="mt-1 block w-full rounded-2xl border-2 border-[color:var(--app-border)] bg-[color:var(--app-surface-2)] p-4 text-center text-xl font-extrabold tracking-[0.3em]"
      />

      {error && (
        <p className="mt-3 w-full rounded-xl border-2 border-[var(--soft-coral)] bg-[var(--coral-tint)] p-3 text-sm font-bold text-[var(--duo-red-text)]" role="alert">
          {error}
        </p>
      )}

      <button
        type="button"
        disabled={busy}
        onClick={() => void join()}
        className="btn-primary mt-4 min-h-13 w-full text-base"
      >
        {busy ? "Joining…" : "JOIN COURSE"}
      </button>

      <p className="mt-6 text-sm text-app-muted">
        Teaching a class?{" "}
        <Link href="/teach/compile" className="font-bold text-[var(--model-blue-text)] underline">
          Build your course
        </Link>{" "}
        — upload your materials and the AI compiles them into a path like this one.
      </p>
    </div>
  );
}
