/**
 * End-to-end gate — the review surface (D-022 blank platform).
 *
 * With no built-in course, a fresh learner has nothing scheduled, so /review
 * shows its honest "nothing to review yet" state. This gate proves the review
 * page renders that state cleanly and throws no page/console errors (Web Audio
 * SFX must not crash headless). The full review LOOP is exercised by the
 * scheduler engine unit tests against the course fixture.
 *
 * Env: SMOKE_PORT, PLAYWRIGHT_MODULE, PLAYWRIGHT_CHROMIUM (as the other gates).
 */

import { launchBrowser } from "./lib/launch-browser.mjs";

const PORT = process.env.SMOKE_PORT || "3200";
const BASE = `http://localhost:${PORT}`;

const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  // Accounts are mandatory (D-023); CI has no session, so open the auth gate
  // for headless runs (UX-level routing only — RLS still guards all data).
  await page.addInitScript(() => {
    try { localStorage.setItem("eco:e2e-open-gate", "1"); } catch {}
  });
const log = (m) => console.log("✓", m);

const problems = [];
page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
page.on("console", (m) => {
  if (m.type() !== "error") return;
  if (/Failed to fetch|ERR_NAME_NOT_RESOLVED|supabase/i.test(m.text())) return;
  problems.push(`console.error: ${m.text()}`);
});

try {
  await page.goto(`${BASE}/review`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  await page.getByText(/Nothing to review|caught up/i).first().waitFor();
  log("/review shows the empty 'nothing to review' state");

  if (problems.length > 0) throw new Error(problems.slice(0, 4).join(" | "));
  log("zero page/console exceptions on the review surface");

  console.log("REVIEW PASS");
  await browser.close();
} catch (err) {
  console.error("REVIEW FAIL:", err && err.message ? err.message : err);
  await browser.close();
  process.exit(1);
}
