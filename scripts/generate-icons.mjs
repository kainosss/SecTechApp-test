/**
 * Renders the Fieldwise app icons (PWA, Apple touch, favicon) from the
 * existing logo mark: the signal waveform on a teal-tinted tile. Run manually
 * after changing the mark: `node scripts/generate-icons.mjs` (uses the
 * pre-installed Playwright Chromium). Output is committed in public/icons.
 */
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const OUT = join(process.cwd(), "public/icons");

const INK = "#060b16";
const TILE = "#0b2a2b"; // signal-500 at ~15 % over ink-950, as in the logo tile
const RING = "#2a8f84";
const SIGNAL = "#3fd9c2";
const WAVE = "M3 12h3l2-5 3 10 3-10 2 5h5"; // the Logo path (24 × 24 view box)

/** `pad` is the share of the canvas left around the tile (maskable icons need a wide safe zone). */
function svg(pad, { rounded = true } = {}) {
  const tile = 100 - pad * 2;
  const r = rounded ? 22 : 0;
  const s = tile / 24 * 0.62;
  const off = pad + (tile - 24 * s) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" ${rounded && pad === 0 ? `rx="${r}"` : ""} fill="${pad === 0 ? TILE : INK}"/>
  ${pad > 0 ? `<rect x="${pad}" y="${pad}" width="${tile}" height="${tile}" rx="${tile * 0.22}" fill="${TILE}" stroke="${RING}" stroke-width="${tile * 0.02}"/>` : ""}
  <path d="${WAVE}" transform="translate(${off} ${off}) scale(${s})" fill="none" stroke="${SIGNAL}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
}

const ICONS = [
  { file: "icon-192.png", size: 192, svg: svg(6) },
  { file: "icon-512.png", size: 512, svg: svg(6) },
  // Maskable: full-bleed background, mark inside the central 80 % safe zone.
  { file: "icon-maskable-512.png", size: 512, svg: svg(16) },
  // iOS applies its own rounded mask, so the Apple icon is square and full-bleed.
  { file: "apple-touch-icon.png", size: 180, svg: svg(10) },
  { file: "favicon-32.png", size: 32, svg: svg(0) },
];

writeFileSync(join(OUT, "icon.svg"), svg(0));
const browser = await chromium.launch();
const page = await browser.newPage();
for (const icon of ICONS) {
  await page.setViewportSize({ width: icon.size, height: icon.size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${icon.svg.replace("<svg ", `<svg width="${icon.size}" height="${icon.size}" `)}</body></html>`);
  await page.locator("svg").screenshot({ path: join(OUT, icon.file), omitBackground: true });
}
await browser.close();
console.log(`Wrote ${ICONS.length + 1} icons to public/icons`);
