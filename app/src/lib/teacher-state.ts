/**
 * Teacher-side ingestion state (Phase 2, docs/06 roadmap).
 * Local-first like learner state; the Supabase course-content tables from
 * docs/03 pick this up in the production ingestion phase. The invariant that
 * matters now (GATE-001) lives here: `approvedLinks` is the ONLY source of
 * verified citations, and links enter it exclusively through an explicit
 * teacher approval in the review queue.
 */

import type { ProposedLink, TeacherDoc } from "./engine/ingest";
import type { Question } from "./engine/types";

export interface ApprovedLink extends ProposedLink {
  docId: string;
  approvedAtISO: string;
}

export interface TeacherState {
  version: 1;
  docs: TeacherDoc[];
  approvedLinks: ApprovedLink[];
  /** rejected proposals stay hidden — keys are `${docId}:${sectionId}:${conceptSlug}` */
  rejectedKeys: string[];
  /** AI-drafted, teacher-ratified practice questions (D-014); scored deterministically */
  authoredQuestions: Question[];
}

const KEY = "ecolingo.teacher.v1";

export function emptyTeacherState(): TeacherState {
  return { version: 1, docs: [], approvedLinks: [], rejectedKeys: [], authoredQuestions: [] };
}

export function loadTeacherState(): TeacherState {
  if (typeof window === "undefined") return emptyTeacherState();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return emptyTeacherState();
    const parsed = JSON.parse(raw) as Partial<TeacherState>;
    return {
      version: 1,
      docs: parsed.docs ?? [],
      approvedLinks: parsed.approvedLinks ?? [],
      rejectedKeys: parsed.rejectedKeys ?? [],
      authoredQuestions: parsed.authoredQuestions ?? [],
    };
  } catch {
    return emptyTeacherState();
  }
}

export function saveTeacherState(s: TeacherState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // storage full/blocked — state stays in memory for the session (GATE-009:
    // the UI reads back from the store, so nothing silently pretends to save)
  }
}

export function linkKey(l: { docId?: string; sectionId: string; conceptSlug: string }, docId?: string): string {
  return `${l.docId ?? docId}:${l.sectionId}:${l.conceptSlug}`;
}

export function addDoc(s: TeacherState, doc: TeacherDoc): TeacherState {
  if (s.docs.some((d) => d.id === doc.id)) return s; // same content re-uploaded
  return { ...s, docs: [...s.docs, doc] };
}

export function approveLink(s: TeacherState, docId: string, link: ProposedLink, atISO: string): TeacherState {
  const key = linkKey(link, docId);
  if (s.approvedLinks.some((l) => linkKey(l) === key)) return s;
  return {
    ...s,
    approvedLinks: [...s.approvedLinks, { ...link, docId, approvedAtISO: atISO }],
    rejectedKeys: s.rejectedKeys.filter((k) => k !== key),
  };
}

export function rejectLink(s: TeacherState, docId: string, link: ProposedLink): TeacherState {
  const key = linkKey(link, docId);
  return {
    ...s,
    approvedLinks: s.approvedLinks.filter((l) => linkKey(l) !== key),
    rejectedKeys: s.rejectedKeys.includes(key) ? s.rejectedKeys : [...s.rejectedKeys, key],
  };
}

export function removeDoc(s: TeacherState, docId: string): TeacherState {
  return {
    ...s,
    docs: s.docs.filter((d) => d.id !== docId),
    approvedLinks: s.approvedLinks.filter((l) => l.docId !== docId),
    rejectedKeys: s.rejectedKeys.filter((k) => !k.startsWith(docId + ":")),
  };
}

export function addAuthoredQuestion(s: TeacherState, q: Question): TeacherState {
  if (s.authoredQuestions.some((x) => x.id === q.id)) return s; // same stem re-approved
  return { ...s, authoredQuestions: [...s.authoredQuestions, q] };
}

export function removeAuthoredQuestion(s: TeacherState, id: string): TeacherState {
  return { ...s, authoredQuestions: s.authoredQuestions.filter((q) => q.id !== id) };
}
