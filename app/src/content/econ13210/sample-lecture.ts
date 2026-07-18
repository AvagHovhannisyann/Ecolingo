/**
 * Sample lecture notes for demoing the Phase 2 ingestion flow without a real
 * upload. Written in the voice of typical ECON 13210 lecture notes; the
 * teacher can just as well upload their own .md/.txt file.
 */

export const SAMPLE_LECTURE_TITLE = "Lecture 4 — The Solow Growth Model";

export const SAMPLE_LECTURE_MD = `# The production function in per-worker form

We write output per worker as y = f(k), where k is capital per worker. The
production function has diminishing returns: each extra unit of capital per
worker raises output per worker by less than the one before. With Cobb-Douglas
technology, f(k) = A k^alpha, where alpha is the capital share of output.

Key point for the exam: diminishing returns to capital is what makes the rest
of the model work — without it there would be no steady state.

# The fundamental equation of the Solow model

The change in capital per worker equals actual investment minus break-even
investment. Actual investment is s f(k): the fraction of output per worker
that is saved and invested. Break-even investment is (n + delta) k: the
investment required to replace depreciated capital (delta) and to equip new
workers as the population grows (n).

When actual investment exceeds break-even investment, capital per worker
rises. When it falls short, capital per worker falls. This single equation
drives the whole model.

# The steady state

The steady state is the level of capital per worker, k-star, at which actual
investment exactly equals break-even investment, so capital per worker stops
changing. Output per worker is then constant too. Countries far below their
steady state grow quickly; growth slows as they approach it. A change in the
saving rate changes the steady state level, not the long-run growth rate.

# The Golden Rule of saving

Among all possible saving rates, the Golden Rule saving rate is the one that
maximizes steady-state consumption per worker — not output. Saving more than
the Golden Rule means workers consume less forever, even though output is
higher. For a Cobb-Douglas production function the Golden Rule saving rate
equals the capital share alpha.
`;
