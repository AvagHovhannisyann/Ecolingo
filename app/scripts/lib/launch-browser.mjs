/**
 * Shared, environment-aware Playwright launcher for the e2e / a11y gates.
 *
 * Portability seam (Phase 7 CI hardening, decision D-016): the audit and smoke
 * scripts historically hard-coded sandbox-only paths and a sandbox-only proxy.
 * Those defaults do not exist on a GitHub-hosted runner. This helper centralizes
 * the env-override pattern so the SAME scripts run in two environments:
 *
 *   - In THIS sandbox, with the env vars set, behaviour is identical to before:
 *       PLAYWRIGHT_MODULE   → dynamic import() of that absolute playwright entry
 *       PLAYWRIGHT_CHROMIUM → passed as executablePath (the pre-installed browser)
 *       HTTPS_PROXY         → the proxy launch args (so chromium reaches localhost)
 *
 *   - On a clean CI runner, with none set, behaviour is the plain default:
 *       import the "playwright" npm package (a real devDependency now),
 *       no executablePath (Playwright resolves its own installed browser via
 *       `npx playwright install --with-deps chromium`), and no proxy args.
 *
 * @param {object} [options]
 * @param {object} [options.launchOptions] extra options merged into chromium.launch()
 * @returns {Promise<import('playwright').Browser>} the launched browser
 */
export async function launchBrowser({ launchOptions = {} } = {}) {
  const pwModule = process.env.PLAYWRIGHT_MODULE;
  const { chromium } = pwModule ? await import(pwModule) : await import("playwright");

  const launch = { ...launchOptions };

  // Only pin an executablePath when explicitly told to (sandbox). Otherwise let
  // Playwright use the browser it installed itself.
  const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM;
  if (chromiumPath) launch.executablePath = chromiumPath;

  // Only add proxy args when a proxy exists (sandbox). A GitHub runner has none.
  const proxyArgs = process.env.HTTPS_PROXY
    ? [`--proxy-server=${process.env.HTTPS_PROXY}`, "--proxy-bypass-list=localhost;127.0.0.1"]
    : [];
  if (proxyArgs.length) {
    launch.args = [...(launch.args || []), ...proxyArgs];
  }

  return chromium.launch(launch);
}
