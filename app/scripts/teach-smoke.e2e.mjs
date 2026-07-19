/**
 * End-to-end smoke test — the teacher workspace (D-022).
 *
 * The teacher experience is now the course COMPILER: upload/paste materials →
 * the AI drafts a course plan → the teacher clarifies, reviews the sanitized
 * plan, and ratifies it (GATE-001), which binds it to a real course with a
 * join code. This smoke verifies the workspace loads, material ingestion still
 * works (sectionize is content-independent), and the compiler entry point is
 * reachable. Without a backend the compile call itself degrades honestly
 * (503), which the UI surfaces — not exercised here.
 *
 * Env:
 *   SMOKE_PORT           app port (default 3100)
 *   PLAYWRIGHT_MODULE    playwright ESM entry (sandbox override)
 *   PLAYWRIGHT_CHROMIUM  chromium executablePath (sandbox override)
 */

import { launchBrowser } from "./lib/launch-browser.mjs";

const PORT = process.env.SMOKE_PORT || "3100";
const BASE = `http://localhost:${PORT}`;

const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
const log = (m) => console.log("✓", m);

try {
  // 1) teacher workspace loads
  await page.goto(`${BASE}/teach`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('h1:has-text("Teacher workspace")');
  log("teacher workspace loads");

  // 2) material ingestion still works (content-independent sectionize)
  await page.click('button:has-text("Try the sample lecture")');
  await page.waitForSelector("text=Lecture 4 — The Solow Growth Model");
  log("sample material ingests and lists its sections");

  // 3) the course compiler entry point is reachable
  await page.goto(`${BASE}/teach/compile`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  await page.waitForSelector("text=/Compile|course plan|your material/i");
  log("course compiler page loads");

  console.log("TEACH SMOKE PASS");
  await browser.close();
} catch (err) {
  await page.screenshot({ path: "teach-smoke-failure.png" }).catch(() => {});
  console.error("TEACH SMOKE FAIL:", err && err.message ? err.message : err);
  await browser.close();
  process.exit(1);
}
