/**
 * End-to-end smoke test — the BLANK platform shell (D-022).
 *
 * The app no longer ships a built-in course: teachers compile their materials
 * into a course, students join by code, and every learner surface reads from
 * the enrolled course. Without a backend (CI / sandbox) the app runs in local
 * mode with no course, so this smoke verifies the shell and every learner
 * route renders its honest empty/onboarding state with zero page errors —
 * the demo-course lesson walk it used to do lives on only as an engine unit
 * test now that the content is a fixture, not app content.
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
  // Accounts are mandatory (D-023); CI has no session, so open the auth gate
  // for headless runs (UX-level routing only — RLS still guards all data).
  await page.addInitScript(() => {
    try { localStorage.setItem("eco:e2e-open-gate", "1"); } catch {}
  });
const log = (m) => console.log("✓", m);

const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(String(e.message)));
page.on("console", (m) => {
  if (m.type() !== "error") return;
  // Known environmental degrade: no network to Supabase → local-only mode.
  if (/Failed to fetch|ERR_NAME_NOT_RESOLVED|supabase/i.test(m.text())) return;
  pageErrors.push(`console.error: ${m.text()}`);
});

/** Load a route and wait for its client shell to settle. */
async function visit(path) {
  await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
}

try {
  // ---------- the learner home renders the shell ----------
  await visit("/learn");
  await page.waitForSelector("nav[aria-label='Primary mobile']");
  log("/learn renders the app shell (stat bar + mobile nav)");

  // ---------- onboarding is reachable and course-independent ----------
  await visit("/onboarding");
  await page.getByText("Who are you?").first().waitFor();
  log("/onboarding survey loads (course-independent)");

  // ---------- every learner surface shows an honest empty state ----------
  await visit("/bank");
  await page.waitForSelector('h1:has-text("Question Bank")');
  log("/bank renders (no built-in questions — empty bank)");

  await visit("/review");
  await page.waitForSelector("text=/Nothing to review|caught up|Review/i");
  log("/review renders its empty state");

  await visit("/progress");
  await page.waitForSelector("text=/Your progress|No evidence|not started/i");
  log("/progress renders the trophy room (empty, evidence-driven)");

  await visit("/exam");
  await page.waitForSelector("text=/No exam date|back-planned/i");
  log("/exam renders (no exam date set)");

  // ---------- the teacher entry point exists ----------
  await visit("/teach");
  await page.waitForSelector('h1:has-text("Teacher workspace")');
  log("/teach renders the teacher workspace");

  if (pageErrors.length > 0) {
    throw new Error(`unexpected page/console errors: ${pageErrors.slice(0, 4).join(" | ")}`);
  }
  log("zero unexpected page/console errors across the shell");

  console.log("SMOKE PASS");
  await browser.close();
} catch (err) {
  await page.screenshot({ path: "smoke-failure.png" }).catch(() => {});
  console.error("SMOKE FAIL:", err && err.message ? err.message : err);
  await browser.close();
  process.exit(1);
}
