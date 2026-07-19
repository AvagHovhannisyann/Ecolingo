"use client";

/**
 * Examinable-concepts checklist (Wave 2 Stream N, D-020 restyle; §22).
 * Read-only truth straight from the mastery engine: whether a concept has
 * any real evidence at all, and — only when it does — a qualitative
 * strength band derived from `retentionAt` + the `conceptual`/`transfer`
 * dimensions (the same computation the flat UI used). Never a single
 * invented readiness percentage; the learner is never reduced to one
 * number.
 */

import { retentionAt } from "@/lib/engine/mastery";
import type { Concept, MasteryState, ReviewItem } from "@/lib/engine/types";
import { formatShortDate } from "./dateFormat";
import styles from "./exam.module.css";

type Strength = "not_started" | "at_risk" | "developing" | "strong";

function strengthFor(mastery: MasteryState | undefined, nowISO: string): Strength {
  if (!mastery || mastery.evidenceCount === 0) return "not_started";
  const retention = retentionAt(mastery, nowISO);
  const strength = Math.min(mastery.conceptual, Math.max(retention, 0));
  if (strength >= 0.55 && mastery.transfer >= 0.4) return "strong";
  if (strength >= 0.35) return "developing";
  return "at_risk";
}

const STRENGTH_META: Record<Strength, { label: string; badgeClass: keyof typeof styles }> = {
  not_started: { label: "Not started", badgeClass: "evidenceNotStarted" },
  at_risk: { label: "At risk", badgeClass: "evidenceAtRisk" },
  developing: { label: "Developing", badgeClass: "evidenceDeveloping" },
  strong: { label: "Strong", badgeClass: "evidenceStrong" },
};

export function ExamChecklist({
  concepts,
  masteryBySlug,
  nowISO,
  queue,
}: {
  concepts: Concept[];
  masteryBySlug: Record<string, MasteryState>;
  nowISO: string;
  queue: ReviewItem[];
}) {
  return (
    <section aria-labelledby="exam-checklist-heading" className="mt-8">
      <h2 id="exam-checklist-heading" className={styles.sectionHeading}>
        Examinable concepts ({concepts.length})
      </h2>
      <p className={styles.sectionIntro}>
        Every concept your teacher marked as exam-tagged, with whether real evidence exists yet — not a
        predicted score.
      </p>

      {concepts.length === 0 ? (
        <p className={styles.emptyChecklist}>No concepts are marked examinable in this course yet.</p>
      ) : (
        <ul className={styles.checklist}>
          {concepts.map((concept) => {
            const mastery = masteryBySlug[concept.slug];
            const hasEvidence = (mastery?.evidenceCount ?? 0) > 0;
            const strength = strengthFor(mastery, nowISO);
            const meta = STRENGTH_META[strength];
            const upcoming = queue.find((q) => q.conceptSlug === concept.slug);

            return (
              <li key={concept.slug} className={styles.checklistItem}>
                <span
                  className={`${styles.evidenceMark} ${hasEvidence ? styles.evidenceMarkFilled : styles.evidenceMarkEmpty}`}
                  aria-hidden="true"
                >
                  {hasEvidence && (
                    <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m3.5 8.5 3 3 6-7" />
                    </svg>
                  )}
                </span>
                <div className={styles.checklistBody}>
                  <div className={styles.checklistHeadRow}>
                    <span className={styles.checklistName}>{concept.name}</span>
                    <span className={`${styles.evidenceBadge} ${styles[meta.badgeClass]}`}>{meta.label}</span>
                  </div>
                  <p className={styles.checklistMeta}>
                    Importance {"★".repeat(concept.importance)}
                    {"☆".repeat(5 - concept.importance)}
                    {hasEvidence
                      ? ` · has mastery evidence (${mastery!.evidenceCount} check${mastery!.evidenceCount === 1 ? "" : "s"})`
                      : " · no evidence yet — appears once its lesson is reached"}
                  </p>
                  {upcoming && (
                    <p className={styles.checklistNext}>
                      Next review {formatShortDate(upcoming.dueAt)} — {upcoming.reasonText}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
