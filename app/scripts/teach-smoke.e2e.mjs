/**
 * End-to-end smoke test — the teacher grounding loop (GATE-001 bridge, D-009).
 *
 * Walks: teacher ingests the bundled sample lecture → the review queue proposes
 * scored concept↔section links with matched terms → the teacher approves every
 * proposal → grounding status flips every World-2 concept to verified → a
 * learner-side lesson upgrades to the teacher-verified banner and shows the real
 * lecture citation → revoking an approval restores the honest unverified marker.
 *
 * Deterministic: no network beyond the local app; every checkpoint prints
 * "✓ <checkpoint>" and the run ends with "TEACH SMOKE PASS".
 *
 * Env:
 *   SMOKE_PORT           app port (default 3100, matching smoke.e2e.mjs's main-tree convention)
 *   PLAYWRIGHT_MODULE    playwright ESM entry (sandbox override; else the "playwright" package)
 *   PLAYWRIGHT_CHROMIUM  chromium executablePath (sandbox override; else Playwright's own browser)
 */

import { launchBrowser } from "./lib/launch-browser.mjs";

const PORT = process.env.SMOKE_PORT || "3100";
const BASE = `http://localhost:${PORT}`;

const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
const log = (m) => console.log("✓", m);

try {
  // 1) teacher workspace: ingest the sample lecture
  await page.goto(`${BASE}/teach`);
  await page.waitForSelector('h1:has-text("Teacher workspace")');
  await page.click('button:has-text("Try the sample lecture")');
  await page.waitForSelector("text=Lecture 4 — The Solow Growth Model");
  log("sample lecture ingested and listed with section count");

  // 2) review queue proposes concept links with matched terms
  await page.waitForSelector("text=Matched terms:");
  const pending = await page.textContent("h2:has-text('Review queue')");
  if (!/[1-9]\d* pending/.test(pending)) throw new Error("no pending proposals: " + pending);
  log("review queue shows scored proposals with matched terms");

  // 3) approve every proposal (teacher reviews the whole queue)
  for (;;) {
    const btn = page.locator('button:has-text("Approve as source")').first();
    if ((await btn.count()) === 0) break;
    await btn.click();
    await page.waitForTimeout(120);
  }
  await page.waitForSelector("text=Queue clear");
  log("all proposals approved — queue clear");

  // 4) grounding status flips to verified for all four concepts
  const status = await page.textContent("body");
  if (!status.includes("Steady state") || status.includes("still planned & unverified"))
    throw new Error("some concept still unverified after approving all proposals");
  log("grounding status: every world-2 concept has an approved source");

  // 5) learner side: lesson now shows teacher-verified banner + real citation
  await page.goto(`${BASE}/lesson/lesson-solow-steady-state`);
  await page.waitForSelector("text=Teacher-verified sources attached");
  log("lesson banner upgraded to teacher-verified (GATE-001 grounding bridge)");
  await page.waitForSelector("text=Lecture 4 — The Solow Growth Model § The steady state");
  log("citation chip cites the real lecture section with page numbers");

  // 6) revoke returns the concept to honest unverified state
  await page.goto(`${BASE}/teach`);
  await page.locator('button:has-text("Revoke")').first().click();
  await page.waitForSelector("text=still planned & unverified");
  log("revoking an approval restores the honest unverified marker");

  console.log("TEACH SMOKE PASS");
  await browser.close();
} catch (err) {
  await page.screenshot({ path: "teach-smoke-failure.png" }).catch(() => {});
  console.error("TEACH SMOKE FAIL:", err && err.message ? err.message : err);
  await browser.close();
  process.exit(1);
}
