/**
 * A tiny, subject-neutral sample document for the teacher workspace, so a
 * teacher can see how "upload material → sections → compile a course" works
 * without having a file handy. Deliberately generic (not tied to any shipped
 * course) — the platform has no built-in course; every course is the
 * teacher's own (D-022). Uses `#` headings so `sectionize` splits it into
 * several sections, exactly like a real upload.
 */

export const SAMPLE_MATERIAL_TITLE = "Sample notes — Photosynthesis";

export const SAMPLE_MATERIAL_MD = `# What photosynthesis is

Photosynthesis is how green plants, algae, and some bacteria turn light energy
into chemical energy. Carbon dioxide and water are combined, using energy from
sunlight, to produce glucose and release oxygen. The overall reaction is
6 CO2 + 6 H2O + light → C6H12O6 + 6 O2.

Key idea: photosynthesis stores energy in the bonds of glucose, which the
organism (and everything that eats it) can later release through respiration.

# The two stages

Photosynthesis happens in two linked stages. The light-dependent reactions
capture sunlight in the thylakoid membranes and use it to make ATP and NADPH,
splitting water and releasing oxygen as a by-product. The light-independent
reactions (the Calvin cycle) then use that ATP and NADPH to fix carbon dioxide
into glucose in the stroma.

The two stages depend on each other: the second stage cannot run without the
energy carriers produced by the first.

# Chlorophyll and light

Chlorophyll is the green pigment that absorbs light, mostly in the red and blue
parts of the spectrum, and reflects green — which is why leaves look green. The
absorbed light excites electrons, and that excitation is what ultimately powers
the whole process. Different accessory pigments widen the range of light a
plant can use.

# Why it matters

Photosynthesis is the base of almost every food chain and the source of the
oxygen in the atmosphere. The rate of photosynthesis rises with more light,
more carbon dioxide, and warmer temperatures — up to a point, after which
other factors become limiting.
`;
