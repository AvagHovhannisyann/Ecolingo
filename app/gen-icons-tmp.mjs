// One-off build-time icon generation script for D-020 Wave 2 Stream W.
// Uses `sharp` (already an optional dependency of `next` itself — no new
// package.json dependency added) to matte the Eco mascot out of its flat
// background, then compose PWA icons + favicon + apple-icon + OG/Twitter
// images on the app's dark navy theme surface (#131f24).
//
// Run once with `node gen-icons.mjs`; outputs are copied into the repo by
// the caller afterwards. Not part of the app's runtime or build.

import sharp from "sharp";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs/promises";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = "/home/user/Ecolingo/.claude/worktrees/agent-ab19e92434960883e/app";
const SRC_HERO = path.join(APP_DIR, "public/art-v2/eco-hero.webp");
const SRC_SCENE = path.join(APP_DIR, "public/art-v2/eco-hero-scene.webp");
const OUT_DIR = path.join(__dirname, "out");
const NAVY = { r: 0x13, g: 0x1f, b: 0x24 }; // #131f24, matches viewport.themeColor
const GREEN = { r: 0x58, g: 0xcc, b: 0x02 }; // brand accent (landing leaf mark)

await fs.mkdir(OUT_DIR, { recursive: true });

// ---------------------------------------------------------------------------
// 1. Matte the mascot: flood-fill the flat near-white (~238,238,238)
//    background from the image border inward (4-connected, color-distance
//    tolerance), so enclosed near-white details (eye highlights, belly
//    shine) are left untouched. Then feather the resulting hard mask with a
//    small blur so the silhouette edge is smooth, not jagged.
// ---------------------------------------------------------------------------
async function matteHero() {
  const { data, info } = await sharp(SRC_HERO).raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const bg = [238, 238, 238];
  const tol = 40;

  const dist = (i) => {
    const idx = i * channels;
    return Math.max(
      Math.abs(data[idx] - bg[0]),
      Math.abs(data[idx + 1] - bg[1]),
      Math.abs(data[idx + 2] - bg[2])
    );
  };

  const isBgColor = new Uint8Array(width * height); // 1 if within tol of bg color
  for (let i = 0; i < width * height; i++) isBgColor[i] = dist(i) <= tol ? 1 : 0;

  // Flood fill (BFS) starting from every border pixel that is bg-colored.
  const visited = new Uint8Array(width * height);
  const removed = new Uint8Array(width * height); // 1 = background, becomes transparent
  const queue = new Int32Array(width * height);
  let qHead = 0;
  let qTail = 0;

  const pushIfBg = (x, y) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    const i = y * width + x;
    if (visited[i]) return;
    visited[i] = 1;
    if (isBgColor[i]) {
      removed[i] = 1;
      queue[qTail++] = i;
    }
  };

  for (let x = 0; x < width; x++) {
    pushIfBg(x, 0);
    pushIfBg(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    pushIfBg(0, y);
    pushIfBg(width - 1, y);
  }

  while (qHead < qTail) {
    const i = queue[qHead++];
    const x = i % width;
    const y = (i / width) | 0;
    pushIfBg(x + 1, y);
    pushIfBg(x - 1, y);
    pushIfBg(x, y + 1);
    pushIfBg(x, y - 1);
  }

  const alpha = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) alpha[i] = removed[i] ? 0 : 255;

  // Compose RGBA raw buffer, then let sharp blur just the alpha channel for
  // antialiased edges (avoids a hard jagged silhouette from the flood fill).
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const s = i * channels;
    const d = i * 4;
    rgba[d] = data[s];
    rgba[d + 1] = data[s + 1];
    rgba[d + 2] = data[s + 2];
    rgba[d + 3] = alpha[i];
  }

  const matted = sharp(rgba, { raw: { width, height, channels: 4 } });
  // Slight blur on alpha only: extract alpha, blur, re-join.
  const alphaBlurred = await sharp(Buffer.from(alpha), {
    raw: { width, height, channels: 1 },
  })
    .blur(1.1)
    .extractChannel(0)
    .raw()
    .toBuffer();

  const finalRgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const d = i * 4;
    finalRgba[d] = rgba[d];
    finalRgba[d + 1] = rgba[d + 1];
    finalRgba[d + 2] = rgba[d + 2];
    finalRgba[d + 3] = alphaBlurred[i];
  }

  let img = sharp(finalRgba, { raw: { width, height, channels: 4 } }).png();
  const buf = await img.toBuffer();
  await fs.writeFile(path.join(OUT_DIR, "matted-1024.png"), buf);

  // Compute tight bounding box (alpha > 12) for cropping.
  let minX = width, minY = height, maxX = 0, maxY = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (alphaBlurred[i] > 12) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  // Small breathing margin around the tight silhouette.
  const pad = Math.round(0.02 * width);
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(width - 1, maxX + pad);
  maxY = Math.min(height - 1, maxY + pad);
  const bw = maxX - minX + 1;
  const bh = maxY - minY + 1;

  console.log("bbox", { minX, minY, bw, bh });

  const cropped = await sharp(finalRgba, { raw: { width, height, channels: 4 } })
    .extract({ left: minX, top: minY, width: bw, height: bh })
    .png()
    .toBuffer();
  await fs.writeFile(path.join(OUT_DIR, "matted-cropped.png"), cropped);

  return { cropped, bw, bh };
}

// ---------------------------------------------------------------------------
// 2. Compose an icon canvas: navy square background + mascot centered at a
//    given fraction of canvas size (uniform scale by the larger dimension).
// ---------------------------------------------------------------------------
async function composeIcon({ cropped, bw, bh }, size, contentFraction, outPath) {
  const targetMax = Math.round(size * contentFraction);
  const scale = targetMax / Math.max(bw, bh);
  const rw = Math.max(1, Math.round(bw * scale));
  const rh = Math.max(1, Math.round(bh * scale));

  const resizedMascot = await sharp(cropped).resize(rw, rh).png().toBuffer();

  const left = Math.round((size - rw) / 2);
  const top = Math.round((size - rh) / 2);

  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { ...NAVY, alpha: 1 },
    },
  })
    .composite([{ input: resizedMascot, left, top }])
    .png()
    .toFile(outPath);
}

// ---------------------------------------------------------------------------
// 3. Compose the OG / Twitter share image (1200x630): navy background,
//    eco-hero-scene.webp letterboxed on the right as an ambient backdrop,
//    dark overlay for contrast, mascot cutout + wordmark/tagline on the left.
// ---------------------------------------------------------------------------
// Clamp a layer + its intended (left, top) offset so it fits fully inside a
// WxH canvas, cropping the overflow off the source buffer as needed. Sharp's
// composite() refuses layers that would extend past canvas bounds.
async function clampToCanvas(inputBuffer, left, top, W, H) {
  const meta = await sharp(inputBuffer).metadata();
  let srcLeft = 0;
  let srcTop = 0;
  let dstLeft = left;
  let dstTop = top;
  let w = meta.width;
  let h = meta.height;

  if (dstLeft < 0) {
    srcLeft = -dstLeft;
    w -= srcLeft;
    dstLeft = 0;
  }
  if (dstTop < 0) {
    srcTop = -dstTop;
    h -= srcTop;
    dstTop = 0;
  }
  if (dstLeft + w > W) w = W - dstLeft;
  if (dstTop + h > H) h = H - dstTop;

  const cropped = await sharp(inputBuffer)
    .extract({ left: srcLeft, top: srcTop, width: w, height: h })
    .png()
    .toBuffer();
  return { input: cropped, left: dstLeft, top: dstTop };
}

async function composeOgImage({ cropped, bw, bh }) {
  const W = 1200;
  const H = 630;

  // Full-bleed backdrop: eco-hero-scene.webp cover-cropped to the full
  // canvas (letterboxed to the 1200x630 frame — its own 1376x768 aspect is
  // close enough to 1.905:1 that a cover-fit only trims a sliver off the
  // sides, no distortion).
  const sceneCovered = await sharp(SRC_SCENE)
    .resize(W, H, { fit: "cover", position: "centre" })
    .png()
    .toBuffer();

  // Base navy canvas.
  let canvas = sharp({
    create: { width: W, height: H, channels: 4, background: { ...NAVY, alpha: 1 } },
  });

  // Smooth horizontal scrim: solid navy behind the left text column,
  // gradually revealing a navy-tinted glimpse of the scene toward the right
  // edge. A gradient avoids any hard panel-edge box.
  const navyHex = "#131f24";
  const scrimSvg = `
  <svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="scrim" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="${navyHex}" stop-opacity="1" />
        <stop offset="50%" stop-color="${navyHex}" stop-opacity="1" />
        <stop offset="72%" stop-color="${navyHex}" stop-opacity="0.93" />
        <stop offset="100%" stop-color="${navyHex}" stop-opacity="0.8" />
      </linearGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#scrim)" />
  </svg>`;
  const scrim = await sharp(Buffer.from(scrimSvg)).png().toBuffer();

  // Soft green accent glow behind the mascot cutout — canvas is much larger
  // than the circle so the blur fully fades to transparent with no visible
  // boundary.
  const glowCanvas = 620;
  const glowRadius = 150;
  const glow = await sharp({
    create: { width: glowCanvas, height: glowCanvas, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([
      {
        input: Buffer.from(
          `<svg width="${glowCanvas}" height="${glowCanvas}"><circle cx="${glowCanvas / 2}" cy="${glowCanvas / 2}" r="${glowRadius}" fill="rgba(88,204,2,0.55)" /></svg>`
        ),
        left: 0,
        top: 0,
      },
    ])
    .blur(70)
    .png()
    .toBuffer();

  // Mascot cutout, anchored bottom-right.
  const mascotTargetH = 470;
  const mascotScale = mascotTargetH / bh;
  const mascotW = Math.round(bw * mascotScale);
  const mascotH = Math.round(bh * mascotScale);
  const mascotResized = await sharp(cropped).resize(mascotW, mascotH).png().toBuffer();

  const mascotLeft = W - mascotW - 90;
  const mascotTop = H - mascotH - 34;
  const glowLeft = mascotLeft + Math.round(mascotW / 2) - Math.round(glowCanvas / 2);
  const glowTop = mascotTop + Math.round(mascotH / 2) - Math.round(glowCanvas / 2) + 20;

  // Wordmark + tagline, rendered as crisp SVG text (code-rendered, not
  // AI-generated pixel text) on the left text column.
  const textSvg = `
  <svg width="620" height="630" xmlns="http://www.w3.org/2000/svg">
    <style>
      .word { font-family: 'DejaVu Sans', 'Arial', sans-serif; font-weight: 800; font-size: 84px; fill: #f4f7f5; }
      .tag  { font-family: 'DejaVu Sans', 'Arial', sans-serif; font-weight: 500; font-size: 34px; fill: #b9c4c2; }
      .leaf { fill: #58cc02; stroke: #3f9600; stroke-width: 3; }
    </style>
    <g transform="translate(64,236)">
      <path class="leaf" d="M40 40 C10 5 -30 5 -55 30 C-25 55 15 55 40 40 Z" transform="translate(20,-10) rotate(-18)"/>
      <text x="0" y="60" class="word">ecolingo</text>
      <text x="4" y="120" class="tag">hard ideas. made intuitive.</text>
    </g>
  </svg>`;

  const glowLayer = await clampToCanvas(glow, glowLeft, glowTop, W, H);

  canvas = canvas.composite([
    { input: sceneCovered, left: 0, top: 0 },
    { input: scrim, left: 0, top: 0 },
    glowLayer,
    { input: mascotResized, left: mascotLeft, top: mascotTop },
    { input: Buffer.from(textSvg), left: 0, top: 0 },
  ]);

  await canvas.png().toFile(path.join(OUT_DIR, "opengraph-image.png"));
}

const matte = await matteHero();
await composeIcon(matte, 192, 0.8, path.join(OUT_DIR, "icon-192.png"));
await composeIcon(matte, 512, 0.8, path.join(OUT_DIR, "icon-512.png"));

// Maskable safe-zone math: worst case is the bbox corner touching the 40%
// safe-zone radius circle, i.e. scale*diag(bbox)/2 <= 0.4*size.
function maskableFraction(bw, bh) {
  const diag = Math.sqrt(bw * bw + bh * bh);
  const maxDim = Math.max(bw, bh);
  // fraction applied to the max dimension by composeIcon's contentFraction API
  const safeScale = (0.8 * 1) / diag; // scale needed per unit size
  return safeScale * maxDim; // contentFraction relative to max(bw,bh)
}
const maskFrac = maskableFraction(matte.bw, matte.bh);
console.log("maskable content fraction:", maskFrac);
await composeIcon(matte, 192, maskFrac, path.join(OUT_DIR, "icon-maskable-192.png"));
await composeIcon(matte, 512, maskFrac, path.join(OUT_DIR, "icon-maskable-512.png"));

// Favicon / apple-icon source (512, will be downsized further for .ico).
await composeIcon(matte, 512, 0.8, path.join(OUT_DIR, "favicon-source-512.png"));
await composeIcon(matte, 180, 0.82, path.join(OUT_DIR, "apple-icon-180.png"));

await composeOgImage(matte);

console.log("done");
