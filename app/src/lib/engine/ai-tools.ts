/**
 * AI Teacher Toolkit registry (D-030).
 *
 * The teacher's AI is no longer "the thing that writes multiple-choice
 * questions" — it's a suite of grounded tools. This module is the single,
 * honest source of truth for what that suite can do: each capability declares
 * whether it is LIVE (wired end-to-end today) or PLANNED (on the roadmap), and
 * whether it is grounded (constrained to the teacher's own material — GATE-001).
 * The workspace renders straight from this list, so the UI can never claim a
 * capability the code doesn't actually ship.
 *
 * Pure and dependency-free so it is trivially testable and importable anywhere.
 */

export type ToolStatus = "live" | "planned";

/** How a tool reaches its destination when the teacher activates it. */
export type ToolAction =
  | { kind: "route"; href: string } // navigate to a page/flow
  | { kind: "generate"; mode: string } // call the grounded generator with this mode
  | { kind: "none" }; // planned — nothing to do yet

export interface AiTool {
  id: string;
  label: string;
  /** one-line, teacher-facing description of what it produces */
  description: string;
  /** emoji glyph (decorative; the label carries the meaning) */
  glyph: string;
  status: ToolStatus;
  /** true when the output is constrained to the teacher's approved material */
  grounded: boolean;
  action: ToolAction;
}

/**
 * The catalogue. LIVE tools are wired in this release; PLANNED tools are named
 * honestly so the roadmap is visible without pretending they work yet. Order is
 * roughly "most immediately useful for running a class" first.
 */
export const AI_TOOLS: AiTool[] = [
  {
    id: "exam_builder",
    label: "Exam & quiz builder",
    description: "Assemble a printable test from your question bank, with a separate answer key.",
    glyph: "📝",
    status: "live",
    grounded: true,
    action: { kind: "route", href: "/teach/exam" },
  },
  {
    id: "study_guide",
    label: "Study guide",
    description: "A revision sheet that summarises your material, grounded only in what you uploaded.",
    glyph: "📚",
    status: "live",
    grounded: true,
    action: { kind: "generate", mode: "study_guide" },
  },
  {
    id: "worked_examples",
    label: "Worked examples",
    description: "Step-by-step examples drawn from your notes — no invented numbers.",
    glyph: "🧮",
    status: "live",
    grounded: true,
    action: { kind: "generate", mode: "worked_examples" },
  },
  {
    id: "key_points",
    label: "Key-points cheat sheet",
    description: "The must-know takeaways from your material, in a tight one-pager.",
    glyph: "⭐",
    status: "live",
    grounded: true,
    action: { kind: "generate", mode: "key_points" },
  },
  {
    id: "question_factory",
    label: "Question factory",
    description: "Draft questions per concept, confirm each answer, and fill your exam bank.",
    glyph: "❓",
    status: "live",
    grounded: true,
    action: { kind: "route", href: "/teach/questions" },
  },
  {
    id: "source_suggester",
    label: "Source suggester",
    description: "Match each concept to the section of your material that best grounds it.",
    glyph: "🔗",
    status: "planned",
    grounded: true,
    action: { kind: "none" },
  },
  {
    id: "accurate_graphs",
    label: "Accurate graphs",
    description: "Code-rendered, interactive graphs from real functions — never an AI sketch.",
    glyph: "📈",
    status: "live",
    grounded: true,
    action: { kind: "route", href: "/teach/graphs" },
  },
  {
    id: "flashcards",
    label: "Flashcards",
    description: "Fill-in-the-blank flashcards generated from your approved sections.",
    glyph: "🃏",
    status: "planned",
    grounded: true,
    action: { kind: "none" },
  },
  {
    id: "rubric_builder",
    label: "Rubric builder",
    description: "Draft a grading rubric for an open-ended prompt, with level descriptors.",
    glyph: "📋",
    status: "planned",
    grounded: true,
    action: { kind: "none" },
  },
  {
    id: "lesson_plan",
    label: "Lesson pacing plan",
    description: "Spread your units across a set number of classes with time estimates.",
    glyph: "🗓️",
    status: "planned",
    grounded: true,
    action: { kind: "none" },
  },
  {
    id: "reading_level",
    label: "Reading-level adapter",
    description: "Re-pitch a passage simpler or more advanced without changing the facts.",
    glyph: "🎚️",
    status: "planned",
    grounded: true,
    action: { kind: "none" },
  },
  {
    id: "misconception_finder",
    label: "Misconception finder",
    description: "Predict where students trip up on a concept, so you can pre-empt it.",
    glyph: "🕵️",
    status: "planned",
    grounded: true,
    action: { kind: "none" },
  },
];

export function liveTools(): AiTool[] {
  return AI_TOOLS.filter((t) => t.status === "live");
}

export function plannedTools(): AiTool[] {
  return AI_TOOLS.filter((t) => t.status === "planned");
}

/** The set of generator modes the LIVE grounded generator must accept. */
export function liveGenerateModes(): string[] {
  return AI_TOOLS.filter((t) => t.status === "live" && t.action.kind === "generate").map((t) =>
    t.action.kind === "generate" ? t.action.mode : "",
  );
}
