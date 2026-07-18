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
  width = 2688,
  height = 1536,
  children,
}: {
  videoSrc: string;
  imageSrc: string;
  width?: number;
  height?: number;
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
          width={width}
          height={height}
          priority
          className="h-40 w-full object-cover sm:h-56"
        />
      )}
      {children}
    </div>
  );
}

/**
 * Inline ambient art (same contract as AmbientHero, but caller-sized):
 * a decorative video loop that falls back to its still for reduced-motion
 * users or on any decode failure. Used for the lesson-complete celebration.
 */
export function AmbientArt({
  videoSrc,
  imageSrc,
  width,
  height,
  className,
}: {
  videoSrc: string;
  imageSrc: string;
  width: number;
  height: number;
  className?: string;
}) {
  const reducedMotion = useReducedMotion();
  const [videoFailed, setVideoFailed] = useState(false);

  if (reducedMotion === false && !videoFailed) {
    return (
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
        className={className}
      />
    );
  }
  return (
    <Image
      src={imageSrc}
      alt=""
      role="presentation"
      width={width}
      height={height}
      className={className}
    />
  );
}
