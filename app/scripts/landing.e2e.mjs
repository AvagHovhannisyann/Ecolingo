/**
 * End-to-end smoke test — the marketing landing page at `/` (D-020 shell
 * restructure: `/` moved to the LIGHT marketing landing; the learner home
 * moved to `/learn`).
 *
 * `/` shares the same root layout.tsx as every dark app page — a fixed left
 * <aside> icon rail, a fixed top <header> stat strip, and a fixed bottom
 * <nav aria-label="Primary mobile"> tab bar — but it must render as a wholly
 * separate, full-bleed LIGHT surface. landing.css does this by scoping every
 * rule under `.landing` and neutralising the three inherited chrome elements
 * via `body:has(.landing) > aside/header/nav[...] { display: none }`.
 *
 * THIS IS THE REGRESSION THAT BIT US ONCE: the sidebar's own Tailwind class
 * is `hidden ... min-[880px]:flex`, so it is already display:none below
 * 880px regardless of landing.css — testing chrome-neutralisation at a
 * phone-width viewport would pass even if landing.css's override silently
 * broke. So the chrome check below runs at a DESKTOP-width viewport (the
 * only width where the sidebar's own responsive rule would otherwise show
 * it), and the mobile-tab-bar check separately runs at 390px (the width
 * where ITS own `min-[880px]:hidden` rule would otherwise show it — the
 * opposite convention). Each check is only meaningful at the viewport where
 * the shell would show that element by default.
 *
 * Walks: hero h1 renders → app chrome (aside/header) is neutralised at
 * desktop width → GET STARTED → /onboarding, I ALREADY HAVE AN ACCOUNT →
 * /learn, wordmark → / → at 390px the mobile tab bar is neutralised too and
 * the page has no horizontal overflow.
 *
 * Deterministic: no network beyond the local app; every checkpoint prints
 * "✓ <checkpoint>" and the run ends with "LANDING PASS".
 *
 * Env:
 *   SMOKE_PORT           app port (default 3200)
 *   PLAYWRIGHT_MODULE    playwright ESM entry (sandbox override; else the "playwright" package)
 *   PLAYWRIGHT_CHROMIUM  chromium executablePath (sandbox override; else Playwright's own browser)
 */

import { launchBrowser } from "./lib/launch-browser.mjs";

const PORT = process.env.SMOKE_PORT || "3200";
const BASE = `http://localhost:${PORT}`;

const log = (m) => console.log("✓", m);
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}
const pathOf = (url) => new URL(url).pathname;

const browser = await launchBrowser();
// Desktop-width viewport: the only width at which the sidebar's own
// `min-[880px]:flex` would show it, so the width that actually exercises
// landing.css's neutralisation instead of passing trivially.
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

try {
  // ---------- hero ----------
  await page.goto(`${BASE}/`);
  await page.waitForSelector("h1#hero-heading");
  const heroText = (await page.textContent("h1#hero-heading"))?.trim();
  assert(
    heroText === "hard ideas. made intuitive.",
    `hero h1 text mismatch: ${JSON.stringify(heroText)}`
  );
  log('hero h1 reads "hard ideas. made intuitive."');

  // ---------- app chrome neutralised (the regression) ----------
  const asideDisplay = await page
    .locator("body > aside")
    .evaluate((el) => getComputedStyle(el).display);
  const headerDisplay = await page
    .locator("body > header")
    .evaluate((el) => getComputedStyle(el).display);
  assert(
    asideDisplay === "none",
    `sidebar <aside> is not neutralised on the landing page (computed display=${asideDisplay})`
  );
  assert(
    headerDisplay === "none",
    `stat-bar <header> is not neutralised on the landing page (computed display=${headerDisplay})`
  );
  log(
    `app chrome neutralised at desktop width: fixed sidebar <aside> (display=${asideDisplay}) and stat-bar <header> (display=${headerDisplay})`
  );

  // ---------- primary CTA: Get started -> /onboarding ----------
  await page.goto(`${BASE}/`);
  await page.locator('a:has-text("Get started")').first().click();
  await page.waitForURL((url) => pathOf(url) === "/onboarding");
  await page.waitForSelector("text=Who are you?");
  log("GET STARTED navigates to /onboarding");

  // ---------- secondary CTA: I already have an account -> /auth (D-022) ----------
  await page.goto(`${BASE}/`);
  await page.locator('a:has-text("I already have an account")').first().click();
  await page.waitForURL((url) => pathOf(url) === "/auth");
  log("I ALREADY HAVE AN ACCOUNT navigates to /auth");

  // ---------- wordmark -> / ----------
  await page.goto(`${BASE}/`);
  await page.locator("a.l-wordmark").click();
  await page.waitForURL((url) => pathOf(url) === "/");
  await page.waitForSelector("h1#hero-heading");
  log("wordmark navigates back to /");

  // ---------- mobile: tab bar hidden + no horizontal overflow @ 390px ----------
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE}/`);
  await page.waitForSelector("h1#hero-heading");
  const tabBarDisplay = await page
    .locator('nav[aria-label="Primary mobile"]')
    .evaluate((el) => getComputedStyle(el).display);
  assert(
    tabBarDisplay === "none",
    `mobile tab bar is not neutralised on the landing page at 390px (computed display=${tabBarDisplay})`
  );
  log(`mobile tab bar hidden on / at 390px (display=${tabBarDisplay})`);

  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  assert(
    overflow.scrollWidth <= overflow.innerWidth,
    `horizontal overflow at 390px (scrollWidth=${overflow.scrollWidth} > innerWidth=${overflow.innerWidth})`
  );
  log(`no horizontal overflow at 390px (scrollWidth=${overflow.scrollWidth} <= innerWidth=${overflow.innerWidth})`);

  console.log("LANDING PASS");
  await browser.close();
} catch (err) {
  await page.screenshot({ path: "landing-failure.png" }).catch(() => {});
  console.error("LANDING FAIL:", err && err.message ? err.message : err);
  await browser.close();
  process.exit(1);
}
