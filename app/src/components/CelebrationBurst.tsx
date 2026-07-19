"use client";

import { useEffect, useRef } from "react";
import { fireConfetti, type ConfettiOptions } from "@/lib/confetti";
import { playSfx } from "@/lib/sfx";

/**
 * Celebration wrapper for end-screens (D-020 dopamine layer: lesson
 * completion, quest claim, streak milestone). Fires one confetti burst on
 * mount and, optionally, couples it to the sfx "complete" fanfare
 * (src/lib/sfx.ts) via `playSound`.
 *
 * Both effects are already SSR-safe, reduced-motion-aware, and silent-failure
 * on their own (see confetti.ts / sfx.ts) — this wrapper adds no extra
 * guards, it only sequences a single mount-time fire. Renders nothing: the
 * canvas lifecycle is fully owned by fireConfetti.
 *
 * Usage: `<CelebrationBurst playSound />` at the top of any end-screen.
 */
export function CelebrationBurst({
  origin,
  count,
  palette,
  playSound = false,
}: ConfettiOptions & { playSound?: boolean }) {
  // Capture the mount-time props once via useRef's lazy initial value (never
  // reassigned afterwards) so the effect body below has no prop
  // dependencies — it must run exactly once, at mount, on the props the
  // end-screen rendered it with.
  const optsRef = useRef({ origin, count, palette, playSound });
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return; // guard React StrictMode's dev double-invoke
    fired.current = true;
    const opts = optsRef.current;
    fireConfetti({ origin: opts.origin, count: opts.count, palette: opts.palette });
    if (opts.playSound) playSfx("complete");
  }, []);

  return null;
}
