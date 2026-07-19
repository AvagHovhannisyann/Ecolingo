"use client";

/**
 * Character-speaks presentation (from the Duolingo reference: a character
 * stands beside a speech bubble and a speaker button reads the line aloud).
 * Wraps a lesson text step's content in that layout. Audio uses the browser's
 * Web Speech synthesis:
 *  - SSR/test-safe: renders without the button when speechSynthesis is absent
 *  - degrades silently if speak() throws (GATE-009 spirit)
 *  - any in-flight utterance is cancelled on unmount or re-tap
 * The bubble is plain DOM text — screen readers read it as ordinary content;
 * the speaker button is a labeled toggle and never auto-plays.
 */

import Image from "next/image";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import styles from "./lesson.module.css";

// Capability never changes within a page's life — subscribe is a no-op.
const subscribeNever = () => () => {};
const speechSupported = () => typeof window !== "undefined" && "speechSynthesis" in window;
const speechSupportedServer = () => false;

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
  const canSpeak = useSyncExternalStore(subscribeNever, speechSupported, speechSupportedServer);
  const [playing, setPlaying] = useState(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    return () => {
      try {
        window.speechSynthesis?.cancel();
      } catch {
        /* audio must never break the lesson */
      }
    };
  }, []);

  const toggleSpeak = () => {
    try {
      const synth = window.speechSynthesis;
      if (playing) {
        synth.cancel();
        setPlaying(false);
        return;
      }
      synth.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 0.95;
      u.onend = () => setPlaying(false);
      u.onerror = () => setPlaying(false);
      utteranceRef.current = u; // keep alive: some engines GC mid-speech otherwise
      synth.speak(u);
      setPlaying(true);
    } catch {
      setPlaying(false);
    }
  };

  return (
    <div className={styles.speaks}>
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
