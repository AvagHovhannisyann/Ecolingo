#!/usr/bin/env node
/**
 * Generates docs/01-requirement-coverage-matrix.md from the canonical backlog
 * defined below. The backlog preserves every one of the 216 IDEA items from
 * the master build prompt. Re-run after any classification change:
 *
 *   node scripts/generate-coverage-matrix.mjs
 *
 * Classification legend:
 *   MVP        — in the first shippable vertical slice / MVP release
 *   post-MVP   — planned, after MVP proves the loop
 *   experiment — behind a flag; needs evidence before commitment
 *   platform   — multi-course / multi-tenant generalization work
 *   deferred   — intentionally out of scope for now, with reason
 */

// [id, title, release, note]
// Category blocks follow the master prompt exactly (12 items per category).
const CATEGORIES = [
  ["Onboarding and learner diagnosis", [
    [1, "Role-specific onboarding for students, teachers, and independent learners", "MVP", "Role choice gates student vs teacher flows"],
    [2, "Join a course using a six-character class code", "MVP", "Deterministic code validation"],
    [3, "Preview the course map before committing", "post-MVP", "Needs published-course preview surface"],
    [4, "Five-minute English comprehension diagnostic", "post-MVP", "Language burden model ships after core loop"],
    [5, "Five-minute mathematical-readiness diagnostic", "MVP", "Feeds math-depth personalization"],
    [6, "Graph-reading diagnostic", "MVP", "Feeds graph-interpretation mastery prior"],
    [7, "Confidence rating after every diagnostic answer", "MVP", "confidence_ratings entity"],
    [8, "Interest selection for personalized analogies", "post-MVP", "Requires tutor agent live"],
    [9, "Preferred explanation-order selection", "MVP", "Profile field; drives lesson step order"],
    [10, "Daily study-time selection", "MVP", "Scheduler input"],
    [11, "Exam-date import", "MVP", "Scheduler input; manual entry first, calendar import post-MVP"],
    [12, "A calibration lesson that silently tests preferred formats", "post-MVP", "Needs interaction telemetry baseline"],
  ]],
  ["Personalization profile", [
    [13, "Mastery score for every individual concept", "MVP", "mastery_states core"],
    [14, "Separate confidence score for every concept", "MVP", "Stored alongside mastery"],
    [15, "Misconception history rather than only wrong-answer history", "MVP", "misconceptions + response tags"],
    [16, "Preferred analogy domains", "post-MVP", "With tutor agent"],
    [17, "Adjustable reading complexity", "post-MVP", "Needs English diagnostic first"],
    [18, "Adjustable mathematics depth", "MVP", "Profile field consumed by lesson steps"],
    [19, "Preferred feedback tone", "post-MVP", "Tutor agent parameter"],
    [20, "Visual-first versus text-first mode", "MVP", "Lesson step ordering flag"],
    [21, "Automatic detection of repeated hesitation", "experiment", "Needs telemetry volume; risk of false positives"],
    [22, "Frustration detection from retries and rapid guessing", "experiment", "Same evidence bar as IDEA-021"],
    [23, "Goal-specific paths for understanding, homework, or exams", "post-MVP", "Objective captured at onboarding in MVP; path branching later"],
    [24, "Student controls to reset or edit personalization", "MVP", "Trust requirement; simple settings surface"],
  ]],
  ["Course ingestion", [
    [25, "Upload PDFs", "MVP", "Teacher upload path"],
    [26, "Upload slides", "MVP", "PPTX/PDF parsing"],
    [27, "Upload handwritten notes", "deferred", "OCR quality risk; substitute: typed notes + photo upload post-MVP"],
    [28, "Upload video transcripts", "post-MVP", "Text ingestion pipeline reuse"],
    [29, "Upload syllabus and deadlines", "MVP", "Feeds exam_dates + course map"],
    [30, "Upload assignments and official solutions", "MVP", "Grounding for questions"],
    [31, "Upload past examinations", "MVP", "Grounding for exam mode"],
    [32, "Extract equations with page-level citations", "MVP", "Ingestion agent core; citations entity"],
    [33, "Detect and classify visual graphs", "post-MVP", "Vision extraction after text path proves out"],
    [34, "Build a prerequisite concept graph", "MVP", "concept_edges; teacher-reviewed"],
    [35, "Detect conflicting notation across lectures", "post-MVP", "notations entity ships MVP; conflict detection after"],
    [36, "Flag unclear or contradictory source material for teachers", "post-MVP", "Evaluator agent output"],
  ]],
  ["Teacher course builder", [
    [37, "Guided course-creation wizard", "MVP", "Create + upload + review + publish"],
    [38, "AI-proposed learning outcomes", "post-MVP", "Curriculum agent output, teacher-approved"],
    [39, "Drag-and-drop module reordering", "MVP", "With keyboard-accessible fallback"],
    [40, "Importance rating for each concept", "MVP", "Scheduler weight"],
    [41, "“Examinable” labels", "MVP", "Exam-mode filter"],
    [42, "Teacher-locked definitions", "MVP", "GATE-004 enforcement"],
    [43, "Teacher-approved equations", "MVP", "Approval state on equations"],
    [44, "Rubric generator", "post-MVP", "Assessment agent; drafts require approval"],
    [45, "Question-bank generator", "MVP", "Draft state; teacher approves before student exposure"],
    [46, "One-click lesson regeneration", "post-MVP", "Requires content versioning UX"],
    [47, "Course-version history", "MVP", "content_versions/course_versions entities"],
    [48, "Private class publishing with join codes", "MVP", "Publish flow"],
  ]],
  ["Micro-lesson formats", [
    [49, "Definition card", "MVP", "Lesson step type"],
    [50, "Intuition card", "MVP", "Lesson step type"],
    [51, "Cause-and-effect chain", "MVP", "Lesson step type"],
    [52, "Formula breakdown", "MVP", "KaTeX term-by-term"],
    [53, "Animated derivation", "post-MVP", "Reduced-motion alternative required"],
    [54, "Interactive visual", "MVP", "Embeds visual lab states"],
    [55, "Worked numerical example", "MVP", "Deterministic values"],
    [56, "Common misconception card", "MVP", "Bound to misconception registry"],
    [57, "One-question checkpoint", "MVP", "Completion criterion for lessons"],
    [58, "Three-line summary", "MVP", "Lesson step type"],
    [59, "Personalized analogy", "post-MVP", "Tutor agent"],
    [60, "Real-world application prompt", "post-MVP", "Curriculum agent"],
  ]],
  ["AI explanation modes", [
    [61, "“Explain like I am new”", "MVP", "Explain button mode"],
    [62, "“Explain in three sentences”", "MVP", "Explain button mode"],
    [63, "“Explain step by step”", "MVP", "Explain button mode"],
    [64, "“Show only the intuition”", "MVP", "Explain button mode"],
    [65, "“Show the full mathematics”", "MVP", "Explain button mode"],
    [66, "“Use a football analogy”", "post-MVP", "Analogy safety review first"],
    [67, "“Connect this to business”", "post-MVP", "Analogy mode"],
    [68, "“Connect this to Armenia”", "post-MVP", "Country-context mode; grounding rules apply"],
    [69, "“Explain using a graph”", "MVP", "Routes to code-rendered graph, never generated image"],
    [70, "“Ask me questions instead of telling me”", "post-MVP", "Socratic mode; also integrity-mode default"],
    [71, "“Explain why my answer is wrong”", "MVP", "Misconception-driven feedback"],
    [72, "“Compare this with the previous model”", "post-MVP", "Needs cross-concept retrieval"],
  ]],
  ["Interactive visuals", [
    [73, "Drag Solow curves", "MVP", "Solow Lab"],
    [74, "Adjust economic parameters with sliders", "MVP", "Solow Lab sliders s, n, δ, α, A"],
    [75, "Rotate an intertemporal budget line", "MVP", "Intertemporal Budget Lab"],
    [76, "Construct a compensated budget line", "MVP", "Intertemporal Budget Lab; TEST-ECON-007"],
    [77, "Drag an equilibrium point", "post-MVP", "Generalized graph interaction"],
    [78, "Build a causal chain from policy to outcome", "post-MVP", "Chain-builder question type"],
    [79, "Balance both sides of an Euler equation", "post-MVP", "Euler Balance Game"],
    [80, "Animate the life-cycle income path", "post-MVP", "PIH simulator"],
    [81, "Shade welfare or consumption areas", "post-MVP", "Graph layer"],
    [82, "Scrub backward and forward through a model shock", "post-MVP", "Transition dynamics scrubber"],
    [83, "Switch between numerical and symbolic views", "MVP", "Solow Lab toggle"],
    [84, "Save a visual state as a personal note", "post-MVP", "Serialized lab state"],
  ]],
  ["Question formats", [
    [85, "Single-correct multiple choice", "MVP", "Format 1 of 6"],
    [86, "Select-all-that-apply", "MVP", "Format 2 of 6"],
    [87, "Numerical calculation", "MVP", "Format 3 of 6; tolerance + equivalence rules"],
    [88, "Equation assembly", "MVP", "Format 4 of 6; drag/tap terms"],
    [89, "Diagram labelling", "MVP", "Format 5 of 6; code-rendered diagram"],
    [90, "Drag-and-drop causal ordering", "MVP", "Format 6 of 6; keyboard alternative"],
    [91, "Draw or shift a graph", "post-MVP", "Constrained graph manipulation as answer"],
    [92, "Identify the incorrect step", "post-MVP", "Worked-solution debugging"],
    [93, "Short written explanation", "post-MVP", "Rubric-scored; teacher-visible"],
    [94, "Data-table interpretation", "post-MVP", "World 0 data skills"],
    [95, "Real-world policy scenario", "post-MVP", "Transfer questions"],
    [96, "Spoken answer with transcript analysis", "deferred", "Speech stack cost; substitute: typed explanation (IDEA-093)"],
  ]],
  ["Answer feedback", [
    [97, "Immediate correctness feedback", "MVP", "Deterministic scoring"],
    [98, "One minimal hint before revealing the answer", "MVP", "Hint ladder step 1"],
    [99, "Feedback tied to the exact misconception", "MVP", "Distractor→misconception mapping"],
    [100, "Source slide shown beside feedback", "MVP", "Citation panel"],
    [101, "Confidence-versus-performance feedback", "MVP", "Calibration message"],
    [102, "Easier follow-up when the student struggles", "MVP", "Difficulty step-down rule"],
    [103, "Harder transfer question after correct answers", "MVP", "Difficulty step-up rule"],
    [104, "Automatically generated retry variant", "post-MVP", "Assessment agent variants; approved templates only"],
    [105, "Personal error journal", "post-MVP", "Derived view over student_responses"],
    [106, "Step-by-step answer reveal", "MVP", "Worked solution stepper"],
    [107, "Compare student reasoning with expert reasoning", "post-MVP", "Needs written-explanation format"],
    [108, "Ask the tutor directly from the feedback screen", "MVP", "Explain entry point on feedback"],
  ]],
  ["Scheduling and retention", [
    [109, "Spaced-repetition review queue", "MVP", "Deterministic scheduler core"],
    [110, "Backward exam-planning algorithm", "MVP", "Plan from exam date backwards"],
    [111, "Daily lesson budget based on available minutes", "MVP", "Scheduler input"],
    [112, "Automatic catch-up plan after missed days", "MVP", "Replan on load"],
    [113, "Interleaving of different units", "post-MVP", "After single-unit loop proves out"],
    [114, "Extra frequency for high-importance weak concepts", "MVP", "Importance × mastery weighting"],
    [115, "Final-week exam mode", "post-MVP", "Examinable-only filter + mixed mock"],
    [116, "Five-minute emergency study mode", "post-MVP", "Top-k weakest due items"],
    [117, "Streak-rescue micro-review", "experiment", "Gamification; measure retention effect"],
    [118, "Calendar synchronization", "deferred", "OAuth scope + privacy cost; substitute: ICS export post-MVP"],
    [119, "Rest-day planning", "MVP", "No-study days respected by scheduler"],
    [120, "Predicted exam-readiness score", "post-MVP", "Needs calibrated mastery model"],
  ]],
  ["Gamification", [
    [121, "XP for meaningful completion", "MVP", "Awarded on mastery evidence, not clicks"],
    [122, "Mastery stars for concepts", "MVP", "Maps to mastery bands"],
    [123, "Course levels", "post-MVP", "World progression labels"],
    [124, "Study streaks", "MVP", "No-shame reset; rest days don't break streaks"],
    [125, "Daily quests", "experiment", "Measure habit effect vs distraction"],
    [126, "End-of-unit boss challenges", "post-MVP", "Unit test wrapper"],
    [127, "Optional class leagues", "experiment", "Opt-in only; anxiety risk"],
    [128, "Skill-specific badges", "post-MVP", "Badge registry"],
    [129, "Course currency for cosmetic rewards", "deferred", "Economy design cost; no learning value evidence"],
    [130, "Unlockable mascot expressions", "deferred", "Blocked on Fabel mascot system"],
    [131, "Cooperative class challenges", "experiment", "Social feature bar"],
    [132, "No punishment for mistakes made during learning", "MVP", "Invariant, enforced in scoring rules"],
  ]],
  ["Motivation and habits", [
    [133, "Flexible daily goal", "MVP", "Editable minutes target"],
    [134, "Small celebrations after difficult steps", "MVP", "Event-driven; reduced-motion safe; visual treatment by Fabel"],
    [135, "Visible course-map progress", "MVP", "Path progress states"],
    [136, "Weekly personalized progress report", "post-MVP", "Job + notification"],
    [137, "Compassionate comeback flow after absence", "post-MVP", "Catch-up plan + tone rules"],
    [138, "Milestone certificates", "post-MVP", "Deterministic issuance"],
    [139, "“Future you” exam countdown", "post-MVP", "Exam plan surface"],
    [140, "Examples of classmates improving with practice", "experiment", "Privacy review required; anonymized only"],
    [141, "Teacher praise messages", "post-MVP", "Teacher dashboard action"],
    [142, "Anxiety-free practice mode", "MVP", "Ungraded practice invariant (IDEA-132)"],
    [143, "Clear end-of-session summary", "MVP", "Session summary screen"],
    [144, "Reminders selected based on actual user responsiveness", "experiment", "Notification policy learning"],
  ]],
  ["Teacher analytics", [
    [145, "Concept mastery heatmap", "MVP", "Class × concept grid"],
    [146, "Misconception-cluster report", "MVP", "Top misconceptions by frequency"],
    [147, "Question-quality analytics", "post-MVP", "Discrimination/difficulty stats"],
    [148, "Time-spent distribution", "post-MVP", "Analytics rollup"],
    [149, "Confidence–mastery gap report", "post-MVP", "Calibration by student"],
    [150, "At-risk student detection", "post-MVP", "Rule-based first, no black-box flags"],
    [151, "Suggested review lesson for the next class", "post-MVP", "Teacher copilot"],
    [152, "Compare different class sections", "platform", "Multi-section orgs"],
    [153, "Source-coverage report", "post-MVP", "Concepts without citations"],
    [154, "Suggested individual intervention", "post-MVP", "Teacher copilot; human-approved"],
    [155, "CSV and PDF export", "post-MVP", "Deterministic export"],
    [156, "Weekly AI-generated teacher briefing", "post-MVP", "Job + approval-free summary (non-instructional)"],
  ]],
  ["Social and classroom features", [
    [157, "Small study groups", "deferred", "Out of MVP (no multiplayer); revisit after pilot"],
    [158, "Peer explanation challenges", "deferred", "Moderation cost"],
    [159, "Friend-versus-friend quiz", "deferred", "Out of MVP (no live multiplayer)"],
    [160, "Optional class leaderboard", "experiment", "Opt-in; teacher-controlled"],
    [161, "Teacher live polls", "post-MVP", "Realtime channel exists in stack"],
    [162, "Office-hours question queue", "post-MVP", "Async queue, no scheduling"],
    [163, "Shared class notes", "deferred", "Scope control; substitute: teacher notes on concepts"],
    [164, "“Teach this to a peer” activity", "experiment", "Learning-science promising; needs design"],
    [165, "Team boss challenge", "deferred", "Multiplayer out of MVP"],
    [166, "AI-moderated course discussion", "deferred", "Moderation liability; revisit with policy"],
    [167, "Student mentor matching", "deferred", "Cold-start + safety review"],
    [168, "Anonymous “I do not understand” questions", "post-MVP", "Low-cost, high-value classroom signal"],
  ]],
  ["Accessibility and language", [
    [169, "Simplified-English mode", "post-MVP", "Depends on language burden model"],
    [170, "Multilingual explanations", "post-MVP", "Notation/terms stay in course language"],
    [171, "Dyslexia-friendly font option", "MVP", "Font toggle; Fabel selects typeface"],
    [172, "Screen-reader-compatible equations", "MVP", "MathML/aria from KaTeX"],
    [173, "Full keyboard navigation", "MVP", "GATE-007; includes labs"],
    [174, "Colour-blind-safe graphs", "MVP", "Never colour-only encoding"],
    [175, "Reduced-motion setting", "MVP", "prefers-reduced-motion + in-app toggle"],
    [176, "Captions for every video", "post-MVP", "No video in MVP lessons"],
    [177, "Text-to-speech", "post-MVP", "Platform TTS first"],
    [178, "Speech-to-text questions", "deferred", "With IDEA-096"],
    [179, "Progressive Web App offline caching", "post-MVP", "Read-only lesson cache first"],
    [180, "Low-bandwidth mode", "post-MVP", "No-image, SVG-only variant"],
  ]],
  ["Reliability and trust", [
    [181, "Page-level citations for every explanation", "MVP", "GATE-001; citations entity"],
    [182, "Confidence indicator for uncertain outputs", "MVP", "Uncertainty banner on AI output"],
    [183, "Deterministic symbolic answer checking", "MVP", "Equivalence engine; TEST-ECON-015"],
    [184, "Hard-coded graph constraints", "MVP", "GATE-002; labs are code-controlled"],
    [185, "Teacher approval before publication", "MVP", "teacher_approvals gate"],
    [186, "Full content audit trail", "MVP", "audit_events"],
    [187, "Lesson and answer-key versioning", "MVP", "content_versions"],
    [188, "“Report an error” on every screen", "MVP", "Feedback pipe to teacher/ops"],
    [189, "Automated hallucination test", "MVP", "Eval suite in CI"],
    [190, "Restricted retrieval by course permission", "MVP", "RLS + retrieval scoping"],
    [191, "Privacy controls for student analytics", "MVP", "Role-based visibility"],
    [192, "Continuous AI evaluation suite", "MVP", "Golden set + regression evals"],
  ]],
  ["Economics-specific experiences", [
    [193, "Solow steady-state simulator", "MVP", "Solow Lab (13.1)"],
    [194, "Golden Rule savings challenge", "post-MVP", "Golden Rule Lab (13.2)"],
    [195, "Conditional-convergence country race", "post-MVP", "World 2 enrichment"],
    [196, "Build-your-own GDP exercise", "post-MVP", "World 0"],
    [197, "Inflation-basket simulator", "post-MVP", "World 0"],
    [198, "Permanent-income shock laboratory", "post-MVP", "PIH Shock Simulator (13.5)"],
    [199, "Euler-equation balance game", "post-MVP", "Euler Balance Game (13.4)"],
    [200, "Lender-versus-borrower interest-rate lab", "MVP", "Intertemporal Budget Lab (13.3)"],
    [201, "Labour–leisure choice simulator", "post-MVP", "World 5"],
    [202, "Optimal-investment MPK challenge", "post-MVP", "World 6"],
    [203, "Business-cycle variable classifier", "post-MVP", "Classifier game (13.6)"],
    [204, "Fiscal-policy equilibrium sandbox", "post-MVP", "Fiscal Sandbox (13.7)"],
  ]],
  ["Platform expansion and distribution", [
    [205, "Reusable course templates", "platform", "Phase 9"],
    [206, "Teacher-created course marketplace", "platform", "Out of MVP by spec §28"],
    [207, "School administrator dashboard", "platform", "Org tier"],
    [208, "LMS import and export", "platform", "LTI/CSV"],
    [209, "Public and private course options", "post-MVP", "Private-only in MVP; public needs explicit action (§25)"],
    [210, "Verified course certificates", "platform", "With IDEA-138 + identity"],
    [211, "Institution-specific branding", "platform", "Theming layer; design by Fabel"],
    [212, "Student referral programme", "deferred", "Growth after pilot evidence"],
    [213, "Free student tier with paid advanced features", "platform", "Pricing after pilot"],
    [214, "Anonymous learning-research dashboard", "platform", "IRB/privacy review first"],
    [215, "API for third-party course creators", "platform", "After content model stabilizes"],
    [216, "Revenue sharing for high-quality teacher courses", "platform", "With marketplace (IDEA-206)"],
  ]],
];

// Per-category defaults for matrix columns that are uniform within a category.
const CATEGORY_META = {
  "Onboarding and learner diagnosis":      { area: "Onboarding",        user: "Student",          ux: "Onboarding wizard",          data: "profiles, study_plans, exam_dates, confidence_ratings", ai: "None (deterministic forms); diagnostics scored deterministically", det: "Validation, join-code lookup, scoring rules" },
  "Personalization profile":               { area: "Personalization",   user: "Student",          ux: "Profile + engine (mostly invisible)", data: "profiles, mastery_states, misconceptions, student_responses", ai: "Classification only where flagged", det: "Mastery math, profile schema, reset flows" },
  "Course ingestion":                      { area: "Ingestion",         user: "Teacher",          ux: "Upload + processing status",  data: "source_files, source_pages, source_chunks, citations, equations, notations, concept_edges", ai: "Ingestion agent (extraction, classification)", det: "File validation, provenance links, chunk offsets" },
  "Teacher course builder":                { area: "Course builder",    user: "Teacher",          ux: "Builder + review screens",    data: "courses, course_versions, concepts, lessons, questions, teacher_approvals, content_versions", ai: "Curriculum/assessment agents propose drafts", det: "Approval state machine, locks, versioning, publish rules" },
  "Micro-lesson formats":                  { area: "Lesson player",     user: "Student",          ux: "Lesson step cards",           data: "lessons, lesson_steps, citations", ai: "Step content generation (draft, grounded)", det: "Step schema, completion criteria, interaction events" },
  "AI explanation modes":                  { area: "Explain system",    user: "Student",          ux: "Explain button + panel",      data: "source_chunks, citations, notations, profiles", ai: "Tutor agent (grounded generation)", det: "Citation resolution, notation lock, mode routing, caching" },
  "Interactive visuals":                   { area: "Visual labs",       user: "Student",          ux: "Lab canvas (SVG, code-rendered)", data: "visual_models, equations", ai: "None in render path; misconception feedback text may be AI-drafted", det: "All geometry, model math, expected interpretations" },
  "Question formats":                      { area: "Practice engine",   user: "Student",          ux: "Question cards",              data: "questions, question_variants, answer_keys, misconceptions", ai: "Draft generation only (teacher-approved)", det: "Scoring, equivalence rules, answer keys" },
  "Answer feedback":                       { area: "Feedback system",   user: "Student",          ux: "Feedback panel",              data: "student_responses, misconceptions, citations, mastery_states", ai: "Misconception explanation text (grounded)", det: "Correctness, misconception mapping, hint ladder, difficulty rules" },
  "Scheduling and retention":              { area: "Scheduler",         user: "Student",          ux: "Review queue + exam plan",    data: "review_schedules, study_plans, exam_dates, mastery_states", ai: "None (deterministic scheduler)", det: "Intervals, exam back-planning, budgets, explainable reasons" },
  "Gamification":                          { area: "Gamification",      user: "Student",          ux: "Progress chrome",             data: "analytics_events, mastery_states", ai: "None", det: "XP/star/streak rules; never modifies mastery" },
  "Motivation and habits":                 { area: "Motivation",        user: "Student",          ux: "Summaries, reports, nudges",  data: "analytics_events, notifications, study_plans", ai: "Report prose (non-instructional)", det: "Triggers, schedules, opt-outs" },
  "Teacher analytics":                     { area: "Teacher dashboard", user: "Teacher",          ux: "Dashboard views",             data: "mastery_states, student_responses, misconceptions, analytics_events", ai: "Teacher copilot summaries/suggestions", det: "Aggregations, thresholds, exports, role visibility" },
  "Social and classroom features":         { area: "Classroom/social",  user: "Student+Teacher",  ux: "Class surfaces",              data: "course_memberships, notifications", ai: "Moderation assist where noted", det: "Membership, permissions, opt-in state" },
  "Accessibility and language":            { area: "Accessibility",     user: "All",              ux: "Settings + global behaviour", data: "profiles (a11y prefs)", ai: "Simplification/translation modes only", det: "Prefs, rendering paths, WCAG conformance" },
  "Reliability and trust":                 { area: "Trust infrastructure", user: "All",           ux: "Citations, banners, report control", data: "citations, audit_events, content_versions, teacher_approvals", ai: "Evaluator agent", det: "Gates, RLS, versioning, eval harness" },
  "Economics-specific experiences":        { area: "ECON 13210 content", user: "Student",         ux: "Labs + course activities",    data: "visual_models, concepts, equations, questions", ai: "None in model math", det: "Model equations, lab constraints, classifications" },
  "Platform expansion and distribution":   { area: "Platform",          user: "Org/Platform",     ux: "Admin/marketplace surfaces",  data: "organizations, courses, feature_flags", ai: "Varies", det: "Tenancy, billing, permissions" },
};

const PHASE_BY_RELEASE = {
  "MVP": "Phases 1–6",
  "post-MVP": "Phases 6–8",
  "experiment": "Phase 8 (flagged)",
  "platform": "Phase 9",
  "deferred": "—",
};

const pad = (n) => String(n).padStart(3, "0");

let out = [];
out.push("# Requirement Coverage Matrix");
out.push("");
out.push("> Generated by `scripts/generate-coverage-matrix.mjs` — edit the script, not this file.");
out.push("> Status of every numbered backlog item (216/216 preserved) plus every spec section.");
out.push("> No item is deleted or merged; deferred items carry a reason and a substitute where applicable (see the Note column).");
out.push("");
out.push("## Legend");
out.push("");
out.push("| Classification | Meaning |");
out.push("|---|---|");
out.push("| MVP | In scope for the MVP release (spec §27) |");
out.push("| post-MVP | Committed, scheduled after the MVP loop is proven |");
out.push("| experiment | Behind a feature flag; requires measured evidence before commitment |");
out.push("| platform | Multi-course / multi-tenant generalization (Phase 9) |");
out.push("| deferred | Intentionally out of scope now; reason + substitute recorded |");
out.push("");
out.push("Common acceptance criteria (testable flow, happy-path test, edge-case test, measurable value, no silent change to teacher-approved content) and the four standard edge cases apply to **every** item and are enforced by the Definition of Done in `docs/05-testing-strategy.md`. Analytics events (`viewed/started/completed/abandoned/errored/outcome`) are emitted per item under the naming scheme `idea{NNN}_{event}`.");
out.push("");

// Summary counts
const counts = {};
for (const [, items] of CATEGORIES) for (const [, , rel] of items) counts[rel] = (counts[rel] || 0) + 1;
out.push("## Summary");
out.push("");
out.push("| Classification | Count |");
out.push("|---|---|");
for (const k of ["MVP", "post-MVP", "experiment", "platform", "deferred"]) out.push(`| ${k} | ${counts[k] || 0} |`);
out.push(`| **Total** | **${Object.values(counts).reduce((a, b) => a + b, 0)}** |`);
out.push("");

// Section-level coverage (non-backlog spec sections)
out.push("## Spec-section coverage (non-backlog requirements)");
out.push("");
out.push("| Spec section | Where covered | Status |");
out.push("|---|---|---|");
const SECTIONS = [
  ["§0 Execution contract", "This matrix + docs/00-execution-summary.md (decision log, risk register)", "Done (living)"],
  ["§1–2 Thesis & product promise", "docs/02-prd.md §1–2", "Done"],
  ["§3 MOAT-01..06", "docs/02-prd.md §3; data structures in docs/03-data-model.md; tests in docs/05-testing-strategy.md", "Done (spec) / vertical slice implements MOAT-02/03/04/06 subsets"],
  ["§4 AI vs deterministic split", "docs/04-ai-orchestration.md §1; enforced by gates GATE-001..003", "Done (spec)"],
  ["§5 Brand boundary", "Delegated to Fabel per repo CLAUDE.md routing rule; engineering honours constraints (no Duolingo assets)", "Delegated"],
  ["§6 Landing page LAND-001..008", "Copy/structure requirements recorded in docs/02-prd.md §10; visual design delegated to Fabel", "Blocked on Fabel (design); build post-design"],
  ["§7 Student onboarding 7.1–7.7", "docs/02-prd.md §5; IDEA-001..012", "Spec done; MVP subset in build plan"],
  ["§8 App structure (desktop/mobile)", "docs/02-prd.md §6 information architecture; layout design by Fabel", "Spec done"],
  ["§9 Lesson anatomy LESSON-01..06", "Implemented as lesson-step schema in vertical slice (src/lib/engine/types.ts); docs/02-prd.md §7", "Implemented (schema + player)"],
  ["§10 Universal Explain button", "docs/02-prd.md §8; grounded-explanation contract in docs/04-ai-orchestration.md §5; MVP modes IDEA-061..065/069/071", "Spec done; slice ships deterministic grounded panel"],
  ["§11 Teacher flow 11.1–11.7", "docs/02-prd.md §9; IDEA-025..048", "Spec done; MVP subset in build plan"],
  ["§12 Course map Worlds 0–7", "docs/02-prd.md appendix A dependency graph; seed content for World 2 in src/content/econ13210", "World 2 seeded (planned/unverified — no lecture files in repo yet)"],
  ["§13 Visual labs 13.1–13.7", "IDEA-193..204; Solow Lab implemented in slice; geometry code-controlled", "Solow Lab implemented; others scheduled"],
  ["§14 Visual identity", "Delegated to Fabel per CLAUDE.md; palette/type constraints recorded verbatim in docs/02-prd.md §11 for Fabel handoff", "Delegated"],
  ["§15 Mascot (Numa)", "Delegated to Fabel; product events that drive mascot states defined in docs/02-prd.md §11", "Delegated"],
  ["§16 Motion system", "Delegated to Fabel; reduced-motion + a11y invariants enforced in engineering (IDEA-175, GATE-007)", "Delegated (a11y invariants engineering-owned)"],
  ["§17 Higgsfield / image-generation use", "Policy recorded in docs/04-ai-orchestration.md §6; hard rule: no generated images for truth-critical visuals (GATE-002)", "Done (policy)"],
  ["§18 Technical stack", "docs/00-execution-summary.md §4; slice uses Next.js/React/TS/Tailwind", "Done"],
  ["§19 Division of work between agents", "docs/00-execution-summary.md §5", "Done"],
  ["§20 AI system architecture 20.1–20.8", "docs/04-ai-orchestration.md §2–4 (typed schemas, failure handling, observability, evals)", "Done (spec)"],
  ["§21 Core data model 21.1–21.35", "docs/03-data-model.md (all 35 entities: keys, tenancy, RLS, audit, indexes, provenance)", "Done (spec); slice implements in-memory subset"],
  ["§22 Personalization & mastery model", "docs/02-prd.md §4 + implemented mastery engine (src/lib/engine/mastery.ts)", "Implemented (v1)"],
  ["§23 Question & feedback system", "Question schema + scoring implemented; provenance states in docs/03-data-model.md", "Implemented (v1)"],
  ["§24 Academic integrity mode", "docs/02-prd.md §9.5; assessment locks in data model", "Spec done; post-MVP build"],
  ["§25 Security, privacy, permissions", "docs/03-data-model.md §RLS + docs/05-testing-strategy.md gates", "Spec done"],
  ["§26 Reliability & trust", "IDEA-181..192 (all MVP); eval harness in docs/05-testing-strategy.md", "Spec done; slice ships deterministic checking + versioned content"],
  ["§27 MVP (12 items)", "docs/06-roadmap.md §1", "Done"],
  ["§28 Out of MVP", "docs/06-roadmap.md §3; reflected in classifications here", "Done"],
  ["§29 Validation question", "docs/06-roadmap.md §4 pilot design", "Done (spec)"],
  ["§30 Delivery order", "Followed: docs first, then vertical slice", "In progress"],
  ["§31 Required output format (29 artifacts)", "docs/00-execution-summary.md §6 maps all 29 to files/owners", "Done (map)"],
  ["§33 TEST-ECON-001..015", "docs/05-testing-strategy.md §3; subset automated in src/lib/engine/__tests__", "Partially automated (001–008, 015)"],
  ["§34 GATE-001..012", "docs/05-testing-strategy.md §4", "Done (spec)"],
  ["§35 Phases 0–9", "docs/06-roadmap.md §2 with exit criteria", "Done"],
  ["§36 Final agent instruction", "Decision log + risk register + provenance map in docs/00-execution-summary.md", "Done (living)"],
];
for (const [s, w, st] of SECTIONS) out.push(`| ${s} | ${w} | ${st} |`);
out.push("");

// The 216-item matrix
out.push("## Backlog items (IDEA-001 … IDEA-216)");
out.push("");
for (const [cat, items] of CATEGORIES) {
  const m = CATEGORY_META[cat];
  out.push(`### ${cat}`);
  out.push("");
  out.push(`- **Product area:** ${m.area} · **Primary user:** ${m.user} · **UX surface:** ${m.ux}`);
  out.push(`- **Data dependencies:** ${m.data}`);
  out.push(`- **AI dependency:** ${m.ai}`);
  out.push(`- **Deterministic dependency:** ${m.det}`);
  out.push("");
  out.push("| ID | Item | Release | Phase | Note / rationale | Test plan | Status |");
  out.push("|---|---|---|---|---|---|---|");
  for (const [n, title, rel, note] of items) {
    const id = `IDEA-${pad(n)}`;
    const test = rel === "deferred" ? "n/a until re-opened" : `Unit + e2e per DoD; analytics idea${pad(n)}_*`;
    const status = rel === "MVP" ? "Planned (MVP)" : rel === "deferred" ? "Deferred" : "Planned";
    out.push(`| ${id} | ${title} | ${rel} | ${PHASE_BY_RELEASE[rel]} | ${note} | ${test} | ${status} |`);
  }
  out.push("");
}

out.push("## Maintenance rule");
out.push("");
out.push("At the end of every delivery phase, update the Status column (Planned → In progress → Implemented → Verified) and re-run this generator. Items may change classification only with a decision-log entry in docs/00-execution-summary.md.");
out.push("");

import { writeFileSync } from "node:fs";
writeFileSync(new URL("../docs/01-requirement-coverage-matrix.md", import.meta.url), out.join("\n"));
console.log("Wrote docs/01-requirement-coverage-matrix.md");
