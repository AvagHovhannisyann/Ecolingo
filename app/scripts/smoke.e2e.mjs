/**
 * End-to-end smoke test — the full learner loop with the World-2 gating order
 * production-function → steady-state → golden-rule (MOAT-02).
 *
 * Walks: onboarding → the new production-function lesson (all six steps incl.
 * the A-slider visual target, guided practice, and the transfer mastery check)
 * → the steady-state lesson unlocks and is completed → the Golden Rule lesson
 * unlocks → the review queue shows an explainable reason → the Question Bank
 * lists the new production-function questions.
 *
 * Deterministic: no network beyond the local app; every checkpoint prints
 * "✓ <checkpoint>" and the run ends with "SMOKE PASS".
 *
 * Env:
 *   SMOKE_PORT           app port (default 3200 locally; the main tree uses 3100)
 *   PLAYWRIGHT_MODULE    playwright ESM entry (default the sandbox install)
 *   PLAYWRIGHT_CHROMIUM  chromium executablePath (default the sandbox browser)
 */

import { launchBrowser } from "./lib/launch-browser.mjs";

const PORT = process.env.SMOKE_PORT || "3200";
const BASE = `http://localhost:${PORT}`;

const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } }); // phone-size
const log = (m) => console.log("✓", m);

/** Walk one question card: pick the option label, rate confidence, check, expect correct. */
async function answerCorrect(optionSubstring, confidence = "Fairly sure") {
  await page.click(`label:has-text(${JSON.stringify(optionSubstring)})`);
  await page.click(`button:has-text(${JSON.stringify(confidence)})`);
  await page.click("button:has-text('Check')");
  await page.waitForSelector("text=✓ Correct");
}

try {
  // ---------- onboarding (spec §7) ----------
  await page.goto(`${BASE}/`);
  await page.waitForSelector("text=Personalize your path");
  log("home shows onboarding invitation for new learners");
  await page.click("text=Personalize your path");
  await page.waitForSelector("text=Who are you?");
  await page.click("button:has-text('Student')");
  await page.click("button:has-text('Continue')");
  await page.waitForSelector("text=What brings you here?");
  await page.click("button:has-text('Prepare for an exam')");
  await page.click("button:has-text('Continue')");
  await page.waitForSelector("text=How much time do you have?");
  await page.click("button:has-text('Skip for now')");
  await page.waitForSelector("text=A 2-minute check-in");
  await page.fill('input[inputmode="decimal"]', "3");
  await page.click("button:has-text('Fairly sure')");
  await page.click("button:has-text('Next')");
  await page.fill('input[inputmode="decimal"]', "10%"); // wrong-while-certain → calibration note
  await page.click("button:has-text('Certain')");
  await page.click("button:has-text('Next')");
  await page.waitForSelector("text=which curve is higher");
  await page.click("button:has-text('The curved solid line')");
  await page.click("button:has-text('Unsure')");
  await page.click("button:has-text('Next')");
  await page.click("button:has-text('Right (to a higher k)')");
  await page.click("button:has-text('Fairly sure')");
  await page.click("button:has-text('Finish diagnostic')");
  await page.waitForSelector("text=How do you like ideas explained?");
  await page.click("button:has-text('Start learning')");
  await page.waitForSelector("text=Today");
  log("onboarding completes and lands on today's plan");

  // ---------- gating order: production-function is the first unlocked lesson ----------
  await page.waitForSelector("text=The production function and diminishing returns");
  await page.waitForSelector("text=Unlocks after: Steady state"); // Golden Rule still gated
  log("gating order production-function → steady-state → golden-rule (MOAT-02)");

  // ---------- production-function lesson: full six-step loop ----------
  await page.click("text=The production function and diminishing returns");
  await page.waitForSelector("text=Core idea");
  log("production-function lesson opens at step 1 (core idea)");
  await page.click("button:has-text('Continue')");
  await page.waitForSelector("text=Intuition");
  await page.click("button:has-text('Continue')");
  await page.waitForSelector("text=See it move");
  const pfContinue = page.locator("button:has-text('Continue')");
  if (!(await pfContinue.isDisabled())) throw new Error("visual step should gate on the A target");
  // sliders in order: probe(0), s(1), n(2), delta(3), alpha(4), A(5)
  await page.locator('input[type="range"]').nth(5).fill("1.5");
  await page.waitForSelector("text=You raised productivity");
  log("visual step: deterministic A ≥ 1.5 target hit via the productivity slider");
  await pfContinue.click();
  await page.waitForSelector("text=The mathematics");
  await page.click("button:has-text('Continue')");
  await page.waitForSelector("text=Guided practice");
  await answerCorrect("adds less output than the one before");
  log("guided practice correct on diminishing marginal product");
  await page.click("button:has-text('Continue')");
  await page.waitForSelector("text=Mastery check");
  await answerCorrect("each added server contributes less", "Certain");
  log("mastery check: diminishing-returns transfer to a new context");
  await page.click("button:has-text('Continue')");
  await page.waitForSelector("text=Lesson complete");
  log("production-function lesson complete with mastery summary");

  // ---------- steady-state unlocks, then complete it ----------
  await page.goto(`${BASE}/`);
  await page.waitForSelector('a[href*="lesson-solow-steady-state"]');
  log("steady-state lesson unlocked by production-function mastery evidence");
  await page.click("text=The Solow steady state");
  await page.waitForSelector("text=Core idea");
  await page.click("button:has-text('Continue')");
  await page.waitForSelector("text=Intuition");
  await page.click("button:has-text('Continue')");
  await page.waitForSelector("text=See it move");
  await page.locator('input[type="range"]').nth(1).fill("0.5"); // s slider
  await page.waitForSelector("text=Target reached");
  await page.click("button:has-text('Continue')");
  await page.waitForSelector("text=The mathematics");
  await page.click("button:has-text('Continue')");
  await page.waitForSelector("text=Guided practice");
  await answerCorrect("Nothing — the break-even line");
  await page.click("button:has-text('Continue')");
  await page.waitForSelector("text=Mastery check");
  await answerCorrect("Temporarily faster growth");
  await page.click("button:has-text('Continue')");
  await page.waitForSelector("text=Lesson complete");
  log("steady-state lesson complete");

  // ---------- golden-rule unlocks ----------
  await page.goto(`${BASE}/`);
  await page.waitForSelector('a[href*="lesson-golden-rule"]');
  log("Golden Rule lesson unlocked by steady-state mastery evidence");

  // ---------- review queue shows an explainable reason ----------
  await page.goto(`${BASE}/review`);
  await page.waitForSelector("text=You're seeing this because");
  log("review queue shows an explainable reason (§22)");

  // ---------- question bank lists the new production-function questions ----------
  await page.goto(`${BASE}/bank`);
  await page.waitForSelector('h1:has-text("Question Bank")');
  await page.waitForSelector("text=Production function (per worker)");
  await page.waitForSelector("text=In the production function");
  log("Question Bank groups the new production-function questions by concept");

  console.log("SMOKE PASS");
  await browser.close();
} catch (err) {
  await page.screenshot({ path: "smoke-failure.png" }).catch(() => {});
  console.error("SMOKE FAIL:", err && err.message ? err.message : err);
  await browser.close();
  process.exit(1);
}
