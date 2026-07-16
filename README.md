# Ecolingo

**hard ideas. made intuitive.**

An AI course compiler that turns a teacher's materials into a personalized, visual, game-like learning path. First course: **ECON 13210 — Introduction to Macroeconomic Models** (a proving ground, not a permanent limitation).

Core loop: teacher materials → concept map → personalized lessons → adaptive practice → mastery data → better next lesson.

## Repository layout

| Path | Contents |
|---|---|
| `docs/` | Programme documentation: execution summary & decision log, requirement coverage matrix (216/216 backlog items), PRD, data model + RLS, AI orchestration, testing strategy & quality gates, roadmap, risk register |
| `scripts/` | `generate-coverage-matrix.mjs` — regenerates the coverage matrix from the canonical backlog |
| `app/` | Next.js + TypeScript vertical slice (see below) |

## The vertical slice (`app/`)

One complete learning loop, prioritized per the delivery contract:

**lesson (six-step anatomy) → interactive Solow Lab → practice (deterministic scoring + misconception mapping) → feedback (grounded Explain panel) → mastery update (multi-dimensional, audited) → scheduled review (explainable reasons, exam back-planning)**

- All truth-critical behaviour is deterministic and unit-tested (`src/lib/engine/`): Solow/budget/Euler model math, answer equivalence (equivalent answers are never marked wrong), scoring, mastery, scheduling. The TEST-ECON acceptance subset is automated.
- The Explain button runs a deterministic grounded provider behind the same interface a live tutor agent implements in Phase 3 — citations are never invented; unverified content is clearly flagged.
- Course-world and celebration artwork is Higgsfield-generated in the spec's approved decorative slots (provenance in `app/public/ASSETS.md`); every graph and equation is rendered in code, never generated as an image.
- Visual design (identity, mascot, motion) is **delegated to Fabel** per project rules; the slice ships a functional, accessible shell (keyboard-operable lab, MathML equations, reduced-motion safe, ≥48px touch targets).

### Run it

```bash
cd app
npm install
npm run dev        # http://localhost:3000
npx vitest run     # engine test suite (70 tests, incl. TEST-ECON-001..008/015)
npm run build      # production build
```

## Content provenance

No teacher materials have been ingested yet, so the demo course content is compiled from the product specification's canonical equations and is marked **planned & unverified** throughout the product. Real page-level citations attach during Phase 2 ingestion. See `docs/00-execution-summary.md` §3.
