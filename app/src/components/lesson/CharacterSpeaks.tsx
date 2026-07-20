"use client";

/**
 * Character-speaks presentation (Duolingo-style: a character beside a speech
 * bubble, with a speaker button that reads the line aloud). Audio is the
 * shared self-contained voice engine (lib/tts): the device's built-in voice, or
 * our own from-scratch Web Audio synth — no server, API, or dependency. Each
 * character has its OWN voice.
 *
 * While speaking, the character "talks": its body squashes and stretches in
 * time with the audio's amplitude (a `--talk` CSS variable set every frame), so
 * it reads as the character actually speaking. (Polished per-character mouth-
 * frame lip-sync is an art/animation task for Fabel; this is the functional
 * motion hook, driven by the real sound.)
 *
 * SSR/test-safe, respects prefers-reduced-motion, and never lets audio throw
 * into the lesson (GATE-009 spirit).
 */

import Image from "next/image";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { resolveCharacterId, speak, stopSpeaking } from "@/lib/tts";
import styles from "./lesson.module.css";

const subscribeNever = () => () => {};
const isBrowser = () => typeof window !== "undefined";
const isServer = () => false;

function SpeakerIcon({ playing }: { playing: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.1" aria-hidden="true">
      <path d="M4 9.5v5h3.5L12 18V6L7.5 9.5z" fill="currentColor" stroke="none" />
      {playing ? (
        <>
          <path d="M15.5 8.5a5 5 0 0 1 0 7" strokeLinecap="round" />
          <path d="M18 6a8.5 8.5 0 0 1 0 12" strokeLinecap="round" />
        </>
      ) : (
        <path d="M15.5 8.5a5 5 0 0 1 0 7" strokeLinecap="round" />
      )}
    </svg>
  );
}

export function CharacterSpeaks({ text, characterSrc }: { text: string; characterSrc: string }) {
  const canSpeak = useSyncExternalStore(subscribeNever, isBrowser, isServer);
  const [playing, setPlaying] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => () => stopSpeaking(), []);

  const setTalk = (level: number) => {
    containerRef.current?.style.setProperty("--talk", level.toFixed(3));
  };

  const toggleSpeak = () => {
    if (playing) {
      stopSpeaking();
      setPlaying(false);
      setTalk(0);
      return;
    }
    setPlaying(true);
    speak(text, {
      characterId: resolveCharacterId(characterSrc),
      onLevel: setTalk,
      onEnd: () => {
        setPlaying(false);
        setTalk(0);
      },
    });
  };

  return (
    <div ref={containerRef} className={`${styles.speaks} ${playing ? styles.talking : ""}`}>
      <Image
        src={characterSrc}
        alt=""
        role="presentation"
        width={160}
        height={160}
        className={styles.speaksChar}
      />
      <div className={styles.bubble}>
        {canSpeak && (
          <button
            type="button"
            onClick={toggleSpeak}
            className={styles.speakBtn}
            aria-label={playing ? "Stop reading aloud" : "Read this aloud"}
            aria-pressed={playing}
          >
            <SpeakerIcon playing={playing} />
          </button>
        )}
        <p className={styles.bubbleText}>{text}</p>
      </div>
    </div>
  );
}
