/**
 * End-to-end smoke test — the review loop at /review (spec §20.7 scheduler,
 * §22 explainable mastery). D-020's "game-feel audio" layer plays a
 * synthesized Web Audio SFX on every answer here (src/lib/sfx.ts); this test
 * exists to prove that never throws headless.
 *
 * /review's queue is entirely DERIVED (buildReviewQueue in
 * src/lib/engine/scheduler.ts) from real learner evidence — nothing is
 * templated — so rather than replay the full onboarding + lesson flow that
 * scripts/smoke.e2e.mjs already covers end to end, this seeds one concept's
 * worth of evidence directly into the same localStorage key the app itself
 * reads and writes (`ecolingo.learner.v1`, see src/lib/learner-state.ts:62).
 *
 * Why the seeded study plan sets an exam ~2 hours out: buildReviewQueue
 * always computes `dueAt` as `now + intervalDays * DAY`, and every ordinary
 * path floors intervalDays at 1 (see nextIntervalDays in scheduler.ts) — so
 * a freshly-evidenced concept is never actually due "now", only "in >=1
 * day" (upcoming). The ONE path that can land dueAt at "now" is the exam
 * back-planning branch (scheduler.ts ~83-91): when `daysToExam === 0` for an
 * examinable concept, `dueMs = now + max(0, daysToExam-1)*DAY = now`. An
 * exam a couple of hours away reliably yields `daysToExam === 0` regardless
 * of wall-clock time of day (unlike "today" at UTC midnight, which can
 * round either way). This is deliberate: only a `due` item — not an
 * `upcoming` one — renders a "Review now" button in ReviewClient.tsx, so
 * this is required to actually open and complete a review end to end.
 *
 * Walks: seed one evidenced concept (production-function) -> /review shows
 * it in "Due now" with its §22 reason text -> open the review -> answer the
 * same production-function transfer question (q-prod-transfer-1) that
 * smoke.e2e.mjs's mastery-check step exercises, correct option text taken
 * verbatim from src/content/econ13210/index.ts's answerKey so it stays
 * truthful to the content module -> assert the completion state (queue
 * empties, "All caught up!" shown, prevIntervals persisted to localStorage)
 * -> assert zero pageerror/console-error the whole run.
 *
 * NOTE (verified by reading ReviewClient.tsx's handleEvidence): unlike the
 * lesson flow, a CORRECT review answer calls setActive(null) in the very
 * same event handler that flips the question's own `result` state — React
 * batches both, so the "✓ Correct" feedback inside QuestionCard is never
 * actually painted; the UI jumps straight back to the queue. This test
 * asserts that settled end state, not a transient "✓ Correct" flash.
 *
 * Deterministic: no network beyond the local app; every checkpoint prints
 * "✓ <checkpoint>" and the run ends with "REVIEW PASS".
 *
 * Env:
 *   SMOKE_PORT           app port (default 3500)
 *   PLAYWRIGHT_MODULE    playwright ESM entry (sandbox override; else the "playwright" package)
 *   PLAYWRIGHT_CHROMIUM  chromium executablePath (sandbox override; else Playwright's own browser)
 */

import { launchBrowser } from "./lib/launch-browser.mjs";

const PORT = process.env.SMOKE_PORT || "3500";
const BASE = `http://localhost:${PORT}`;

const log = (m) => console.log("✓", m);
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const CONCEPT_SLUG = "production-function";
const CONCEPT_NAME = "Production function (per worker)";
// q-prod-transfer-1 (src/content/econ13210/index.ts): the same
// transferDistance>0 question ReviewClient.questionFor() picks for this
// concept, and the same one smoke.e2e.mjs's mastery-check step answers.
// answerKey.correctOptionId "a" text, verbatim:
const CORRECT_OPTION_SUBSTRING = "each added server contributes less than the one before";

/** Mirrors src/lib/learner-state.ts's LearnerState shape (KEY "ecolingo.learner.v1"). */
function buildSeedState(nowISO) {
  const examInTwoHoursISO = new Date(Date.parse(nowISO) + 2 * 60 * 60 * 1000).toISOString();
  return {
    profile: {
      role: "student",
      objective: "exam",
      explanationOrder: "visual_first",
      readingLevel: "standard",
      onboarded: true,
      mathReadiness: 0.5,
      graphReading: 0.5,
    },
    masteryBySlug: {
      [CONCEPT_SLUG]: {
        conceptSlug: CONCEPT_SLUG,
        conceptual: 0.55,
        procedural: 0.1,
        graphInterpretation: 0.1,
        formulaRecall: 0.1,
        transfer: 0.05,
        confidence: 0.5,
        retentionStrength: 0.475,
        misconceptionProbability: {},
        lastEvidenceAt: nowISO,
        evidenceCount: 1,
      },
    },
    prevIntervals: {},
    // exam ~2h out: the only way buildReviewQueue lands an item in "due"
    // rather than "upcoming" for freshly-seeded evidence (see header).
    plan: { examDateISO: examInTwoHoursISO, minutesPerDay: 20, noStudyDays: [] },
    completedLessonIds: [],
    auditLog: [
      {
        at: nowISO,
        conceptSlug: CONCEPT_SLUG,
        dimensionDeltas: { conceptual: 0.45 },
        signalQuality: 1,
        guessLikelihood: 0,
        correct: true,
      },
    ],
    auditSeq: 1,
    xp: 8,
  };
}

const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } }); // phone-size

// Zero pageerror/console-error across the whole run — Web Audio SFX plays on
// every answer here (src/lib/sfx.ts) and must not throw headless.
const consoleProblems = [];
page.on("pageerror", (err) => consoleProblems.push(`pageerror: ${err.message}`));
page.on("console", (msg) => {
  if (msg.type() === "error") consoleProblems.push(`console.error: ${msg.text()}`);
});

try {
  // ---------- seed one evidenced concept directly into localStorage ----------
  const nowISO = new Date().toISOString();
  await page.goto(`${BASE}/learn`); // establish the app origin before touching localStorage
  await page.evaluate((state) => {
    window.localStorage.setItem("ecolingo.learner.v1", JSON.stringify(state));
  }, buildSeedState(nowISO));
  log(`seeded one evidence event for "${CONCEPT_SLUG}" into ecolingo.learner.v1`);

  // ---------- review queue shows the due item with its §22 reason ----------
  await page.goto(`${BASE}/review`);
  await page.waitForSelector("h2:has-text('Due now')");
  await page.waitForSelector(`li:has-text("${CONCEPT_NAME}")`);
  const reasonText = await page.textContent(`li:has-text("${CONCEPT_NAME}") p.text-app-muted`);
  assert(
    reasonText && reasonText.includes("You're seeing this because"),
    `due item is missing its §22 reason text (got: ${JSON.stringify(reasonText)})`
  );
  log(`due item shows its §22 reason: "${reasonText.trim()}"`);

  // ---------- open the review ----------
  await page.click(`li:has-text("${CONCEPT_NAME}") button:has-text("Review now")`);
  await page.waitForSelector(`h1:has-text("Review: ${CONCEPT_NAME}")`);
  await page.waitForSelector("text=You're seeing this because"); // reasonText repeated in the open view
  log("opened the review for the due item");

  // ---------- answer the question deterministically ----------
  await page.waitForSelector(`label:has-text("${CORRECT_OPTION_SUBSTRING}")`);
  await page.click(`label:has-text("${CORRECT_OPTION_SUBSTRING}")`);
  await page.click("button:has-text('Certain')");
  await page.click("button:has-text('Check')");
  log("answered the transfer question with the content module's correct option");

  // ---------- completion state ----------
  // A correct review answer sets `active` back to null in the same React
  // batch as the QuestionCard's own result state (see header note), so the
  // UI settles directly back on the queue: the concept is filtered out of
  // both due and upcoming, and — since it was the only due item — "All
  // caught up!" appears.
  await page.waitForSelector("text=All caught up!");
  const stillListed = await page.locator(`li:has-text("${CONCEPT_NAME}")`).count();
  assert(stillListed === 0, "reviewed concept is still listed in the queue after completion");
  log('completion state: back at the queue, "All caught up!" shown, concept cleared from the queue');

  const persisted = await page.evaluate(() => {
    const raw = window.localStorage.getItem("ecolingo.learner.v1");
    return raw ? JSON.parse(raw) : null;
  });
  assert(persisted, "learner state missing from localStorage after completing the review");
  assert(
    typeof persisted.prevIntervals?.[CONCEPT_SLUG] === "number",
    `markReviewed did not persist prevIntervals.${CONCEPT_SLUG} (got: ${JSON.stringify(persisted.prevIntervals)})`
  );
  assert(
    persisted.masteryBySlug?.[CONCEPT_SLUG]?.evidenceCount === 2,
    `evidence was not recorded for ${CONCEPT_SLUG} (evidenceCount=${persisted.masteryBySlug?.[CONCEPT_SLUG]?.evidenceCount})`
  );
  log(
    `completion persisted to localStorage: prevIntervals.${CONCEPT_SLUG}=${persisted.prevIntervals[CONCEPT_SLUG]}, evidenceCount=${persisted.masteryBySlug[CONCEPT_SLUG].evidenceCount}`
  );

  // ---------- zero pageerror / console-error throughout ----------
  assert(
    consoleProblems.length === 0,
    `pageerror/console-error occurred during the review loop:\n${consoleProblems.join("\n")}`
  );
  log("zero pageerror/console exceptions throughout (Web Audio SFX did not throw headless)");

  console.log("REVIEW PASS");
  await browser.close();
} catch (err) {
  await page.screenshot({ path: "review-failure.png" }).catch(() => {});
  console.error("REVIEW FAIL:", err && err.message ? err.message : err);
  await browser.close();
  process.exit(1);
}
