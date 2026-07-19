import { describe, expect, it } from "vitest";
import {
  allPassed,
  buildMissingRouteResults,
  buildRouteMeasurements,
  computeTotalStaticAssetWeightBytes,
  evaluateArtBudget,
  evaluateRouteBudgets,
  formatBytes,
  formatReportTable,
  parseRouteBundleStats,
} from "../../../../scripts/perf-budget.mjs";

/**
 * Small fixture standing in for `.next/diagnostics/route-bundle-stats.json`
 * as produced by Next 16's `writeRouteBundleStats` (see
 * node_modules/next/dist/build/route-bundle-stats.js). Shapes and field
 * names match the real artifact; byte counts are made up for the test.
 */
const FIXTURE_ROUTE_BUNDLE_STATS = [
  {
    route: "/",
    firstLoadUncompressedJsBytes: 100_000,
    firstLoadChunkPaths: [".next/static/chunks/a.js", ".next/static/chunks/b.js"],
  },
  {
    route: "/learn",
    firstLoadUncompressedJsBytes: 150_000,
    firstLoadChunkPaths: [".next/static/chunks/a.js", ".next/static/chunks/c.js"],
  },
  // Deliberately malformed entry (missing the byte count) — must be skipped,
  // not thrown on, so a partial/future-shaped manifest degrades to a loud
  // "MISSING route" result instead of crashing the whole gate.
  { route: "/broken" },
];

const SHARED_CSS_BYTES = 10_000;

const FIXTURE_BUDGETS = {
  "/": { firstLoadJsBytes: 120_000, totalStaticAssetWeightBytes: 130_000 },
  "/learn": { firstLoadJsBytes: 160_000, totalStaticAssetWeightBytes: 170_000 },
  "/missing-route": { firstLoadJsBytes: 999, totalStaticAssetWeightBytes: 999 },
};

describe("parseRouteBundleStats", () => {
  it("indexes well-formed entries by route", () => {
    const byRoute = parseRouteBundleStats(FIXTURE_ROUTE_BUNDLE_STATS);
    expect(byRoute.get("/")).toEqual({
      route: "/",
      firstLoadJsBytes: 100_000,
      chunkPaths: [".next/static/chunks/a.js", ".next/static/chunks/b.js"],
    });
    expect(byRoute.get("/learn")?.firstLoadJsBytes).toBe(150_000);
  });

  it("skips malformed entries instead of throwing", () => {
    const byRoute = parseRouteBundleStats(FIXTURE_ROUTE_BUNDLE_STATS);
    expect(byRoute.has("/broken")).toBe(false);
    expect(byRoute.size).toBe(2);
  });

  it("returns an empty map for non-array input", () => {
    expect(parseRouteBundleStats(null).size).toBe(0);
    expect(parseRouteBundleStats({ not: "an array" }).size).toBe(0);
  });
});

describe("computeTotalStaticAssetWeightBytes", () => {
  it("adds first-load JS and shared CSS bytes", () => {
    expect(computeTotalStaticAssetWeightBytes(100_000, 10_000)).toBe(110_000);
  });
});

describe("buildRouteMeasurements", () => {
  it("builds one measurement per found target route and reports the rest as missing", () => {
    const byRoute = parseRouteBundleStats(FIXTURE_ROUTE_BUNDLE_STATS);
    const { measurements, missingRoutes } = buildRouteMeasurements(
      byRoute,
      ["/", "/learn", "/missing-route"],
      SHARED_CSS_BYTES,
    );

    expect(missingRoutes).toEqual(["/missing-route"]);
    expect(measurements).toEqual([
      { route: "/", firstLoadJsBytes: 100_000, totalStaticAssetWeightBytes: 110_000 },
      { route: "/learn", firstLoadJsBytes: 150_000, totalStaticAssetWeightBytes: 160_000 },
    ]);
  });
});

describe("evaluateRouteBudgets", () => {
  it("passes routes within budget on both metrics", () => {
    const results = evaluateRouteBudgets(
      [{ route: "/", firstLoadJsBytes: 100_000, totalStaticAssetWeightBytes: 110_000 }],
      FIXTURE_BUDGETS,
    );
    expect(results).toEqual([
      { route: "/", metric: "firstLoadJsBytes", measured: 100_000, budget: 120_000, status: "PASS" },
      {
        route: "/",
        metric: "totalStaticAssetWeightBytes",
        measured: 110_000,
        budget: 130_000,
        status: "PASS",
      },
    ]);
  });

  it("fails a route that exceeds its firstLoadJsBytes budget", () => {
    const results = evaluateRouteBudgets(
      [{ route: "/", firstLoadJsBytes: 999_999, totalStaticAssetWeightBytes: 110_000 }],
      FIXTURE_BUDGETS,
    );
    const jsResult = results.find((r) => r.metric === "firstLoadJsBytes");
    expect(jsResult?.status).toBe("FAIL");
  });

  it("fails a route that exceeds only its totalStaticAssetWeightBytes budget", () => {
    const results = evaluateRouteBudgets(
      [{ route: "/", firstLoadJsBytes: 100_000, totalStaticAssetWeightBytes: 999_999 }],
      FIXTURE_BUDGETS,
    );
    const weightResult = results.find((r) => r.metric === "totalStaticAssetWeightBytes");
    expect(weightResult?.status).toBe("FAIL");
  });

  it("reports a route with no matching budget entry as MISSING rather than crashing", () => {
    const results = evaluateRouteBudgets(
      [{ route: "/unbudgeted", firstLoadJsBytes: 1, totalStaticAssetWeightBytes: 1 }],
      FIXTURE_BUDGETS,
    );
    expect(results).toEqual([
      { route: "/unbudgeted", metric: "firstLoadJsBytes", measured: 1, budget: null, status: "MISSING" },
    ]);
  });
});

describe("buildMissingRouteResults", () => {
  it("surfaces routes absent from the manifest as MISSING with their budget for context", () => {
    const results = buildMissingRouteResults(["/missing-route"], FIXTURE_BUDGETS);
    expect(results).toEqual([
      {
        route: "/missing-route",
        metric: "firstLoadJsBytes",
        measured: null,
        budget: 999,
        status: "MISSING",
      },
    ]);
  });
});

describe("evaluateArtBudget", () => {
  it("passes when under the cap", () => {
    expect(evaluateArtBudget(500, 1000).status).toBe("PASS");
  });

  it("fails when over the cap", () => {
    expect(evaluateArtBudget(1500, 1000).status).toBe("FAIL");
  });
});

describe("allPassed", () => {
  it("is true only when every result PASSes", () => {
    expect(
      allPassed([
        { route: "/", metric: "firstLoadJsBytes", measured: 1, budget: 2, status: "PASS" },
      ]),
    ).toBe(true);
    expect(
      allPassed([
        { route: "/", metric: "firstLoadJsBytes", measured: 1, budget: 2, status: "PASS" },
        { route: "/learn", metric: "firstLoadJsBytes", measured: 3, budget: 2, status: "FAIL" },
      ]),
    ).toBe(false);
    expect(
      allPassed([
        { route: "/gone", metric: "firstLoadJsBytes", measured: null, budget: null, status: "MISSING" },
      ]),
    ).toBe(false);
  });
});

describe("formatBytes / formatReportTable", () => {
  it("formats bytes as KiB with one decimal place", () => {
    expect(formatBytes(1024)).toBe("1.0 KiB");
    expect(formatBytes(1536)).toBe("1.5 KiB");
  });

  it("renders an aligned table including a header, separator, and every row", () => {
    const table = formatReportTable([
      { route: "/", metric: "firstLoadJsBytes", measured: 100_000, budget: 120_000, status: "PASS" },
      { route: "/gone", metric: "firstLoadJsBytes", measured: null, budget: null, status: "MISSING" },
    ]);
    const lines = table.split("\n");
    expect(lines[0]).toContain("Route");
    expect(lines[0]).toContain("Status");
    expect(lines[1]).toMatch(/^-+/);
    expect(table).toContain("PASS");
    expect(table).toContain("MISSING");
    expect(table).toContain("n/a");
  });
});

describe("end-to-end fixture wiring (parse -> measure -> evaluate)", () => {
  it("produces a passing gate for a fixture manifest comfortably inside budget", () => {
    const byRoute = parseRouteBundleStats(FIXTURE_ROUTE_BUNDLE_STATS);
    const { measurements, missingRoutes } = buildRouteMeasurements(
      byRoute,
      ["/", "/learn"],
      SHARED_CSS_BYTES,
    );
    const results = [
      ...evaluateRouteBudgets(measurements, FIXTURE_BUDGETS),
      ...buildMissingRouteResults(missingRoutes, FIXTURE_BUDGETS),
      evaluateArtBudget(500, 1000),
    ];
    expect(allPassed(results)).toBe(true);
  });

  it("produces a failing gate when a route's manifest disappears (route renamed/removed)", () => {
    const byRoute = parseRouteBundleStats(FIXTURE_ROUTE_BUNDLE_STATS);
    const { measurements, missingRoutes } = buildRouteMeasurements(
      byRoute,
      ["/", "/missing-route"],
      SHARED_CSS_BYTES,
    );
    const results = [
      ...evaluateRouteBudgets(measurements, FIXTURE_BUDGETS),
      ...buildMissingRouteResults(missingRoutes, FIXTURE_BUDGETS),
    ];
    expect(allPassed(results)).toBe(false);
  });
});
