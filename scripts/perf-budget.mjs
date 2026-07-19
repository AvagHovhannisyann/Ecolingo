#!/usr/bin/env node
/**
 * D-020 Wave 2 Stream AA — per-route performance budget gate.
 *
 * Keeps the game fast as Wave 2 piles on UI: fails loudly (non-zero exit)
 * when a route's first-load JS, its total static asset weight, or the
 * public/art-v2 art payload grows past a declared budget.
 *
 * WHAT IT PARSES, AND WHY
 * ------------------------
 * Next 16 (Turbopack) no longer prints a "First Load JS" table in the build
 * console (`next build` was run and inspected on 2026-07-19 at commit
 * d3a6d27 — the console output ends after the route tree, with no size
 * columns at all). Older "Next 13-era" artifacts like `app-build-manifest.json`
 * don't exist in this build either (verified: nothing under `.next/` matches
 * that name after a clean `npm run build`).
 *
 * What Next *does* still emit is `.next/diagnostics/route-bundle-stats.json`
 * — a dedicated, purpose-built diagnostic written by Next's own build
 * pipeline (see `node_modules/next/dist/build/route-bundle-stats.js`,
 * function `writeRouteBundleStats`). For every route it lists:
 *   - `route`: the route pattern (e.g. "/lesson/[lessonId]")
 *   - `firstLoadUncompressedJsBytes`: sum of every first-load JS chunk's
 *     on-disk byte size (shared chunks + route-specific chunks), computed
 *     by Next itself from the same manifests the router uses at runtime
 *   - `firstLoadChunkPaths`: the chunk files that sum makes up
 * This is the direct, first-party successor to the old console table's
 * "First Load JS" column, expressed as stable JSON instead of a console
 * table whose formatting is not a public contract. We trust the byte count
 * Next computes rather than re-deriving it, since it's already the
 * authoritative sum over the same on-disk chunk files.
 *
 * "Total static asset weight" per route extends that JS figure with the
 * project's shared CSS: every one of the 5 target routes references at
 * least one of the (few, small) CSS chunks under `.next/static/chunks/*.css`
 * (verified by grepping each route's `page_client-reference-manifest.js`).
 * We deliberately do NOT parse those manifest files to attribute CSS
 * per-route precisely — they're an executable, undocumented RSC-internal
 * format (Next itself loads them via `require()` + a global-variable side
 * channel, not a stable JSON contract) and are exactly the kind of brittle,
 * private surface this gate should not depend on. Instead we sum ALL CSS
 * chunks in the build and add that fixed total to every route's JS figure —
 * a conservative (slightly over-counted), stable, and trivially stat-able
 * upper bound.
 *
 * USAGE
 * -----
 *   cd app && npm run build && node ../scripts/perf-budget.mjs
 *   # or, from the repo root:
 *   npm --prefix app run build && node scripts/perf-budget.mjs
 *
 * Zero servers, zero new dependencies — reads only the static output that
 * `npm run build` already produced under app/.next and app/public.
 *
 * ESCAPE HATCH
 * ------------
 *   PERF_BUDGET_SKIP=1 node scripts/perf-budget.mjs
 * Skips the gate entirely (exit 0) without evaluating anything. Intended for
 * local iteration only — CI should never set this.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// ---------------------------------------------------------------------------
// Budgets
// ---------------------------------------------------------------------------
// Every number below is (measured baseline) * headroom, rounded UP to the
// nearest 1,000 bytes. Baselines were measured 2026-07-19 at commit d3a6d27
// via a clean `npm run build` (Next 16.2.10, Turbopack) and read from
// `.next/diagnostics/route-bundle-stats.json` (+ CSS chunk sizes on disk).
// Re-measure and bump these deliberately when a reviewed change legitimately
// grows the bundle — don't silently raise them to make a red gate green.

const ROUTE_BUDGETS = {
  "/": {
    // measured firstLoadUncompressedJsBytes = 789,475 B * 1.15 headroom -> 907,896.25, rounded up
    firstLoadJsBytes: 908_000,
    // measured 789,475 B JS + 75,439 B shared CSS = 864,914 B * 1.15 -> 994,650.1, rounded up
    totalStaticAssetWeightBytes: 995_000,
  },
  "/learn": {
    // measured firstLoadUncompressedJsBytes = 850,399 B * 1.15 -> 977,958.85, rounded up
    firstLoadJsBytes: 978_000,
    // measured 850,399 B JS + 75,439 B shared CSS = 925,838 B * 1.15 -> 1,064,713.7, rounded up
    totalStaticAssetWeightBytes: 1_065_000,
  },
  "/lesson/[lessonId]": {
    // measured firstLoadUncompressedJsBytes = 1,132,132 B * 1.15 -> 1,301,951.8, rounded up
    // (heaviest route in the app: pulls in KaTeX + pdfjs-dist for lesson content)
    firstLoadJsBytes: 1_302_000,
    // measured 1,132,132 B JS + 75,439 B shared CSS = 1,207,571 B * 1.15 -> 1,388,706.65, rounded up
    totalStaticAssetWeightBytes: 1_389_000,
  },
  "/quests": {
    // measured firstLoadUncompressedJsBytes = 774,402 B * 1.15 -> 890,562.3, rounded up
    firstLoadJsBytes: 891_000,
    // measured 774,402 B JS + 75,439 B shared CSS = 849,841 B * 1.15 -> 977,317.15, rounded up
    totalStaticAssetWeightBytes: 978_000,
  },
  "/review": {
    // measured firstLoadUncompressedJsBytes = 1,129,710 B * 1.15 -> 1,299,166.5, rounded up
    firstLoadJsBytes: 1_300_000,
    // measured 1,129,710 B JS + 75,439 B shared CSS = 1,205,149 B * 1.15 -> 1,385,921.35, rounded up
    totalStaticAssetWeightBytes: 1_386_000,
  },
};

// Global cap on public/art-v2 (every art asset Wave 2 ships as static files).
// Measured 6,383,547 B (6.09 MiB) on 2026-07-19 at d3a6d27 * 1.25 headroom
// -> 7,979,433.75, rounded up. Bigger headroom than the route budgets because
// art drops land in irregular, large jumps rather than gradual JS creep, and
// this is the ONLY thing standing between a well-intentioned art drop and a
// silent multi-megabyte blowup of every page that references it.
const ART_V2_BUDGET_BYTES = 7_980_000;

const TARGET_ROUTES = Object.keys(ROUTE_BUDGETS);

// ---------------------------------------------------------------------------
// Pure parsing / evaluation functions (no filesystem access below this line
// until `main()`) — exported so app/src/lib/__tests__/perf-budget.test.ts can
// exercise them against an embedded fixture manifest.
// ---------------------------------------------------------------------------

/**
 * Normalizes the raw `route-bundle-stats.json` array (as produced by Next's
 * `writeRouteBundleStats`) into a Map keyed by route pattern. Skips
 * malformed entries defensively rather than throwing, so a partial or
 * future-shaped manifest degrades to "route missing" (a loud FAIL) instead
 * of crashing the whole gate.
 *
 * @param {unknown} rawStats parsed JSON content of route-bundle-stats.json
 * @returns {Map<string, { route: string, firstLoadJsBytes: number, chunkPaths: string[] }>}
 */
export function parseRouteBundleStats(rawStats) {
  const byRoute = new Map();
  if (!Array.isArray(rawStats)) {
    return byRoute;
  }
  for (const entry of rawStats) {
    if (
      !entry ||
      typeof entry.route !== "string" ||
      typeof entry.firstLoadUncompressedJsBytes !== "number"
    ) {
      continue;
    }
    byRoute.set(entry.route, {
      route: entry.route,
      firstLoadJsBytes: entry.firstLoadUncompressedJsBytes,
      chunkPaths: Array.isArray(entry.firstLoadChunkPaths)
        ? entry.firstLoadChunkPaths
        : [],
    });
  }
  return byRoute;
}

/**
 * Total static asset weight for a route = its first-load JS bytes plus the
 * shared CSS total for the whole build (see file header for rationale).
 *
 * @param {number} firstLoadJsBytes
 * @param {number} sharedCssBytes
 * @returns {number}
 */
export function computeTotalStaticAssetWeightBytes(
  firstLoadJsBytes,
  sharedCssBytes,
) {
  return firstLoadJsBytes + sharedCssBytes;
}

/**
 * Builds per-route measurements for every target route, given the parsed
 * route-bundle-stats map and the shared CSS total. Routes absent from the
 * manifest (e.g. renamed or removed) are reported separately so the caller
 * can fail loudly instead of silently skipping them.
 *
 * @param {Map<string, { firstLoadJsBytes: number, chunkPaths: string[] }>} routeStatsByRoute
 * @param {string[]} targetRoutes
 * @param {number} sharedCssBytes
 * @returns {{
 *   measurements: Array<{ route: string, firstLoadJsBytes: number, totalStaticAssetWeightBytes: number }>,
 *   missingRoutes: string[],
 * }}
 */
export function buildRouteMeasurements(
  routeStatsByRoute,
  targetRoutes,
  sharedCssBytes,
) {
  const measurements = [];
  const missingRoutes = [];
  for (const route of targetRoutes) {
    const stats = routeStatsByRoute.get(route);
    if (!stats) {
      missingRoutes.push(route);
      continue;
    }
    measurements.push({
      route,
      firstLoadJsBytes: stats.firstLoadJsBytes,
      totalStaticAssetWeightBytes: computeTotalStaticAssetWeightBytes(
        stats.firstLoadJsBytes,
        sharedCssBytes,
      ),
    });
  }
  return { measurements, missingRoutes };
}

/**
 * @typedef {{ route: string, metric: string, measured: number | null, budget: number | null, status: "PASS" | "FAIL" | "MISSING" }} BudgetResult
 */

/**
 * Evaluates each route measurement against its budget, producing one result
 * row per metric (firstLoadJsBytes, totalStaticAssetWeightBytes).
 *
 * @param {Array<{ route: string, firstLoadJsBytes: number, totalStaticAssetWeightBytes: number }>} measurements
 * @param {Record<string, { firstLoadJsBytes: number, totalStaticAssetWeightBytes: number }>} budgets
 * @returns {BudgetResult[]}
 */
export function evaluateRouteBudgets(measurements, budgets) {
  /** @type {BudgetResult[]} */
  const results = [];
  for (const m of measurements) {
    const budget = budgets[m.route];
    if (!budget) {
      results.push({
        route: m.route,
        metric: "firstLoadJsBytes",
        measured: m.firstLoadJsBytes,
        budget: null,
        status: "MISSING",
      });
      continue;
    }
    results.push({
      route: m.route,
      metric: "firstLoadJsBytes",
      measured: m.firstLoadJsBytes,
      budget: budget.firstLoadJsBytes,
      status: m.firstLoadJsBytes <= budget.firstLoadJsBytes ? "PASS" : "FAIL",
    });
    results.push({
      route: m.route,
      metric: "totalStaticAssetWeightBytes",
      measured: m.totalStaticAssetWeightBytes,
      budget: budget.totalStaticAssetWeightBytes,
      status:
        m.totalStaticAssetWeightBytes <= budget.totalStaticAssetWeightBytes
          ? "PASS"
          : "FAIL",
    });
  }
  return results;
}

/**
 * @param {string[]} missingRoutes
 * @param {Record<string, { firstLoadJsBytes: number }>} budgets
 * @returns {BudgetResult[]}
 */
export function buildMissingRouteResults(missingRoutes, budgets) {
  return missingRoutes.map((route) => ({
    route,
    metric: "firstLoadJsBytes",
    measured: null,
    budget: budgets[route]?.firstLoadJsBytes ?? null,
    status: "MISSING",
  }));
}

/**
 * Evaluates the global public/art-v2 byte total against its cap.
 *
 * @param {number} measuredBytes
 * @param {number} budgetBytes
 * @returns {BudgetResult}
 */
export function evaluateArtBudget(measuredBytes, budgetBytes) {
  return {
    route: "public/art-v2 (global)",
    metric: "totalBytes",
    measured: measuredBytes,
    budget: budgetBytes,
    status: measuredBytes <= budgetBytes ? "PASS" : "FAIL",
  };
}

/**
 * @param {number} bytes
 * @returns {string}
 */
export function formatBytes(bytes) {
  return `${(bytes / 1024).toFixed(1)} KiB`;
}

/**
 * Renders the PASS/FAIL table printed to the console.
 *
 * @param {BudgetResult[]} results
 * @returns {string}
 */
export function formatReportTable(results) {
  const header = ["Route", "Metric", "Measured", "Budget", "Status"];
  const rows = results.map((r) => [
    r.route,
    r.metric,
    r.measured == null ? "n/a" : formatBytes(r.measured),
    r.budget == null ? "n/a" : formatBytes(r.budget),
    r.status,
  ]);
  const allRows = [header, ...rows];
  const widths = header.map((_, i) =>
    Math.max(...allRows.map((row) => String(row[i]).length)),
  );
  const renderRow = (row) =>
    row.map((cell, i) => String(cell).padEnd(widths[i])).join("  ");
  return [
    renderRow(header),
    widths.map((w) => "-".repeat(w)).join("  "),
    ...rows.map(renderRow),
  ].join("\n");
}

/**
 * @param {BudgetResult[]} results
 * @returns {boolean}
 */
export function allPassed(results) {
  return results.every((r) => r.status === "PASS");
}

// ---------------------------------------------------------------------------
// Filesystem I/O (impure) — kept out of the functions above so they stay
// trivially testable against an in-memory fixture.
// ---------------------------------------------------------------------------

function findAppDir() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  return path.join(scriptDir, "..", "app");
}

function sumDirectoryBytes(dirPath) {
  let entries;
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return 0;
  }
  let total = 0;
  for (const entry of entries) {
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      total += sumDirectoryBytes(full);
    } else if (entry.isFile()) {
      total += fs.statSync(full).size;
    }
  }
  return total;
}

function sumSharedCssBytes(chunkDir) {
  let entries;
  try {
    entries = fs.readdirSync(chunkDir);
  } catch {
    return 0;
  }
  let total = 0;
  for (const name of entries) {
    if (name.endsWith(".css")) {
      total += fs.statSync(path.join(chunkDir, name)).size;
    }
  }
  return total;
}

function main() {
  if (process.env.PERF_BUDGET_SKIP === "1") {
    console.log(
      "[perf-budget] PERF_BUDGET_SKIP=1 set — skipping the performance budget gate.",
    );
    process.exit(0);
    return;
  }

  const appDir = findAppDir();
  const statsPath = path.join(
    appDir,
    ".next",
    "diagnostics",
    "route-bundle-stats.json",
  );
  const chunkDir = path.join(appDir, ".next", "static", "chunks");
  const artDir = path.join(appDir, "public", "art-v2");

  if (!fs.existsSync(statsPath)) {
    console.error(`[perf-budget] Missing ${statsPath}`);
    console.error(
      "[perf-budget] Run `npm run build` inside app/ first — this gate reads " +
        "Next's build diagnostics, it does not start a server or build anything itself.",
    );
    process.exit(1);
    return;
  }

  const rawStats = JSON.parse(fs.readFileSync(statsPath, "utf8"));
  const routeStatsByRoute = parseRouteBundleStats(rawStats);
  const sharedCssBytes = sumSharedCssBytes(chunkDir);

  const { measurements, missingRoutes } = buildRouteMeasurements(
    routeStatsByRoute,
    TARGET_ROUTES,
    sharedCssBytes,
  );

  const results = [
    ...evaluateRouteBudgets(measurements, ROUTE_BUDGETS),
    ...buildMissingRouteResults(missingRoutes, ROUTE_BUDGETS),
  ];

  const artBytes = sumDirectoryBytes(artDir);
  results.push(evaluateArtBudget(artBytes, ART_V2_BUDGET_BYTES));

  console.log("[perf-budget] D-020 Wave 2 Stream AA — performance budget gate");
  console.log(`[perf-budget] source: ${path.relative(process.cwd(), statsPath)}`);
  console.log(`[perf-budget] shared CSS total: ${formatBytes(sharedCssBytes)}`);
  console.log("");
  console.log(formatReportTable(results));
  console.log("");

  if (allPassed(results)) {
    console.log("[perf-budget] PASS — every route is within budget.");
    process.exit(0);
  } else {
    console.error(
      "[perf-budget] FAIL — one or more routes exceed their performance budget (see table above).",
    );
    console.error(
      "[perf-budget] Escape hatch for local iteration: PERF_BUDGET_SKIP=1 (never set this in CI).",
    );
    process.exit(1);
  }
}

const isMainModule = (() => {
  const invokedPath = process.argv[1];
  if (!invokedPath) return false;
  try {
    return import.meta.url === pathToFileURL(invokedPath).href;
  } catch {
    return false;
  }
})();

if (isMainModule) {
  main();
}
