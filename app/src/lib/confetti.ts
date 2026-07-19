/**
 * Celebration confetti/burst system (D-020: "the app should feel like a
 * game" — the dopamine layer for lesson completions, quest claims, and
 * streak milestones).
 *
 * Mirrors the house pattern set by src/lib/sfx.ts:
 * - SSR/test-safe: fireConfetti no-ops without window/document.
 * - Reduced-motion-aware: NOT a smaller/slower burst — a single subtle
 *   static sparkle that only fades (opacity), never moves.
 * - Failure is silent (GATE-009 spirit): celebration must never break the app.
 * - No dependencies: raw Canvas 2D + requestAnimationFrame, cleaned up on
 *   visibilitychange so a backgrounded tab never leaves a stray rAF loop.
 * - Total animation stays under 2.5s and the canvas is removed once every
 *   particle has settled (or the reduced-motion fade completes).
 *
 * The physics (`spawnParticles`, `stepParticle`, `isSettled`) and the
 * reduced-motion branch decision (`resolveConfettiMode`) are pure and
 * exported for unit/property testing; only `fireConfetti` touches the DOM.
 */

export type ParticleShape = "rect" | "circle";

export type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  /** angular velocity, radians/sec */
  vr: number;
  size: number;
  color: string;
  shape: ParticleShape;
  /** seconds elapsed since spawn */
  life: number;
};

export type ConfettiOptions = {
  origin?: { x: number; y: number };
  count?: number;
  palette?: string[];
};

/** Brand palette (globals.css §Duolingo accent ramp) — the default confetti colors. */
export const DEFAULT_PALETTE = ["#58cc02", "#1cb0f6", "#ffc800", "#ff4b4b", "#2fc7c9"];

const GRAVITY = 1400; // px/s^2 — snappy, not floaty
const DRAG_PER_SEC = 0.6; // fraction of horizontal speed shed per second
const MAX_DURATION_S = 2.4; // hard cap, keeps the whole show under the 2.5s rule
const REDUCED_FADE_MS = 700;
const SETTLE_MARGIN_PX = 24;

// ---------------------------------------------------------------------------
// Pure helpers (exported for tests)
// ---------------------------------------------------------------------------

/** Deterministic PRNG (mulberry32) — same seed always yields the same stream. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function rand() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Seeded, deterministic particle spawn — a fan of initial velocities biased
 * upward (classic "burst" cone), varied speed/size/rotation/shape/color.
 * Same (count, seed, origin, palette) always produces the same particles.
 */
export function spawnParticles(
  count: number,
  seed: number,
  opts?: { origin?: { x: number; y: number }; palette?: string[] }
): Particle[] {
  const rand = mulberry32(seed);
  const palette = opts?.palette && opts.palette.length > 0 ? opts.palette : DEFAULT_PALETTE;
  const origin = opts?.origin ?? { x: 0, y: 0 };
  const n = Math.max(0, Math.floor(count));
  const particles: Particle[] = [];
  for (let i = 0; i < n; i++) {
    // fan spans ~200deg centered straight up (-90deg), so the burst reads as
    // "up and outward" rather than a uniform circle.
    const angle = -Math.PI / 2 + (rand() - 0.5) * ((200 * Math.PI) / 180);
    const speed = 180 + rand() * 260;
    particles.push({
      x: origin.x,
      y: origin.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      rotation: rand() * Math.PI * 2,
      vr: (rand() - 0.5) * 12,
      size: 4 + rand() * 5,
      color: palette[Math.floor(rand() * palette.length)],
      shape: rand() > 0.5 ? "rect" : "circle",
      life: 0,
    });
  }
  return particles;
}

/**
 * Pure physics step (semi-implicit Euler): gravity pulls vy down every step
 * (monotonically increasing, unaffected by drag), drag exponentially decays
 * |vx| toward zero, rotation integrates at constant angular velocity.
 */
export function stepParticle(p: Particle, dt: number): Particle {
  const d = Math.max(0, dt);
  const vy = p.vy + GRAVITY * d;
  // exponential decay: always < 1 for d > 0, so |vx| strictly shrinks.
  const dragFactor = Math.exp(-DRAG_PER_SEC * d);
  const vx = p.vx * dragFactor;
  return {
    ...p,
    x: p.x + vx * d,
    y: p.y + vy * d,
    vx,
    vy,
    rotation: p.rotation + p.vr * d,
    life: p.life + d,
  };
}

/**
 * A particle is settled once it has fallen past the viewport (plus a small
 * margin so it's fully offscreen, not just clipped) or once it has been
 * alive past the hard duration cap — whichever comes first. The cap exists
 * so a stray near-weightless particle can never keep the canvas alive past
 * the <2.5s rule.
 */
export function isSettled(p: Particle, viewportH: number): boolean {
  return p.y > viewportH + SETTLE_MARGIN_PX || p.life > MAX_DURATION_S;
}

export type ConfettiMode = "full" | "reduced" | "none";

/**
 * Pure decision function: given whether a DOM is available and whether the
 * visitor prefers reduced motion, which rendering branch should fire?
 * Extracted so the branch selection is testable without mocking window.
 */
export function resolveConfettiMode(hasDom: boolean, prefersReducedMotion: boolean): ConfettiMode {
  if (!hasDom) return "none";
  return prefersReducedMotion ? "reduced" : "full";
}

/** Reads the live media query; isolated so `resolveConfettiMode` stays pure. */
function readPrefersReducedMotion(win: Window): boolean {
  try {
    return win.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// DOM rendering (impure — everything below this line touches window/document)
// ---------------------------------------------------------------------------

function drawParticle(ctx: CanvasRenderingContext2D, p: Particle): void {
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.rotation);
  ctx.fillStyle = p.color;
  if (p.shape === "circle") {
    ctx.beginPath();
    ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.66);
  }
  ctx.restore();
}

function drawSparkle(
  ctx: CanvasRenderingContext2D,
  origin: { x: number; y: number },
  palette: string[],
  alpha: number
): void {
  const dots = [
    { dx: 0, dy: 0, r: 6 },
    { dx: -16, dy: -10, r: 3 },
    { dx: 15, dy: -8, r: 3 },
    { dx: -9, dy: 13, r: 2.5 },
    { dx: 11, dy: 12, r: 2.5 },
    { dx: 0, dy: -20, r: 2.5 },
  ];
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  dots.forEach((d, i) => {
    ctx.fillStyle = palette[i % palette.length];
    ctx.beginPath();
    ctx.arc(origin.x + d.dx, origin.y + d.dy, d.r, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();
}

function makeCanvas(doc: Document, win: Window): HTMLCanvasElement {
  const canvas = doc.createElement("canvas");
  const dpr = win.devicePixelRatio || 1;
  canvas.width = win.innerWidth * dpr;
  canvas.height = win.innerHeight * dpr;
  canvas.style.position = "fixed";
  canvas.style.inset = "0";
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.pointerEvents = "none";
  canvas.style.zIndex = "2147483647";
  // decorative-only: never announced, never focusable, never blocks input.
  canvas.setAttribute("aria-hidden", "true");
  return canvas;
}

/**
 * Fires a confetti/sparkle burst. Fire-and-forget, safe to call from any
 * client event handler:
 * - no-ops on the server (no window/document)
 * - no-ops silently if canvas 2D is unavailable or anything throws
 * - honors prefers-reduced-motion with a static fading sparkle, not a burst
 * - self-removes its canvas once settled, and on tab visibilitychange
 */
export function fireConfetti(opts?: ConfettiOptions): void {
  try {
    if (typeof window === "undefined" || typeof document === "undefined") return;
    const win = window;
    const doc = document;
    const reduced = readPrefersReducedMotion(win);
    const mode = resolveConfettiMode(true, reduced);
    if (mode === "none") return;

    const canvas = makeCanvas(doc, win);
    const dpr = win.devicePixelRatio || 1;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    doc.body.appendChild(canvas);
    ctx.scale(dpr, dpr);

    const viewportW = win.innerWidth;
    const viewportH = win.innerHeight;
    const origin = opts?.origin ?? { x: viewportW / 2, y: viewportH / 2 };
    const palette = opts?.palette && opts.palette.length > 0 ? opts.palette : DEFAULT_PALETTE;

    let rafId = 0;
    let removed = false;
    const cleanup = () => {
      if (removed) return;
      removed = true;
      if (rafId) win.cancelAnimationFrame(rafId);
      doc.removeEventListener("visibilitychange", onVisibility);
      canvas.remove();
    };
    const onVisibility = () => {
      if (doc.hidden) cleanup();
    };
    doc.addEventListener("visibilitychange", onVisibility);

    if (mode === "reduced") {
      const start = win.performance?.now?.() ?? Date.now();
      const frame = (t: number) => {
        const elapsed = t - start;
        const alpha = 1 - elapsed / REDUCED_FADE_MS;
        ctx.clearRect(0, 0, viewportW, viewportH);
        if (alpha <= 0) {
          cleanup();
          return;
        }
        drawSparkle(ctx, origin, palette, alpha);
        rafId = win.requestAnimationFrame(frame);
      };
      rafId = win.requestAnimationFrame(frame);
      return;
    }

    // full burst
    const count = Math.max(1, Math.min(Math.floor(opts?.count ?? 120), 400));
    const seed = (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
    let particles = spawnParticles(count, seed, { origin, palette });
    let lastT: number | null = null;

    const frame = (t: number) => {
      if (lastT === null) lastT = t;
      const dt = Math.min((t - lastT) / 1000, 1 / 30);
      lastT = t;
      ctx.clearRect(0, 0, viewportW, viewportH);
      let allSettled = true;
      particles = particles.map((p) => {
        const next = stepParticle(p, dt);
        if (!isSettled(next, viewportH)) {
          allSettled = false;
          drawParticle(ctx, next);
        }
        return next;
      });
      if (allSettled) {
        cleanup();
        return;
      }
      rafId = win.requestAnimationFrame(frame);
    };
    rafId = win.requestAnimationFrame(frame);
  } catch {
    /* celebration must never break the app */
  }
}
