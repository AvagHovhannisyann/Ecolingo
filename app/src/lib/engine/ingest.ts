/**
 * Phase 2 course ingestion — the deterministic half (docs/06 roadmap, GATE-001).
 *
 * A teacher uploads lecture notes / a syllabus as text or markdown. This module
 * sectionizes the document and *proposes* concept↔section links with a
 * transparent keyword score. Nothing becomes a citation until the teacher
 * approves the link in the review queue: citations are never invented, and a
 * proposal is always shown with the exact terms that matched (§ ingestion
 * honesty). AI-assisted extraction can layer on top later (docs/04 §3); the
 * approval gate stays the same.
 */

import type { Citation, Concept } from "./types";

export interface DocSection {
  id: string;
  ordinal: number;
  heading: string;
  text: string;
  /** estimated page range (≈ CHARS_PER_PAGE chars/page, deterministic) */
  pageStart: number;
  pageEnd: number;
}

export interface TeacherDoc {
  id: string;
  title: string;
  uploadedAtISO: string;
  charCount: number;
  sections: DocSection[];
}

export interface ProposedLink {
  conceptSlug: string;
  sectionId: string;
  /** 0..1 — fraction of the concept's key terms found in the section */
  score: number;
  matchedTerms: string[];
}

const CHARS_PER_PAGE = 2800;

/** deterministic id from a string — stable across sessions, no randomness */
export function stableId(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) h = ((h << 5) + h + input.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

const STOPWORDS = new Set(
  "a an and are as at be but by for from has have in into is it its of on or per that the this to was were what when which with over under more most".split(" ")
);

export function keyTerms(text: string): string[] {
  return [
    ...new Set(
      text
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length >= 3 && !STOPWORDS.has(w))
    ),
  ];
}

/**
 * Split raw text/markdown into sections. Markdown headings (#/##/###) win;
 * documents without headings fall back to blank-line paragraph blocks merged
 * to ~1200 chars so every section stays skimmable in the review queue.
 */
export function sectionize(title: string, raw: string, uploadedAtISO: string): TeacherDoc {
  const norm = raw.replace(/\r\n/g, "\n").trim();
  const docId = `doc-${stableId(title + ":" + norm.length + ":" + norm.slice(0, 64))}`;

  const parts: { heading: string; text: string; offset: number }[] = [];
  const headingRe = /^#{1,3}\s+(.+)$/gm;
  const matches = [...norm.matchAll(headingRe)];

  if (matches.length >= 2) {
    for (let i = 0; i < matches.length; i++) {
      const m = matches[i];
      const start = m.index! + m[0].length;
      const end = i + 1 < matches.length ? matches[i + 1].index! : norm.length;
      const body = norm.slice(start, end).trim();
      if (body) parts.push({ heading: m[1].trim(), text: body, offset: m.index! });
    }
  } else {
    const blocks = norm.split(/\n\s*\n/);
    let buf = "";
    let bufOffset = 0;
    let offset = 0;
    for (const b of blocks) {
      if (!buf) bufOffset = offset;
      buf = buf ? buf + "\n\n" + b : b;
      offset += b.length + 2;
      if (buf.length >= 1200) {
        parts.push({ heading: buf.split("\n")[0].slice(0, 60), text: buf, offset: bufOffset });
        buf = "";
      }
    }
    if (buf.trim()) parts.push({ heading: buf.split("\n")[0].slice(0, 60), text: buf, offset: bufOffset });
  }

  const sections: DocSection[] = parts.map((p, i) => ({
    id: `${docId}-s${i + 1}`,
    ordinal: i + 1,
    heading: p.heading,
    text: p.text,
    pageStart: Math.floor(p.offset / CHARS_PER_PAGE) + 1,
    pageEnd: Math.floor((p.offset + p.text.length) / CHARS_PER_PAGE) + 1,
  }));

  return { id: docId, title, uploadedAtISO, charCount: norm.length, sections };
}

/**
 * Propose concept↔section links by transparent term overlap. score is the
 * fraction of the concept's key terms (name weighted double) present in the
 * section. Deterministic ordering: score desc, then section ordinal.
 */
export function proposeLinks(doc: TeacherDoc, concepts: Concept[], minScore = 0.34): ProposedLink[] {
  const out: ProposedLink[] = [];
  for (const c of concepts) {
    const nameTerms = keyTerms(c.name);
    const defTerms = keyTerms(c.definition).filter((t) => !nameTerms.includes(t));
    const totalWeight = nameTerms.length * 2 + defTerms.length;
    if (totalWeight === 0) continue;
    for (const s of doc.sections) {
      const hay = new Set(keyTerms(s.heading + " " + s.text));
      const matchedName = nameTerms.filter((t) => hay.has(t));
      const matchedDef = defTerms.filter((t) => hay.has(t));
      const score = (matchedName.length * 2 + matchedDef.length) / totalWeight;
      if (score >= minScore && matchedName.length > 0) {
        out.push({
          conceptSlug: c.slug,
          sectionId: s.id,
          score: Math.round(score * 100) / 100,
          matchedTerms: [...matchedName, ...matchedDef],
        });
      }
    }
  }
  return out.sort(
    (a, b) => b.score - a.score || a.conceptSlug.localeCompare(b.conceptSlug) || a.sectionId.localeCompare(b.sectionId)
  );
}

/** an approved link becomes a real, page-level citation (only path to "verified") */
export function citationFromLink(doc: TeacherDoc, section: DocSection, conceptSlug: string): Citation {
  return {
    id: `cit-${stableId(doc.id + section.id + conceptSlug)}`,
    label: `${doc.title} § ${section.heading} (p. ${section.pageStart}${
      section.pageEnd !== section.pageStart ? `–${section.pageEnd}` : ""
    })`,
    sourceFileId: doc.id,
    pageStart: section.pageStart,
    pageEnd: section.pageEnd,
    status: "verified",
  };
}
