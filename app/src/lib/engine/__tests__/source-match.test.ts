import { describe, expect, it } from "vitest";
import { bestSourcesForConcepts } from "../source-match";
import { sectionize } from "../ingest";
import type { Concept } from "../types";

function concept(slug: string, name: string, definition: string): Concept {
  return {
    id: slug,
    slug,
    name,
    world: 1,
    definition,
    locked: false,
    importance: 3,
    examinable: true,
    sourceStatus: "planned_unverified",
    citationIds: [],
  };
}

const doc = sectionize(
  "Biology notes",
  "# Photosynthesis\nPhotosynthesis converts light energy into chemical energy in chloroplasts, releasing oxygen.\n\n# Respiration\nCellular respiration breaks down glucose to release energy as ATP in the mitochondria.",
  "2026-01-01T00:00:00.000Z",
);

describe("bestSourcesForConcepts", () => {
  it("matches each concept to the best-fitting section, with the matched terms", () => {
    const concepts = [
      concept("photosynthesis", "Photosynthesis", "converting light energy into chemical energy releasing oxygen"),
      concept("respiration", "Respiration", "breaking down glucose to release energy as ATP"),
    ];
    const res = bestSourcesForConcepts([doc], concepts);
    const photo = res.find((r) => r.conceptSlug === "photosynthesis")!;
    expect(photo.matches.length).toBeGreaterThan(0);
    expect(photo.matches[0].sectionHeading.toLowerCase()).toContain("photosynthesis");
    expect(photo.matches[0].matchedTerms.length).toBeGreaterThan(0);

    const resp = res.find((r) => r.conceptSlug === "respiration")!;
    expect(resp.matches[0].sectionHeading.toLowerCase()).toContain("respiration");
  });

  it("still lists a concept with no matching source (empty matches), so gaps are visible", () => {
    const res = bestSourcesForConcepts([doc], [concept("quantum", "Quantum tunnelling", "particles crossing energy barriers by wavefunction overlap")]);
    expect(res).toHaveLength(1);
    expect(res[0].matches).toHaveLength(0);
  });

  it("keeps at most `perConcept` matches", () => {
    const res = bestSourcesForConcepts([doc], [concept("energy", "Energy", "energy glucose oxygen light atp chemical")], 1);
    expect(res[0].matches.length).toBeLessThanOrEqual(1);
  });
});
