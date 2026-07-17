"use client";

/**
 * Client-side PDF text extraction for Phase 2 ingestion. pdfjs is dynamically
 * imported so it never loads on the server or in the initial bundle, and the
 * worker is served as a static asset (public/pdf.worker.min.mjs) to avoid
 * bundler worker-resolution pitfalls. The worker file is copied from the
 * installed pdfjs-dist build — keep it in lockstep with package.json on
 * upgrade (a version mismatch makes pdfjs refuse to load the worker).
 *
 * Extraction is best-effort text only: we preserve line breaks (hasEOL) and
 * page boundaries, then hand the text to the same deterministic sectionizer
 * used for markdown/plaintext. No layout, images, or math are interpreted —
 * this only produces the raw source text the teacher reviews and approves.
 */

const WORKER_SRC = "/pdf.worker.min.mjs";

export async function extractPdfText(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = WORKER_SRC;

  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data }).promise;
  try {
    const pageTexts: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      let line = "";
      const lines: string[] = [];
      for (const item of content.items) {
        if (!("str" in item)) continue;
        line += item.str;
        if (item.hasEOL) {
          lines.push(line.trim());
          line = "";
        } else if (item.str) {
          line += " ";
        }
      }
      if (line.trim()) lines.push(line.trim());
      pageTexts.push(lines.join("\n"));
      page.cleanup();
    }
    return pageTexts.join("\n\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  } finally {
    await doc.destroy();
  }
}
