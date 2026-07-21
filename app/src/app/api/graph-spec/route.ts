/**
 * Graph-from-description (D-048). The teacher writes what graph they want; the
 * model MAPS that request onto one of the exact function families the engine can
 * render (engine/graph.ts) and sets its parameters + axis labels + a title. It
 * NEVER draws a curve — the deterministic renderer does, from the maths — so
 * every figure stays mathematically exact (GATE-002). SERVER-SIDE key only.
 *
 * The response is re-sanitised with `sanitizeGraphSpec`: an unknown family is
 * rejected, every parameter is clamped to its real range, and labels are capped.
 * On any failure the teacher just keeps the manual sliders (GATE-009).
 */

import { NextResponse } from "next/server";
import { appendStyle } from "@/lib/engine/teaching-style";
import { TEACHING_CHARTER } from "@/lib/ai/teaching-charter";
import { llmAttempts, hasAnyProvider } from "@/lib/ai/providers";
import { graphCatalogText, sanitizeGraphSpec } from "@/lib/engine/graph";

export const runtime = "nodejs";
export const maxDuration = 30;

export function extractJsonObject(s: string): unknown {
  const fenced = s.replace(/```(?:json)?/gi, "");
  const start = fenced.indexOf("{");
  const end = fenced.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(fenced.slice(start, end + 1));
  } catch {
    return null;
  }
}

export const GRAPH_SPEC_SYSTEM_PROMPT =
  TEACHING_CHARTER +
  "\n\n---\n\n# TASK — CHOOSE A GRAPH TO RENDER\n" +
  "The app renders graphs from EXACT maths, not drawings. Your job is to translate the teacher's request into one of the available function families and its parameters — you never draw the curve yourself. " +
  "Pick the SINGLE family whose shape best matches the request, choose parameter values (within their stated ranges) that produce that shape, and write clear, specific axis labels and a short figure title. " +
  'Reply with ONLY a JSON object, no prose: {"familyId":string,"params":{<key>:number,...},"title":string,"xLabel":string,"yLabel":string}. ' +
  "Use ONLY a familyId from the list and ONLY that family's parameter keys, each within its range. Axis labels should name what the axes represent in the teacher's context (e.g. \"capital per worker\", \"output\"), not just \"x\" and \"y\", when the request implies a context. Never invent a family or a parameter that isn't listed.";

export function buildGraphSpecUser(request: string): string {
  return (
    "AVAILABLE FUNCTION FAMILIES (choose exactly one):\n" +
    graphCatalogText() +
    `\n\nTEACHER'S REQUEST:\n${request}\n\nReturn the JSON object mapping this request to a family + parameters + labels.`
  );
}

export async function POST(req: Request) {
  if (!hasAnyProvider()) return NextResponse.json({ error: "no_provider", spec: null }, { status: 503 });

  let body: { request?: unknown; style?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request", spec: null }, { status: 400 });
  }
  const request = typeof body.request === "string" ? body.request.trim().slice(0, 600) : "";
  if (request.length < 3) return NextResponse.json({ error: "bad_request", spec: null }, { status: 400 });

  const system = appendStyle(GRAPH_SPEC_SYSTEM_PROMPT, body.style);
  const user = buildGraphSpecUser(request);

  const deadline = Date.now() + (maxDuration - 6) * 1000;
  for (const attempt of llmAttempts()) {
    if (deadline - Date.now() < 8_000) break;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Math.min(20_000, deadline - Date.now()));
    try {
      const res = await fetch(attempt.url, {
        method: "POST",
        signal: controller.signal,
        headers: { Authorization: `Bearer ${attempt.apiKey}`, "Content-Type": "application/json", "X-Title": "Ecolingo" },
        body: JSON.stringify({
          model: attempt.model,
          max_tokens: 1200,
          temperature: 0.2,
          ...attempt.extraBody,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        }),
      });
      if (!res.ok) continue;
      const data = await res.json();
      const content: string = data?.choices?.[0]?.message?.content ?? "";
      const spec = sanitizeGraphSpec(extractJsonObject(content));
      if (spec === null) continue; // unknown family / unparseable → try the next model
      return NextResponse.json({ spec, model: attempt.model });
    } catch {
      // per-model timeout or network error → next model
    } finally {
      clearTimeout(timeout);
    }
  }
  return NextResponse.json({ error: "upstream_unavailable", spec: null }, { status: 502 });
}
