import { describe, expect, it } from "vitest";
import { concepts } from "../../../content/econ13210";
import { SAMPLE_LECTURE_MD, SAMPLE_LECTURE_TITLE } from "../../../content/econ13210/sample-lecture";
import { citationFromLink, keyTerms, proposeLinks, sectionize, stableId } from "../ingest";

const NOW = "2026-07-17T10:00:00.000Z";

describe("sectionize (deterministic ingestion, GATE-001 substrate)", () => {
  it("splits markdown on headings and keeps heading text", () => {
    const doc = sectionize(SAMPLE_LECTURE_TITLE, SAMPLE_LECTURE_MD, NOW);
    expect(doc.sections.map((s) => s.heading)).toEqual([
      "The production function in per-worker form",
      "The fundamental equation of the Solow model",
      "The steady state",
      "The Golden Rule of saving",
    ]);
    expect(doc.sections.every((s) => s.text.length > 0)).toBe(true);
  });

  it("is deterministic: same input, same doc id and section ids", () => {
    const a = sectionize(SAMPLE_LECTURE_TITLE, SAMPLE_LECTURE_MD, NOW);
    const b = sectionize(SAMPLE_LECTURE_TITLE, SAMPLE_LECTURE_MD, "2026-07-18T00:00:00.000Z");
    expect(a.id).toBe(b.id);
    expect(a.sections.map((s) => s.id)).toEqual(b.sections.map((s) => s.id));
  });

  it("falls back to paragraph blocks when there are no headings", () => {
    const raw = Array.from({ length: 8 }, (_, i) => `Paragraph ${i} ${"x".repeat(300)}`).join("\n\n");
    const doc = sectionize("Plain notes", raw, NOW);
    expect(doc.sections.length).toBeGreaterThan(1);
    expect(doc.sections[0].pageStart).toBe(1);
  });

  it("recovers sections from bare heading lines (PDF/plaintext, no markdown, no blank lines)", () => {
    // mimics pdfjs output: heading on its own line, body wrapped onto lines,
    // no '#' markers and no blank-line paragraph breaks
    const raw = [
      "The steady state",
      "The steady state is the level of capital per worker at which actual investment exactly equals break-even investment so capital per worker stops changing over time.",
      "The Golden Rule of saving",
      "The Golden Rule saving rate maximizes steady-state consumption per worker and for a Cobb-Douglas production function it equals the capital share alpha in the model.",
    ].join("\n");
    const doc = sectionize("Lecture (PDF text)", raw, NOW);
    expect(doc.sections.map((s) => s.heading)).toEqual(["The steady state", "The Golden Rule of saving"]);
    // each concept should now match its own distinct section, not one blob
    const proposals = proposeLinks(doc, concepts);
    const steady = proposals.find((p) => p.conceptSlug === "steady-state")!;
    const golden = proposals.find((p) => p.conceptSlug === "golden-rule")!;
    expect(steady.sectionId).not.toBe(golden.sectionId);
  });

  it("estimates page ranges monotonically", () => {
    const doc = sectionize(SAMPLE_LECTURE_TITLE, SAMPLE_LECTURE_MD, NOW);
    for (let i = 1; i < doc.sections.length; i++) {
      expect(doc.sections[i].pageStart).toBeGreaterThanOrEqual(doc.sections[i - 1].pageStart);
    }
  });
});

describe("proposeLinks (transparent keyword matching)", () => {
  const doc = sectionize(SAMPLE_LECTURE_TITLE, SAMPLE_LECTURE_MD, NOW);
  const proposals = proposeLinks(doc, concepts);

  it("proposes the right section for every world-2 concept in the sample lecture", () => {
    for (const c of concepts) {
      const best = proposals.find((p) => p.conceptSlug === c.slug);
      expect(best, `no proposal for ${c.slug}`).toBeDefined();
    }
    const steady = proposals.find((p) => p.conceptSlug === "steady-state")!;
    const section = doc.sections.find((s) => s.id === steady.sectionId)!;
    expect(section.heading).toBe("The steady state");
  });

  it("every proposal exposes the matched terms it was scored on", () => {
    for (const p of proposals) {
      expect(p.matchedTerms.length).toBeGreaterThan(0);
      expect(p.score).toBeGreaterThan(0);
      expect(p.score).toBeLessThanOrEqual(1);
    }
  });

  it("never proposes a concept whose name has no overlap with the text", () => {
    const off = sectionize("Cooking notes", "# Bread\n\nKnead the dough and let it rise overnight.\n\n# Soup\n\nSimmer the stock.", NOW);
    expect(proposeLinks(off, concepts)).toEqual([]);
  });

  it("is deterministically ordered (score desc, then slug, then section)", () => {
    const again = proposeLinks(doc, concepts);
    expect(again).toEqual(proposals);
  });
});

describe("citationFromLink (the only path to a verified citation)", () => {
  it("builds a page-level, verified citation from doc + section", () => {
    const doc = sectionize(SAMPLE_LECTURE_TITLE, SAMPLE_LECTURE_MD, NOW);
    const section = doc.sections[2];
    const cit = citationFromLink(doc, section, "steady-state");
    expect(cit.status).toBe("verified");
    expect(cit.sourceFileId).toBe(doc.id);
    expect(cit.label).toContain(SAMPLE_LECTURE_TITLE);
    expect(cit.label).toContain("The steady state");
    expect(cit.pageStart).toBeGreaterThanOrEqual(1);
  });
});

describe("helpers", () => {
  it("stableId is stable and collision-resistant enough across close strings", () => {
    expect(stableId("abc")).toBe(stableId("abc"));
    expect(stableId("abc")).not.toBe(stableId("abd"));
  });

  it("keyTerms drops stopwords and short tokens", () => {
    expect(keyTerms("the rate of the model")).toEqual(["rate", "model"]);
  });
});
