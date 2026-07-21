/**
 * LLM provider chain (D-042).
 *
 * The app talks to open models over the OpenAI /chat/completions shape. Two
 * providers are wired, tried in order:
 *
 *   1. GROQ  — free tier, but hosts genuinely powerful open models
 *      (gpt-oss-120b, llama-3.3-70b) on their LPU hardware, and its free
 *      per-model daily limits are far higher than OpenRouter's. So Groq is the
 *      PRIMARY when GROQ_API_KEY is set.
 *   2. OPENROUTER — the free `:free` models, which share ONE small account-wide
 *      "free-models-per-day" bucket. Kept as the FALLBACK so the pipeline still
 *      answers if Groq is momentarily throttled or unset.
 *
 * Both speak the same request/response shape, so an attempt is just
 * {url, apiKey, model, extraBody}. `extraBody` carries provider-specific knobs
 * (OpenRouter's throughput routing) that the other provider must not receive.
 *
 * Honest degrade (GATE-009): with NEITHER key set, `llmAttempts()` is empty and
 * the routes return 503 — the client falls back to its deterministic path.
 */

export interface LlmAttempt {
  provider: "groq" | "openrouter";
  url: string;
  apiKey: string;
  model: string;
  /** provider-specific request-body fields (spread into the JSON body) */
  extraBody?: Record<string, unknown>;
}

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

/**
 * Groq free models, MOST POWERFUL FIRST. `gpt-oss-120b` (OpenAI's open 120B) is
 * the strongest; `llama-3.3-70b-versatile` is nearly as strong but faster with
 * higher rate limits, so it's the natural second when the 120B is briefly
 * throttled. Override the primary with GROQ_MODEL.
 */
export const GROQ_MODELS = [
  process.env.GROQ_MODEL || "openai/gpt-oss-120b",
  "llama-3.3-70b-versatile",
];

/**
 * OpenRouter free models — final fallbacks. Kept here as the single source of
 * truth; the routes re-export this as `MODELS` for the opt-in live evals.
 */
export const OPENROUTER_MODELS = [
  process.env.OPENROUTER_MODEL || "nvidia/nemotron-3-super-120b-a12b:free",
  "nvidia/nemotron-3-ultra-550b-a55b:free",
  "tencent/hy3:free",
  "google/gemma-4-31b-it:free",
];

/** True when at least one provider key is configured. */
export function hasAnyProvider(): boolean {
  return !!(process.env.GROQ_API_KEY || process.env.OPENROUTER_API_KEY);
}

/**
 * The ordered list of upstream attempts for one request, built from whatever
 * keys are configured RIGHT NOW (read at call time so tests can stub env).
 * Groq first (powerful, high free headroom), OpenRouter free models after.
 */
export function llmAttempts(): LlmAttempt[] {
  const attempts: LlmAttempt[] = [];
  const groqKey = process.env.GROQ_API_KEY;
  if (groqKey) {
    for (const model of GROQ_MODELS) {
      attempts.push({ provider: "groq", url: GROQ_URL, apiKey: groqKey, model });
    }
  }
  const orKey = process.env.OPENROUTER_API_KEY;
  if (orKey) {
    for (const model of OPENROUTER_MODELS) {
      attempts.push({
        provider: "openrouter",
        url: OPENROUTER_URL,
        apiKey: orKey,
        model,
        // Route to the fastest available provider for this free model.
        extraBody: { provider: { sort: "throughput" } },
      });
    }
  }
  return attempts;
}
