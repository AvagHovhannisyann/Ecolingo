/**
 * Lab keyboard-operability + reduced-motion e2e (Phase 4 a11y hardening).
 *
 * Proves — with a real browser, not assumptions — that the Solow and Budget
 * labs are genuinely keyboard operable and that reduced-motion is honoured,
 * per the PRD accessibility spec (functional/a11y invariants: reduced motion,
 * contrast, keyboard, touch targets are engineering-owned) and the Phase-4
 * exit criterion ("axe clean on labs").
 *
 * What is asserted, and why each check is shaped the way it is:
 *
 *  1. Both labs' sliders are NATIVE <input type="range">, so they inherit
 *     ArrowRight/ArrowLeft handling for free — we verify that empirically
 *     (focus the control, press arrows, read the value back). Buttons are
 *     native <button>, so Enter/Space activate them — verified too.
 *
 *  2. "The diagram re-renders": the Solow SVG is deliberately SELF-NORMALISING
 *     — changing s rescales both axes (kMax and yMax scale with s), so the
 *     curve `d` paths and the k* marker are scale-INVARIANT on purpose (this is
 *     not a bug; it keeps the geometry readable at every parameter value). The
 *     recomputation therefore surfaces in (a) the SVG's aria-label, which
 *     encodes the recomputed steady-state k*, (b) the visible k* read-out, and
 *     (c) the probe slider, whose probe circle `cx` DOES move (probeK is an
 *     absolute k, not normalised). We assert all three. The Budget line, by
 *     contrast, ROTATES about the endowment as r changes, so its path `d` is a
 *     genuine moving-geometry signal and we assert that directly.
 *
 *  3. Reduced-motion: globals.css §16 gates every entrance animation behind
 *     `@media (prefers-reduced-motion: no-preference)`, and the hiding styles
 *     (.curve-draw-1 stroke-dashoffset, .curve-fade-2 / .equilibrium-appear
 *     opacity:0) live INSIDE that query. So under `reduce` the rules don't
 *     apply: animationName resolves to `none`, duration `0s`, and opacity is 1
 *     — i.e. the full diagram is shown instantly. We assert exactly that, at
 *     /lab/solow and at the lesson's visual step, cross-referenced against what
 *     the CSS actually declares (we do not invent an expectation).
 *
 *  4. Touch targets (lightweight spot-check): the labs' buttons use the
 *     project `min-h-12` (48px) convention and must clear 44px. Native range
 *     inputs render ~28px; that meets WCAG 2.5.8 (AA, 24px) but sits below the
 *     44px AAA/button convention. Enlarging a native slider is a VISUAL sizing
 *     decision owned by design (Fabel), out of scope for this engineering task,
 *     so we assert the AA floor (24px) for sliders and the 44px floor for
 *     buttons, and log the actual heights so the gap is visible, not hidden.
 *
 * Deterministic: no network beyond the local app. Every checkpoint prints
 * "✓ <checkpoint>"; the run ends with "LAB KEYBOARD PASS" (exit 0) or a clear
 * failure message (exit 1).
 *
 * Env:
 *   SMOKE_PORT           app port (default 3400)
 *   plus the launch-browser.mjs overrides (PLAYWRIGHT_MODULE / _CHROMIUM / HTTPS_PROXY)
 */

import { launchBrowser } from "./lib/launch-browser.mjs";

const PORT = process.env.SMOKE_PORT || "3400";
const BASE = `http://localhost:${PORT}`;

const log = (m) => console.log("✓", m);
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } }); // phone-size

try {
  // =====================================================================
  // 1. SOLOW LAB — keyboard operability
  // =====================================================================
  await page.goto(`${BASE}/lab/solow`);
  await page.waitForSelector('svg[role="img"]');
  const svg = page.locator('svg[role="img"]');

  // Locate the saving-rate (s) slider by its accessible label and focus it.
  const sSlider = page.locator('input[aria-label^="Saving rate"]');
  await sSlider.focus();
  assert(
    await sSlider.evaluate((el) => el === document.activeElement),
    "Solow saving-rate slider did not receive keyboard focus"
  );
  log("Solow: saving-rate slider is reachable and focusable via keyboard");

  // ArrowRight must move the underlying value AND recompute the model.
  const sBefore = await sSlider.inputValue();
  const ariaBefore = await svg.getAttribute("aria-label");
  const kStarReadout = page.locator('dt:has-text("steady state k*") + dd');
  const kStarBefore = await kStarReadout.innerText();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  const sAfter = await sSlider.inputValue();
  const ariaAfter = await svg.getAttribute("aria-label");
  const kStarAfter = await kStarReadout.innerText();
  assert(
    Number(sAfter) > Number(sBefore),
    `ArrowRight did not increase s (before=${sBefore}, after=${sAfter})`
  );
  assert(
    ariaBefore !== ariaAfter,
    "SVG aria-label did not update after changing s (diagram did not re-render)"
  );
  assert(
    kStarBefore !== kStarAfter,
    `steady-state k* read-out did not recompute (before=${kStarBefore}, after=${kStarAfter})`
  );
  log(`Solow: ArrowRight moved s ${sBefore}->${sAfter}; diagram recomputed (k* ${kStarBefore.trim()}->${kStarAfter.trim()})`);

  // ArrowLeft must move it back down (symmetric handling).
  await page.keyboard.press("ArrowLeft");
  const sLeft = await sSlider.inputValue();
  assert(
    Number(sLeft) < Number(sAfter),
    `ArrowLeft did not decrease s (after=${sAfter}, left=${sLeft})`
  );
  log(`Solow: ArrowLeft moved s back ${sAfter}->${sLeft}`);

  // Probe slider drives a genuine moving-geometry element (probe circle cx).
  const probeSlider = page.locator('input[aria-valuetext^="k = "]');
  await probeSlider.focus();
  assert(
    await probeSlider.evaluate((el) => el === document.activeElement),
    "Solow probe (explore k) slider did not receive keyboard focus"
  );
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  const probeCircle = page.locator('svg circle[fill="#0072B2"][r="4"]').first();
  await probeCircle.waitFor();
  const probeCxBefore = await probeCircle.getAttribute("cx");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  const probeCxAfter = await probeCircle.getAttribute("cx");
  assert(
    probeCxBefore !== probeCxAfter,
    `probe circle geometry (cx) did not move on arrow keys (${probeCxBefore} -> ${probeCxAfter})`
  );
  log(`Solow: probe slider moved SVG geometry via keyboard (cx ${probeCxBefore}->${probeCxAfter})`);

  // =====================================================================
  // 2. BUDGET LAB — keyboard operability (slider + slider + button)
  // =====================================================================
  await page.goto(`${BASE}/lab/budget`);
  await page.waitForSelector('svg[role="img"]');

  // Interest-rate slider: arrows rotate the budget line (path d changes).
  const rSlider = page.locator('input[aria-valuetext*="interest rate"]');
  await rSlider.focus();
  assert(
    await rSlider.evaluate((el) => el === document.activeElement),
    "Budget interest-rate slider did not receive keyboard focus"
  );
  const rBefore = await rSlider.inputValue();
  const solidLine = page.locator('svg path[stroke="#0072B2"]:not([stroke-dasharray])').first();
  const lineBefore = await solidLine.getAttribute("d");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  const rAfter = await rSlider.inputValue();
  const lineAfter = await solidLine.getAttribute("d");
  assert(Number(rAfter) > Number(rBefore), `ArrowRight did not increase r (${rBefore} -> ${rAfter})`);
  assert(lineBefore !== lineAfter, "budget line did not rotate (path d unchanged) after changing r");
  log(`Budget: ArrowRight moved r ${rBefore}->${rAfter}; budget line rotated (path d changed)`);

  // Consumption-today slider: arrows move the chosen bundle (circle cx changes).
  const c1Slider = page.locator('input[aria-valuetext*="consumption today"]');
  await c1Slider.focus();
  assert(
    await c1Slider.evaluate((el) => el === document.activeElement),
    "Budget consumption-today slider did not receive keyboard focus"
  );
  const c1Before = await c1Slider.inputValue();
  const chosenBundle = page.locator('svg circle[stroke="white"]');
  const bundleCxBefore = await chosenBundle.getAttribute("cx");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  const c1After = await c1Slider.inputValue();
  const bundleCxAfter = await chosenBundle.getAttribute("cx");
  assert(Number(c1After) > Number(c1Before), `ArrowRight did not increase c1 (${c1Before} -> ${c1After})`);
  assert(bundleCxBefore !== bundleCxAfter, "chosen-bundle geometry (cx) did not move after changing c1");
  log(`Budget: ArrowRight moved c1 ${c1Before}->${c1After}; chosen bundle moved (cx changed)`);

  // Compensated-line button: Enter/Space must activate it (r is now off the
  // reference rate R0, so the compensated construction becomes visible).
  const compBtn = page.locator('button:has-text("compensated line")');
  await compBtn.focus();
  assert(
    await compBtn.evaluate((el) => el === document.activeElement),
    "Budget compensated-line button did not receive keyboard focus"
  );
  const pressedBefore = await compBtn.getAttribute("aria-pressed");
  await page.keyboard.press("Enter");
  const pressedAfterEnter = await compBtn.getAttribute("aria-pressed");
  assert(
    pressedBefore === "false" && pressedAfterEnter === "true",
    `Enter did not toggle compensated-line button (aria-pressed ${pressedBefore} -> ${pressedAfterEnter})`
  );
  await page.waitForSelector("text=substitution effect");
  log("Budget: Enter toggled the compensated-line button (aria-pressed true; substitution/income copy shown)");
  // Space must toggle it back off (native button semantics).
  await page.keyboard.press("Space");
  const pressedAfterSpace = await compBtn.getAttribute("aria-pressed");
  assert(pressedAfterSpace === "false", `Space did not toggle button back off (aria-pressed=${pressedAfterSpace})`);
  log("Budget: Space toggled the compensated-line button back off");

  // =====================================================================
  // 3. REDUCED MOTION — entrance animations suppressed, full diagram shown
  // =====================================================================
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`${BASE}/lab/solow`);
  await page.waitForSelector("path.curve-draw-1");

  const drawAnim = await page
    .locator("path.curve-draw-1")
    .evaluate((el) => getComputedStyle(el).animationName);
  const drawDur = await page
    .locator("path.curve-draw-1")
    .evaluate((el) => getComputedStyle(el).animationDuration);
  assert(
    drawAnim === "none" || drawDur === "0s",
    `curve-draw entrance not suppressed under reduce (animationName=${drawAnim}, duration=${drawDur})`
  );
  // And the elements the animation would have hidden must be fully visible.
  const fadeOpacity = await page
    .locator("path.curve-fade-2")
    .evaluate((el) => getComputedStyle(el).opacity);
  const equilOpacity = await page
    .locator("circle.equilibrium-appear")
    .evaluate((el) => getComputedStyle(el).opacity);
  assert(
    fadeOpacity === "1" && equilOpacity === "1",
    `reduced-motion left diagram elements hidden (fade opacity=${fadeOpacity}, equilibrium opacity=${equilOpacity})`
  );
  // Diagram still renders correct values (not a blank/broken frame).
  const reduceAria = await svg.getAttribute("aria-label");
  assert(
    /Steady state capital per worker \d/.test(reduceAria || ""),
    "Solow diagram did not render a steady-state value under reduced motion"
  );
  log("Reduced motion @/lab/solow: entrance animations off, full diagram shown, k* still computed");

  // (The former in-lesson reduced-motion check was dropped with the demo course
  // — D-022; the lab's own reduced-motion behavior above is the surviving proof.)

  // =====================================================================
  // 4. TOUCH TARGETS — buttons >= 44px; sliders >= 24px (WCAG 2.5.8 AA)
  // =====================================================================
  await page.emulateMedia({ reducedMotion: null });
  await page.goto(`${BASE}/lab/solow`);
  await page.waitForSelector('svg[role="img"]');
  const solowSliderBox = await page.locator('input[aria-label^="Saving rate"]').boundingBox();
  const solowBtnBox = await page.locator('button:has-text("View:")').boundingBox();
  assert(solowBtnBox && solowBtnBox.height >= 44, `Solow View button below 44px (${solowBtnBox?.height})`);
  assert(
    solowSliderBox && solowSliderBox.height >= 24,
    `Solow slider below WCAG 2.5.8 AA 24px (${solowSliderBox?.height})`
  );
  log(
    `Solow touch targets: View button ${Math.round(solowBtnBox.height)}px (>=44 ok), ` +
      `slider ${Math.round(solowSliderBox.height)}px (>=24 AA ok; <44 AAA/button convention -> visual sizing owned by Fabel)`
  );

  await page.goto(`${BASE}/lab/budget`);
  await page.waitForSelector('svg[role="img"]');
  const budgetSliderBox = await page.locator('input[aria-valuetext*="interest rate"]').boundingBox();
  const budgetBtnBox = await page.locator('button:has-text("compensated line")').boundingBox();
  assert(budgetBtnBox && budgetBtnBox.height >= 44, `Budget button below 44px (${budgetBtnBox?.height})`);
  assert(
    budgetSliderBox && budgetSliderBox.height >= 24,
    `Budget slider below WCAG 2.5.8 AA 24px (${budgetSliderBox?.height})`
  );
  log(
    `Budget touch targets: button ${Math.round(budgetBtnBox.height)}px (>=44 ok), ` +
      `slider ${Math.round(budgetSliderBox.height)}px (>=24 AA ok; <44 AAA/button convention -> visual sizing owned by Fabel)`
  );

  console.log("LAB KEYBOARD PASS");
  await browser.close();
  process.exit(0);
} catch (err) {
  await page.screenshot({ path: "lab-keyboard-failure.png" }).catch(() => {});
  console.error("LAB KEYBOARD FAIL:", err && err.message ? err.message : err);
  await browser.close();
  process.exit(1);
}
