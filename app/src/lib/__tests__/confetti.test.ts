import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  DEFAULT_PALETTE,
  fireConfetti,
  isSettled,
  resolveConfettiMode,
  spawnParticles,
  stepParticle,
  type Particle,
} from "../confetti";

/**
 * The DOM/canvas rendering path (fireConfetti's rAF loop) needs a real
 * browser and is covered by manual + e2e visual verification. These tests
 * cover the pure parts: seeded particle generation, the physics step, the
 * settle predicate, the reduced-motion branch decision, and the SSR/no-DOM
 * guarantee — the same split sfx.test.ts uses for the synth vs. the recipes.
 */

const VIEWPORT_H = 800;

describe("spawnParticles — seeded determinism", () => {
  it("the same seed always produces the same particle stream", () => {
    const a = spawnParticles(40, 12345, { origin: { x: 100, y: 200 } });
    const b = spawnParticles(40, 12345, { origin: { x: 100, y: 200 } });
    expect(a).toEqual(b);
  });

  it("different seeds produce different streams", () => {
    const a = spawnParticles(40, 1, { origin: { x: 0, y: 0 } });
    const b = spawnParticles(40, 2, { origin: { x: 0, y: 0 } });
    expect(a).not.toEqual(b);
  });

  it("spawns exactly `count` particles, all starting at the origin", () => {
    const origin = { x: 42, y: 84 };
    const particles = spawnParticles(30, 7, { origin });
    expect(particles).toHaveLength(30);
    for (const p of particles) {
      expect(p.x).toBe(origin.x);
      expect(p.y).toBe(origin.y);
      expect(p.life).toBe(0);
      expect(["rect", "circle"]).toContain(p.shape);
    }
  });

  it("defaults to the brand palette when none is supplied", () => {
    const particles = spawnParticles(50, 3);
    for (const p of particles) {
      expect(DEFAULT_PALETTE).toContain(p.color);
    }
  });

  it("respects a custom palette", () => {
    const palette = ["#000000"];
    const particles = spawnParticles(10, 3, { palette });
    for (const p of particles) {
      expect(p.color).toBe("#000000");
    }
  });

  it("count 0 yields no particles, and never throws for negative/fractional counts", () => {
    expect(spawnParticles(0, 1)).toHaveLength(0);
    expect(() => spawnParticles(-5, 1)).not.toThrow();
    expect(spawnParticles(-5, 1)).toHaveLength(0);
    expect(spawnParticles(3.9, 1)).toHaveLength(3);
  });
});

describe("stepParticle — pure physics properties", () => {
  const arbParticle: fc.Arbitrary<Particle> = fc.record({
    x: fc.double({ min: -2000, max: 2000, noNaN: true }),
    y: fc.double({ min: -2000, max: 2000, noNaN: true }),
    vx: fc.double({ min: -600, max: 600, noNaN: true }),
    vy: fc.double({ min: -600, max: 600, noNaN: true }),
    rotation: fc.double({ min: 0, max: Math.PI * 2, noNaN: true }),
    vr: fc.double({ min: -20, max: 20, noNaN: true }),
    size: fc.double({ min: 1, max: 12, noNaN: true }),
    color: fc.constantFrom(...DEFAULT_PALETTE),
    shape: fc.constantFrom<"rect" | "circle">("rect", "circle"),
    life: fc.double({ min: 0, max: 2, noNaN: true }),
  });

  it("gravity monotonically increases vy, step after step", () => {
    fc.assert(
      fc.property(arbParticle, fc.double({ min: 0.001, max: 0.1, noNaN: true }), (p, dt) => {
        const next = stepParticle(p, dt);
        expect(next.vy).toBeGreaterThan(p.vy);
      }),
      { numRuns: 200 }
    );
  });

  it("drag never increases |vx| — it only shrinks it toward zero", () => {
    fc.assert(
      fc.property(arbParticle, fc.double({ min: 0.001, max: 0.1, noNaN: true }), (p, dt) => {
        const next = stepParticle(p, dt);
        expect(Math.abs(next.vx)).toBeLessThanOrEqual(Math.abs(p.vx) + 1e-9);
      }),
      { numRuns: 200 }
    );
  });

  it("a zero dt is a no-op on velocity/position (only life is untouched too)", () => {
    fc.assert(
      fc.property(arbParticle, (p) => {
        const next = stepParticle(p, 0);
        expect(next.x).toBeCloseTo(p.x);
        expect(next.y).toBeCloseTo(p.y);
        expect(next.vx).toBeCloseTo(p.vx);
        expect(next.vy).toBeCloseTo(p.vy);
        expect(next.life).toBeCloseTo(p.life);
      }),
      { numRuns: 50 }
    );
  });

  it("rotation integrates linearly at the angular velocity", () => {
    const p: Particle = {
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      rotation: 1,
      vr: 4,
      size: 5,
      color: "#000",
      shape: "circle",
      life: 0,
    };
    const next = stepParticle(p, 0.5);
    expect(next.rotation).toBeCloseTo(1 + 4 * 0.5);
  });
});

describe("isSettled + full sim — particles always settle", () => {
  it("falls strictly below the viewport, or times out, within a bounded number of 60fps steps", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1_000_000 }), (seed) => {
        const particles = spawnParticles(24, seed, { origin: { x: 200, y: 100 } });
        const DT = 1 / 60;
        const MAX_STEPS = 60 * 3; // 3s — comfortably past the 2.5s hard cap
        for (const start of particles) {
          let p = start;
          let steps = 0;
          while (!isSettled(p, VIEWPORT_H) && steps < MAX_STEPS) {
            p = stepParticle(p, DT);
            steps++;
          }
          expect(isSettled(p, VIEWPORT_H)).toBe(true);
        }
      }),
      { numRuns: 100 }
    );
  });

  it("a particle sitting motionless at time 0 is not settled (it hasn't fallen or timed out yet)", () => {
    const p: Particle = {
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      rotation: 0,
      vr: 0,
      size: 5,
      color: "#000",
      shape: "circle",
      life: 0,
    };
    expect(isSettled(p, VIEWPORT_H)).toBe(false);
  });

  it("a particle already below the viewport is settled immediately", () => {
    const p: Particle = {
      x: 0,
      y: VIEWPORT_H + 100,
      vx: 0,
      vy: 0,
      rotation: 0,
      vr: 0,
      size: 5,
      color: "#000",
      shape: "circle",
      life: 0,
    };
    expect(isSettled(p, VIEWPORT_H)).toBe(true);
  });

  it("a particle past the hard duration cap is settled even mid-air", () => {
    const p: Particle = {
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      rotation: 0,
      vr: 0,
      size: 5,
      color: "#000",
      shape: "circle",
      life: 3, // past the 2.4s cap
    };
    expect(isSettled(p, VIEWPORT_H)).toBe(true);
  });
});

describe("resolveConfettiMode — reduced-motion branch decision (pure)", () => {
  it("no DOM (SSR) always resolves to none, regardless of motion preference", () => {
    expect(resolveConfettiMode(false, false)).toBe("none");
    expect(resolveConfettiMode(false, true)).toBe("none");
  });

  it("DOM present + no reduced-motion preference resolves to the full burst", () => {
    expect(resolveConfettiMode(true, false)).toBe("full");
  });

  it("DOM present + reduced-motion preference resolves to the static sparkle", () => {
    expect(resolveConfettiMode(true, true)).toBe("reduced");
  });
});

describe("fireConfetti — SSR/no-DOM guard", () => {
  it("is a silent no-op outside the browser (this suite runs in a node environment)", () => {
    expect(() => fireConfetti()).not.toThrow();
    expect(() => fireConfetti({ origin: { x: 10, y: 10 }, count: 30 })).not.toThrow();
  });
});
