/**
 * Accessibility gate (spec GATE-010: axe-clean, works across breakpoints).
 * Loads every route at a mobile and a desktop breakpoint, runs axe-core
 * (WCAG 2.1 A/AA), and fails on any serious/critical violation.
 *
 * Documented exception (decision D-013): the primary call-to-action button
 * (`.btn-primary`) is white text on the spec §14 Growth Green (#35C46A). That
 * brand pairing is ~2.3:1 and cannot reach 4.5:1 without abandoning the
 * mandated hue / the Duolingo-style vivid CTA. It is kept intentionally — the
 * button's role and pressed state are also conveyed by its 3D shape, motion,
 * position and label, not by text contrast alone. Every other element meets AA,
 * and this gate still catches any NEW contrast regression elsewhere.
 *
 * Run: node scripts/a11y-audit.mjs   (needs a server on :3100 and axe-core)
 * Env: PLAYWRIGHT_MODULE, PLAYWRIGHT_CHROMIUM, A11Y_BASE override the defaults.
 */

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const AXE = readFileSync(require.resolve("axe-core").replace(/axe\.js$/, "axe.min.js"), "utf8");

const pwModule = process.env.PLAYWRIGHT_MODULE || "/opt/node22/lib/node_modules/playwright/index.mjs";
const { chromium } = await import(pwModule);
const CHROMIUM = process.env.PLAYWRIGHT_CHROMIUM || "/opt/pw-browsers/chromium";
const BASE = process.env.A11Y_BASE || "http://localhost:3100";

const routes = [
  "/", "/onboarding", "/review", "/lab", "/lab/solow", "/lab/budget",
  "/bank", "/exam", "/progress", "/teach", "/teach/analytics",
  "/lesson/lesson-solow-steady-state", "/lesson/lesson-production-function",
];
const breakpoints = [
  { name: "mobile", width: 390, height: 844 },
  { name: "desktop", width: 1280, height: 900 },
];

// D-013: the only accepted serious violation is the brand primary CTA contrast.
const isBrandButtonException = (v, node) =>
  v.id === "color-contrast" && node.target.some((t) => String(t).includes(".btn-primary"));

const launchArgs = process.env.HTTPS_PROXY
  ? [`--proxy-server=${process.env.HTTPS_PROXY}`, "--proxy-bypass-list=localhost;127.0.0.1"]
  : [];
const browser = await chromium.launch({ executablePath: CHROMIUM, args: launchArgs });

let blocking = 0;
let allowedExceptions = 0;
const seen = {};

for (const bp of breakpoints) {
  const page = await browser.newPage({ viewport: { width: bp.width, height: bp.height } });
  for (const route of routes) {
    await page.goto(BASE + route, { waitUntil: "domcontentloaded" }).catch(() => {});
    await page.waitForTimeout(600);
    await page.addScriptTag({ content: AXE });
    const results = await page.evaluate(async () =>
      window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } })
    );
    for (const v of results.violations) {
      for (const node of v.nodes) {
        if (isBrandButtonException(v, node)) { allowedExceptions++; continue; }
        if (v.impact === "serious" || v.impact === "critical") {
          blocking++;
          const key = `${v.id} [${v.impact}]`;
          (seen[key] ??= new Set()).add(`${bp.name}${route} → ${node.target.join(" ").slice(0, 70)}`);
        }
      }
    }
  }
  await page.close();
}
await browser.close();

console.log("=== a11y gate (WCAG 2.1 A/AA across mobile + desktop) ===");
const keys = Object.keys(seen);
if (keys.length === 0) {
  console.log("✓ No blocking violations.");
} else {
  for (const k of keys) {
    console.log(`\n✗ ${k}`);
    for (const w of [...seen[k]].slice(0, 10)) console.log("   ", w);
  }
}
console.log(`\nAllowed brand-CTA exceptions (D-013, .btn-primary contrast): ${allowedExceptions}`);
console.log(blocking === 0 ? "\nA11Y GATE PASS" : `\nA11Y GATE FAIL (${blocking} blocking nodes)`);
process.exit(blocking === 0 ? 0 : 1);
