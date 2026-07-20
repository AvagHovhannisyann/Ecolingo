"use client";

/**
 * OAuth landing page (/auth/callback). Supabase JS captures the session from
 * the redirect URL automatically; this page waits for it, then:
 *  - existing profile with a role → straight to that role's home
 *  - first-time OAuth user → the same student/teacher choice email signup
 *    asks, saved to the owner-scoped profiles row, then home
 *  - no session after a grace period → honest failure with a way back
 */

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { fetchAccountInfo, saveProfile, type AccountInfo, type Role } from "@/lib/auth";
import { playSfx } from "@/lib/sfx";
import { LoadingScreen } from "../LoadingScreen";

type Phase = { kind: "waiting" } | { kind: "pick_role"; info: AccountInfo } | { kind: "failed" };

export function OAuthCallbackClient() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ kind: "waiting" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    let tries = 0;
    // The session lands asynchronously (detectSessionInUrl); poll briefly.
    const tick = async () => {
      const info = await fetchAccountInfo();
      if (!alive) return;
      if (info && !info.isAnonymous) {
        if (info.role) {
          router.replace(info.role === "teacher" ? "/teach" : "/learn");
        } else {
          setPhase({ kind: "pick_role", info });
        }
        return;
      }
      tries += 1;
      if (tries >= 10) return setPhase({ kind: "failed" });
      setTimeout(() => void tick(), 700);
    };
    void tick();
    return () => {
      alive = false;
    };
  }, [router]);

  const chooseRole = async (role: Role) => {
    if (phase.kind !== "pick_role" || busy) return;
    setBusy(true);
    const name = phase.info.displayName ?? phase.info.email?.split("@")[0] ?? "";
    await saveProfile(phase.info.userId, role, name);
    playSfx("complete");
    router.replace(role === "teacher" ? "/teach" : "/learn");
  };

  if (phase.kind === "waiting") return <LoadingScreen label="Signing you in…" />;

  if (phase.kind === "failed") {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center text-center">
        <h1 className="text-2xl font-extrabold">That sign-in didn&apos;t complete</h1>
        <p className="mt-2 text-sm text-app-muted">
          The Google sign-in didn&apos;t hand us a session. Try again, or use email and password.
        </p>
        <Link href="/auth" className="btn-primary mt-6 min-h-13 px-8 text-base">
          BACK TO LOG IN
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col justify-center">
      <h1 className="text-center text-2xl font-extrabold">Welcome! Who are you?</h1>
      <p className="mt-1 text-center text-sm text-app-muted">
        One-time choice — it decides which home you land in.
      </p>
      <div className="mt-5 grid grid-cols-2 gap-3">
        {(
          [
            { r: "student" as Role, img: "/art-v2/eco-wave.webp", label: "Student", sub: "Learn a course" },
            { r: "teacher" as Role, img: "/art-v2/eco-books.webp", label: "Teacher", sub: "Build a course" },
          ]
        ).map(({ r, img, label, sub }) => (
          <button
            key={r}
            type="button"
            disabled={busy}
            onClick={() => void chooseRole(r)}
            className="flex min-h-32 flex-col items-center justify-center gap-1 rounded-2xl border-2 border-[color:var(--app-border)] p-3 text-center transition hover:bg-[color:var(--app-surface-2)] disabled:opacity-50"
          >
            <Image src={img} alt="" width={56} height={56} className="h-14 w-14 rounded-xl object-cover" />
            <span className="text-sm font-extrabold">{label}</span>
            <span className="text-xs text-app-muted">{sub}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
