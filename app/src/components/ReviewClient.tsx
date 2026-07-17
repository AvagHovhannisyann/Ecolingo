"use client";

/**
 * Review queue (IDEA-109..112, 114, 119). Deterministic scheduler output;
 * every item shows the learner-readable reason it was scheduled (§22).
 * Completing a review answers a question for that concept and records
 * evidence, which reschedules the next interval.
 */

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { concepts, questions } from "@/content/econ13210";
import { buildReviewQueue, dueNow } from "@/lib/engine/scheduler";
import { markReviewed, recordEvidence } from "@/lib/learner-state";
import { mutateLearnerState, useLearnerState } from "@/lib/learner-store";
import type { EvidenceEvent, ReviewItem } from "@/lib/engine/types";
import { QuestionCard } from "./QuestionCard";

export function ReviewClient() {
  const state = useLearnerState();
  const [active, setActive] = useState<ReviewItem | null>(null);
  const [doneSlugs, setDoneSlugs] = useState<string[]>([]);
  if (!state) return <p className="p-4 text-sm text-gray-500">Loading reviews…</p>;

  const nowISO = new Date().toISOString();
  const queue = buildReviewQueue({
    nowISO,
    concepts,
    mastery: state.masteryBySlug,
    prevIntervals: state.prevIntervals,
    plan: state.plan,
  }).filter((i) => !doneSlugs.includes(i.conceptSlug));
  const due = dueNow(queue, nowISO);
  const upcoming = queue.filter((i) => Date.parse(i.dueAt) > Date.parse(nowISO));

  const questionFor = (slug: string) =>
    questions.find((q) => q.conceptSlug === slug && q.transferDistance > 0) ??
    questions.find((q) => q.conceptSlug === slug) ??
    null;

  const handleEvidence = (item: ReviewItem, e: EvidenceEvent, correct: boolean) => {
    mutateLearnerState((s) => {
      let next = recordEvidence(s, e);
      if (correct) next = markReviewed(next, item.conceptSlug, item.intervalDays);
      return next;
    });
    if (correct) {
      setDoneSlugs((xs) => [...xs, item.conceptSlug]);
      setActive(null);
    }
  };

  if (active) {
    const q = questionFor(active.conceptSlug);
    const concept = concepts.find((c) => c.slug === active.conceptSlug);
    if (!q) return <p>No question available for this concept yet.</p>;
    return (
      <div>
        <h1 className="text-xl font-semibold">Review: {concept?.name}</h1>
        <p className="mt-1 text-sm text-gray-600">{active.reasonText}</p>
        <div className="mt-4">
          <QuestionCard key={`${active.conceptSlug}-${q.id}`} question={q} onEvidence={(e, r) => handleEvidence(active, e, r.correct)} />
        </div>
        <button type="button" onClick={() => setActive(null)} className="mt-4 min-h-12 rounded-xl border border-gray-400 px-4 text-sm">
          Back to queue
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* Higgsfield review-garden art (approved decorative slot §17.2) */}
      <div className="relative mb-4 overflow-hidden rounded-2xl border border-gray-200">
        <Image
          src="/art/review-header.webp"
          alt=""
          role="presentation"
          width={1344}
          height={768}
          priority
          className="h-32 w-full object-cover sm:h-40"
        />
        <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/70 to-transparent p-4 text-white">
          <h1 className="text-xl font-semibold">Review — practice before you forget</h1>
          <p className="text-sm opacity-90">Tend the ideas before they wilt.</p>
        </div>
      </div>

      {state.auditLog.length === 0 ? (
        <p className="mt-4 rounded-2xl border border-gray-200 p-4 text-sm text-gray-600">
          Nothing to review yet — reviews are scheduled from real evidence. Start with{" "}
          <Link href="/" className="underline">
            today&apos;s lesson
          </Link>
          .
        </p>
      ) : (
        <>
          <h2 className="mt-5 font-medium">Due now</h2>
          {due.length === 0 && <p className="mt-2 text-sm text-gray-600">Nothing due right now — that&apos;s the schedule working.</p>}
          <ul className="mt-2 space-y-3">
            {due.map((item) => {
              const c = concepts.find((x) => x.slug === item.conceptSlug);
              return (
                <li key={item.conceptSlug} className="rounded-2xl border border-gray-300 p-4">
                  <p className="font-medium">{c?.name}</p>
                  <p className="mt-1 text-sm text-gray-600">{item.reasonText}</p>
                  <button
                    type="button"
                    onClick={() => setActive(item)}
                    className="mt-3 min-h-12 rounded-xl bg-gray-900 px-5 text-white"
                  >
                    Review now
                  </button>
                </li>
              );
            })}
          </ul>

          <h2 className="mt-6 font-medium">Coming up</h2>
          <ul className="mt-2 space-y-2">
            {upcoming.map((item) => {
              const c = concepts.find((x) => x.slug === item.conceptSlug);
              return (
                <li key={item.conceptSlug} className="rounded-2xl border border-gray-200 p-3 text-sm">
                  <span className="font-medium">{c?.name}</span> — due {new Date(item.dueAt).toLocaleDateString()}
                  <span className="block text-gray-600">{item.reasonText}</span>
                </li>
              );
            })}
            {upcoming.length === 0 && due.length === 0 && (
              <li className="text-sm text-gray-600">Complete a lesson to start the schedule.</li>
            )}
          </ul>
        </>
      )}
    </div>
  );
}
