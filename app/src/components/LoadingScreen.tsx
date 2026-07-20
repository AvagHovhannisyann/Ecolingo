"use client";

/**
 * Duolingo-style loading screen: the mascot bobs mid-screen while small accent
 * sparks float up around it, with a rotating study tip underneath. Replaces
 * the bare "Loading…" line on the enrolled-course surfaces (home path,
 * sections, compiled lesson).
 *
 * Motion rules: every animation is gated behind prefers-reduced-motion:
 * no-preference (see the module CSS) — reduced-motion visitors get a static
 * mascot and text. The component is purely decorative chrome around an
 * aria-busy live region, so screen readers hear one polite "Loading…".
 */

import { AmbientArt } from "./AmbientHero";
import styles from "./loading-screen.module.css";

const TIPS = [
  "Sessions start easy and ramp up — the difficulty target is where you finish, not where you begin.",
  "Wrong answers cost nothing here. They tell the course what to teach next.",
  "A few minutes daily beats a long cram — streaks exist for a reason.",
  "Feeling unsure before you answer? Say so — calibration is part of mastery.",
  "Review is scheduled right before you'd forget. Trust the timing.",
];

export function LoadingScreen({ label = "Loading…" }: { label?: string }) {
  // Tip choice is a pure hash of the label — deterministic, so server and
  // client render the same tip (no hydration mismatch) while different
  // surfaces still show different tips.
  let h = 0;
  for (let i = 0; i < label.length; i++) h = (h * 31 + label.charCodeAt(i)) | 0;
  const tip = TIPS[Math.abs(h) % TIPS.length];

  return (
    <div className={styles.wrap} role="status" aria-busy="true" aria-live="polite">
      <div className={styles.stage} aria-hidden="true">
        <span className={`${styles.spark} ${styles.spark1}`} />
        <span className={`${styles.spark} ${styles.spark2}`} />
        <span className={`${styles.spark} ${styles.spark3}`} />
        {/* Higgsfield wave loop; reduced-motion / decode failure → still image */}
        <AmbientArt
          videoSrc="/art-cast/eco-wave-loop.mp4"
          imageSrc="/art-v2/eco-wave.webp"
          width={480}
          height={480}
          className={styles.mascot}
        />
        <span className={styles.shadow} />
      </div>
      <p className={styles.label}>{label}</p>
      <p className={styles.tip}>{tip}</p>
    </div>
  );
}
