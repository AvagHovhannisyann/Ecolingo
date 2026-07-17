"use client";

/**
 * Ambient world hero (spec §17.1 "course-world background sequences",
 * §16 accessibility rules): a Higgsfield image-to-video loop of the world
 * art. Decorative only — muted, no controls, aria-hidden, and rendered as
 * the static image when the user prefers reduced motion or when video
 * can't play (poster covers both). Never used for examinable content.
 */

import Image from "next/image";
import { useState, useSyncExternalStore } from "react";

function subscribeReducedMotion(onChange: () => void): () => void {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function useReducedMotion(): boolean | null {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => null // server: undecided → render the static image
  );
}

export function AmbientHero({
  videoSrc,
  imageSrc,
  children,
}: {
  videoSrc: string;
  imageSrc: string;
  children?: React.ReactNode;
}) {
  const reducedMotion = useReducedMotion();
  // decode/codec failure anywhere → static image, never a blank hero (GATE-009 spirit)
  const [videoFailed, setVideoFailed] = useState(false);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-gray-200">
      {reducedMotion === false && !videoFailed ? (
        <video
          src={videoSrc}
          poster={imageSrc}
          autoPlay
          muted
          loop
          playsInline
          aria-hidden="true"
          tabIndex={-1}
          onError={() => setVideoFailed(true)}
          className="h-40 w-full object-cover sm:h-56"
        />
      ) : (
        <Image
          src={imageSrc}
          alt=""
          role="presentation"
          width={2688}
          height={1536}
          priority
          className="h-40 w-full object-cover sm:h-56"
        />
      )}
      {children}
    </div>
  );
}
