/**
 * End-to-end gate — mandatory accounts (D-023).
 *
 * A signed-out visitor must never see an app surface: /learn and (especially)
 * /teach — which carries course join codes — must bounce to /auth. The
 * landing page and /auth itself stay public. With the e2e bypass flag set
 * (the same one the other gates use, since CI has no real session) the
 * gated surfaces render again — proving the flag is what opens them, not a
 * hole in the gate.
 *
 * Env: SMOKE_PORT, PLAYWRIGHT_MODULE, PLAYWRIGHT_CHROMIUM (as the other gates).
 */

import { launchBrowser } from "./lib/launch-browser.mjs";

const PORT = process.env.SMOKE_PORT || "3100";
const BASE = `http://localhost:${PORT}`;

const browser = await launchBrowser();
const log = (m) => console.log("✓", m);

try {
  // ---------- signed out: app surfaces bounce to /auth ----------
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

  for (const route of ["/learn", "/teach", "/progress", "/teach/compile"]) {
    await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded" });
    await page.waitForURL((url) => new URL(url).pathname === "/auth", { timeout: 15000 });
    log(`${route} redirects a signed-out visitor to /auth`);
  }

  // ---------- public routes stay public ----------
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  if (new URL(page.url()).pathname !== "/") throw new Error("landing page redirected unexpectedly");
  log("/ (landing) stays public");

  await page.goto(`${BASE}/auth`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("text=Log in");
  log("/auth renders the login screen");
  await page.close();

  // ---------- with the e2e flag, gated surfaces render ----------
  const open = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await open.addInitScript(() => {
    try { localStorage.setItem("eco:e2e-open-gate", "1"); } catch {}
  });
  await open.goto(`${BASE}/learn`, { waitUntil: "domcontentloaded" });
  await open.waitForSelector("nav[aria-label='Primary mobile']");
  await open.waitForTimeout(1000);
  if (new URL(open.url()).pathname !== "/learn") throw new Error("bypass flag did not open /learn");
  log("e2e bypass flag opens /learn for the other gates");

  console.log("AUTH GATE PASS");
  await browser.close();
} catch (err) {
  console.error("AUTH GATE FAIL:", err && err.message ? err.message : err);
  await browser.close();
  process.exit(1);
}
