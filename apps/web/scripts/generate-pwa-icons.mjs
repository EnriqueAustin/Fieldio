// Generates the Fieldio PWA icon set from a single SVG source.
//
// PLACEHOLDER BRANDING: the mark below (an "F" with a droplet counter on a
// blue→indigo gradient) is a generated placeholder that mirrors the in-app
// brand tile (blue-500 → indigo-600). It is NOT an official Fieldio logo.
// Replace src/pwa-icon.source.svg (or these outputs) with a real brand asset
// before shipping to production stores.
//
// Run: node scripts/generate-pwa-icons.mjs
// Requires: sharp (present in the monorepo root node_modules).

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync } from 'node:fs';

const require = createRequire(import.meta.url);
const sharp = require('sharp');

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', 'public', 'icons');
mkdirSync(outDir, { recursive: true });

// Brand gradient pulled from globals.css / dashboard brand tile.
const GRAD_FROM = '#3b82f6'; // blue-500
const GRAD_TO = '#4f46e5'; // indigo-600
const INK = '#ffffff';

/**
 * Build the logo glyph SVG. `pad` is the fraction of the canvas kept as safe
 * margin on every side (used for maskable icons, which get clipped to a circle
 * on Android). `radius` controls corner rounding of the background plate.
 */
function iconSvg({ size, pad = 0, rounded = true }) {
    const inset = Math.round(size * pad);
    const plate = size - inset * 2;
    const r = rounded ? Math.round(plate * 0.22) : 0;
    // Glyph geometry inside the plate.
    const cx = inset + plate / 2;
    const fx = inset + plate * 0.34;
    const top = inset + plate * 0.26;
    const stemW = plate * 0.12;
    const barW = plate * 0.30;
    const gap = plate * 0.16;
    const fH = plate * 0.48;
    // droplet accent
    const dcx = inset + plate * 0.70;
    const dcy = inset + plate * 0.66;
    const dr = plate * 0.11;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${GRAD_FROM}"/>
      <stop offset="1" stop-color="${GRAD_TO}"/>
    </linearGradient>
  </defs>
  <rect x="${inset}" y="${inset}" width="${plate}" height="${plate}" rx="${r}" ry="${r}" fill="url(#g)"/>
  <g fill="${INK}">
    <rect x="${fx}" y="${top}" width="${stemW}" height="${fH}" rx="${stemW * 0.3}"/>
    <rect x="${fx}" y="${top}" width="${barW}" height="${stemW}" rx="${stemW * 0.3}"/>
    <rect x="${fx}" y="${top + gap + stemW}" width="${barW * 0.78}" height="${stemW}" rx="${stemW * 0.3}"/>
    <path d="M ${dcx} ${dcy - dr * 1.4} C ${dcx + dr} ${dcy - dr * 0.2}, ${dcx + dr} ${dcy + dr}, ${dcx} ${dcy + dr}
             C ${dcx - dr} ${dcy + dr}, ${dcx - dr} ${dcy - dr * 0.2}, ${dcx} ${dcy - dr * 1.4} Z" opacity="0.9"/>
  </g>
  <text x="${cx}" y="0" font-size="0" fill="none">F</text>
</svg>`;
}

async function png(svg, size, file) {
    await sharp(Buffer.from(svg)).png().resize(size, size).toFile(join(outDir, file));
    console.log('wrote', file);
}

const targets = [
    { file: 'icon-192.png', size: 192, pad: 0, rounded: true },
    { file: 'icon-512.png', size: 512, pad: 0, rounded: true },
    // Maskable icons: keep the glyph inside a ~20% safe zone, full-bleed plate.
    { file: 'icon-maskable-192.png', size: 192, pad: 0.14, rounded: false, fullBleed: true },
    { file: 'icon-maskable-512.png', size: 512, pad: 0.14, rounded: false, fullBleed: true },
    // Apple touch icon (iOS applies its own rounding/masking).
    { file: 'apple-touch-icon.png', size: 180, pad: 0, rounded: true },
];

for (const t of targets) {
    // For maskable, paint a full-bleed gradient plate, then the padded glyph.
    let svg;
    if (t.fullBleed) {
        const glyph = iconSvg({ size: t.size, pad: t.pad, rounded: false });
        svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${t.size}" height="${t.size}" viewBox="0 0 ${t.size} ${t.size}">
  <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="${GRAD_FROM}"/><stop offset="1" stop-color="${GRAD_TO}"/>
  </linearGradient></defs>
  <rect width="${t.size}" height="${t.size}" fill="url(#bg)"/>
  ${glyph}
</svg>`;
    } else {
        svg = iconSvg({ size: t.size, pad: t.pad, rounded: t.rounded });
    }
    await png(svg, t.size, t.file);
}

// A monochrome-ish favicon too (32 & 16 folded into one 32 png).
await png(iconSvg({ size: 32, pad: 0, rounded: true }), 32, 'favicon-32.png');

console.log('Done. Icons in public/icons/');
