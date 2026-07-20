"use client";

/**
 * Account presence (Duolingo-parity):
 *  - Guest / signed-out → the "Create a profile" wall: mascot, pitch, big
 *    green CREATE A PROFILE and blue SIGN IN buttons (the reference app's
 *    signature signup moment).
 *  - Signed in → a profile header card: initial avatar, name, email, role
 *    chip, and LOG OUT.
 * Rendered at the top of the profile tab (/progress) and — as the wall
 * only — as a slim banner on the learning path for guests.
 */

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut } from "@/lib/auth";
import { isTester, needsProfile, useAccountInfo } from "@/lib/use-account";

export function CreateProfileWall({ compact = false }: { compact?: boolean }) {
  return (
    <section
      className={`rounded-3xl border-2 border-[color:var(--app-border)] ${compact ? "p-4" : "p-6"}`}
      aria-label="Create a profile"
    >
      <div className="flex items-center gap-4">
        <Image
          src="/art-v2/eco-hero.webp"
          alt=""
          width={128}
          height={128}
          className={`shrink-0 rounded-2xl object-cover ${compact ? "h-14 w-14" : "h-20 w-20"}`}
        />
        <div className="min-w-0">
          <h2 className={`font-extrabold ${compact ? "text-base" : "text-xl"}`}>
            Create a profile to save your progress!
          </h2>
          <p className="mt-0.5 text-sm text-app-muted">
            Your streak, XP and course stay safe — on any device.
          </p>
        </div>
      </div>
      <div className={`mt-4 grid gap-2 ${compact ? "sm:grid-cols-2" : ""}`}>
        <Link href="/auth?mode=signup" className="btn-primary block min-h-12 py-3 text-center text-sm font-extrabold uppercase tracking-wide">
          Create a profile
        </Link>
        <Link
          href="/auth"
          className="btn-secondary block min-h-12 py-3 text-center text-sm font-extrabold uppercase tracking-wide text-[var(--model-blue-text)]"
        >
          Sign in
        </Link>
      </div>
    </section>
  );
}

export function AccountCard() {
  const router = useRouter();
  const account = useAccountInfo();

  if (account.phase === "loading") return null;

  if (needsProfile(account)) return <CreateProfileWall />;

  const info = account.info!;
  const name = info.displayName || info.email || "Learner";
  const initial = name.trim().charAt(0).toUpperCase() || "E";

  return (
    <section className="rounded-3xl border-2 border-[color:var(--app-border)] p-5" aria-label="Your account">
      <div className="flex items-center gap-4">
        <span
          aria-hidden="true"
          className="inline-flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[var(--model-blue-tint)] text-2xl font-black text-[var(--model-blue-text)]"
        >
          {initial}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-extrabold">{name}</h2>
          {info.email && <p className="truncate text-sm text-app-muted">{info.email}</p>}
          <span className="mt-1 flex flex-wrap gap-1.5">
            {info.role && (
              <span className="inline-block rounded-full bg-[color:var(--app-surface-2)] px-2 py-0.5 text-xs font-extrabold uppercase tracking-wide text-app-muted">
                {info.role}
              </span>
            )}
            {isTester(info) && (
              <span
                className="inline-block rounded-full border-2 border-[var(--duo-gold)] px-2 py-0.5 text-xs font-extrabold uppercase tracking-wide text-[var(--duo-gold)]"
                title="Designated tester — every surface (student and teacher) is open to this account."
              >
                Test mode
              </span>
            )}
          </span>
        </div>
        <button
          type="button"
          className="btn-secondary min-h-11 shrink-0 px-4 text-xs font-extrabold uppercase tracking-wide"
          onClick={() => {
            void signOut().then(() => router.push("/"));
          }}
        >
          Log out
        </button>
      </div>
    </section>
  );
}
