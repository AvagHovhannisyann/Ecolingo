/**
 * Course worlds (spec §12, Worlds 0–7). Art: Higgsfield-generated
 * course-world backgrounds (spec §17.1 approved slot; provenance in
 * public/ASSETS.md). Only World 2 has playable content in the slice;
 * the rest compile through the same schema once teacher materials are
 * ingested (they are honestly labelled, never faked as available).
 */

export interface World {
  number: number;
  slug: string;
  title: string;
  tagline: string;
  art: string; // /public path
  available: boolean;
  topics: string[];
}

export const worlds: World[] = [
  {
    number: 0,
    slug: "foundations",
    title: "Mathematical & data foundations",
    tagline: "Growth rates, logs, time series — the toolkit.",
    art: "/worlds/world-0-foundations.webp",
    available: false,
    topics: ["growth rates", "logarithms", "AR/MA/ARMA", "trend vs cycle", "GDP", "unemployment", "inflation"],
  },
  {
    number: 1,
    slug: "building",
    title: "Building an economy",
    tagline: "Production, capital, labour, TFP.",
    art: "/worlds/world-1-building.webp",
    available: false,
    topics: ["production", "capital accumulation", "per-worker variables", "population growth", "depreciation"],
  },
  {
    number: 2,
    slug: "solow",
    title: "Solow growth",
    tagline: "The fundamental equation, steady states, the Golden Rule.",
    art: "/worlds/world-2-solow.webp",
    available: true,
    topics: ["production function", "diminishing returns", "fundamental equation", "steady state", "stability", "Golden Rule", "convergence"],
  },
  {
    number: 3,
    slug: "consumption",
    title: "Consumption across time",
    tagline: "Smoothing, permanent income, two-period choices.",
    art: "/worlds/world-3-consumption.webp",
    available: false,
    topics: ["consumption smoothing", "two-period budget", "present value", "PIH", "excess sensitivity"],
  },
  {
    number: 4,
    slug: "optimization",
    title: "Optimization",
    tagline: "Utility, Euler equations, income vs substitution.",
    art: "/worlds/world-4-optimization.webp",
    available: false,
    topics: ["marginal utility", "Lagrangian", "Euler equation", "OLG", "Ricardian equivalence"],
  },
  {
    number: 5,
    slug: "cycles",
    title: "Business cycles & labour",
    tagline: "Booms, recessions, and the labour market.",
    art: "/worlds/world-5-cycles.webp",
    available: false,
    topics: ["trend and cycle", "pro/counter/acyclical", "labour supply & demand", "unemployment"],
  },
  {
    number: 6,
    slug: "fiscal",
    title: "Investment & fiscal policy",
    tagline: "Optimal investment, deficits, equilibrium.",
    art: "/worlds/world-6-fiscal.webp",
    available: false,
    topics: ["intertemporal investment", "government budget", "TFP shocks", "deficits", "Laffer curve"],
  },
  {
    number: 7,
    slug: "monetary",
    title: "Monetary policy & forecasting",
    tagline: "Money, the Lucas critique, Taylor rules.",
    art: "/worlds/world-7-monetary.webp",
    available: false,
    topics: ["monetary policy", "Lucas critique", "Taylor rule", "forecasting", "model uncertainty"],
  },
];
