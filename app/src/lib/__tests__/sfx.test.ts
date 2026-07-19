import { describe, expect, it } from "vitest";
import { SFX_RECIPES, isSfxEnabled, playSfx, setSfxEnabled } from "../sfx";

/**
 * The synth itself needs a real AudioContext (browser); these tests cover the
 * pure recipe data and the SSR/no-audio guarantees — playSfx must be a silent
 * no-op anywhere Web Audio is missing (node, jsdom, old browsers).
 */
describe("sfx recipes", () => {
  it("every oscillator effect has audible, well-formed notes", () => {
    for (const [name, notes] of Object.entries(SFX_RECIPES)) {
      expect(notes.length, name).toBeGreaterThan(0);
      for (const n of notes) {
        expect(n.freq, name).toBeGreaterThan(20); // audible band
        expect(n.freq, name).toBeLessThan(20000);
        expect(n.dur, name).toBeGreaterThan(0);
        expect(n.at, name).toBeGreaterThanOrEqual(0);
        if (n.gain !== undefined) {
          expect(n.gain, name).toBeGreaterThan(0);
          expect(n.gain, name).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it("effects stay short — UI blips, not music", () => {
    for (const [name, notes] of Object.entries(SFX_RECIPES)) {
      const end = Math.max(...notes.map((n) => n.at + n.dur));
      expect(end, name).toBeLessThanOrEqual(0.75);
    }
  });

  it("correct rises in pitch, wrong falls — the classic feedback contour", () => {
    const c = SFX_RECIPES.correct;
    expect(c[c.length - 1].freq).toBeGreaterThan(c[0].freq);
    const w = SFX_RECIPES.wrong;
    expect(w[w.length - 1].freq).toBeLessThan(w[0].freq);
  });
});

describe("sfx guards without a browser", () => {
  it("playSfx is a silent no-op outside the browser", () => {
    expect(() => playSfx("correct")).not.toThrow();
    expect(() => playSfx("whoosh")).not.toThrow();
  });

  it("enable/disable are safe without window and report disabled on the server", () => {
    expect(() => setSfxEnabled(false)).not.toThrow();
    expect(isSfxEnabled()).toBe(false); // no window → treated as off
  });
});
