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
  /** "keyword" = deterministic overlap; "ai" = model-suggested (still gated) */
  origin?: "keyword" | "ai";
  /** one-line rationale, only for AI suggestions */
  reason?: string;
}

/**
 * Validate raw AI link suggestions against allowlists (GATE-001 substrate).
 * The model may only point at concepts and sections that actually exist — any
 * hallucinated slug or section id is dropped, so a fabricated link can never
 * even reach the review queue, let alone become a citation. Deterministic:
 * dedupes, caps count, trims the rationale.
 */
export function sanitizeAiSuggestions(
  raw: unknown,
  allowedConceptSlugs: Set<string>,
  allowedSectionIds: Set<string>,
  max = 12
): ProposedLink[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: ProposedLink[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const conceptSlug = typeof r.conceptSlug === "string" ? r.conceptSlug : "";
    const sectionId = typeof r.sectionId === "string" ? r.sectionId : "";
    if (!allowedConceptSlugs.has(conceptSlug) || !allowedSectionIds.has(sectionId)) continue;
    const key = `${sectionId}:${conceptSlug}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const reason = typeof r.reason === "string" ? r.reason.trim().slice(0, 180) : "";
    out.push({ conceptSlug, sectionId, score: 0, matchedTerms: [], origin: "ai", reason });
    if (out.length >= max) break;
  }
  return out;
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

type Part = { heading: string; text: string; offset: number };

/** markdown ATX headings (#/##/###) — the strongest structural signal */
function markdownHeadingParts(norm: string): Part[] {
  const parts: Part[] = [];
  const matches = [...norm.matchAll(/^#{1,3}\s+(.+)$/gm)];
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const start = m.index! + m[0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index! : norm.length;
    const body = norm.slice(start, end).trim();
    if (body) parts.push({ heading: m[1].trim(), text: body, offset: m.index! });
  }
  return parts;
}

/**
 * A standalone line that reads like a heading: short, title-ish, no terminal
 * sentence punctuation, and followed by a substantially longer body line. This
 * recovers section structure from PDF-extracted or plain text that has line
 * breaks but no markdown and no blank-line paragraphs.
 */
function isHeadingLine(line: string, next: string | undefined): boolean {
  const t = line.trim();
  if (t.length < 3 || t.length > 70) return false;
  const words = t.split(/\s+/);
  if (words.length > 10) return false;
  if (/[.,;:!?]$/.test(t)) return false;
  if (!/[A-Za-z]/.test(t)) return false;
  return !!next && next.trim().length >= 60; // real body line follows
}

function headingLineParts(norm: string): Part[] {
  const lines = norm.split("\n");
  // character offset of each line start, for page estimation
  const offsets: number[] = [];
  let acc = 0;
  for (const l of lines) {
    offsets.push(acc);
    acc += l.length + 1;
  }
  const headingIdx = lines
    .map((l, i) => (isHeadingLine(l, lines.slice(i + 1).find((x) => x.trim().length > 0)) ? i : -1))
    .filter((i) => i >= 0);
  if (headingIdx.length < 2) return [];
  const parts: Part[] = [];
  for (let h = 0; h < headingIdx.length; h++) {
    const start = headingIdx[h];
    const end = h + 1 < headingIdx.length ? headingIdx[h + 1] : lines.length;
    const body = lines.slice(start + 1, end).join("\n").trim();
    if (body) parts.push({ heading: lines[start].trim(), text: body, offset: offsets[start] });
  }
  return parts;
}

/** last resort: merge blank-line blocks into ~1200-char even chunks */
function paragraphBlockParts(norm: string): Part[] {
  const parts: Part[] = [];
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
  return parts;
}

/**
 * Split raw text/markdown into sections. Markdown headings (#/##/###) win;
 * otherwise heading-like standalone lines (PDF/plaintext); otherwise blank-line
 * paragraph blocks merged to ~1200 chars so every section stays skimmable.
 */
export function sectionize(title: string, raw: string, uploadedAtISO: string): TeacherDoc {
  const norm = raw.replace(/\r\n/g, "\n").trim();
  const docId = `doc-${stableId(title + ":" + norm.length + ":" + norm.slice(0, 64))}`;

  let parts = markdownHeadingParts(norm);
  if (parts.length < 2) parts = headingLineParts(norm); // PDF/plaintext with bare heading lines
  if (parts.length < 2) parts = paragraphBlockParts(norm); // last resort: even chunks

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
