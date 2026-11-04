// Regenerates the PWA icons from the NestFund house mark. Run with: npm run icons
// Needs `sharp` (installed as an optional dependency of Next.js). The generated PNGs are committed, so this is only
// needed when the artwork changes.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const root = path.resolve(import.meta.dirname, '..', 'public');
fs.mkdirSync(path.join(root, 'icons'), { recursive: true });

const GREEN = '#059669';
const mark = `
  <path d="M14 32 32 16l18 16" fill="none" stroke="#ecfdf5" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M20 30v16h24V30" fill="none" stroke="#ecfdf5" stroke-width="5" stroke-linejoin="round"/>
  <circle cx="32" cy="38" r="5" fill="#fbbf24"/>`;

/** `radius`: corner radius of the tile (0 = full-bleed square, which maskable and iOS icons need). `scale`: size of the mark. */
const svg = ({ radius, scale }) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="${radius}" fill="${GREEN}"/>
  <g transform="translate(32 31) scale(${scale}) translate(-32 -31)">${mark}</g>
</svg>`;

const targets = [
  // "any" icons: the rounded tile, as in icon.svg.
  { file: 'icons/icon-192.png', size: 192, radius: 14, scale: 1 },
  { file: 'icons/icon-512.png', size: 512, radius: 14, scale: 1 },
  // Maskable: full-bleed, with the mark inside the central 80% "safe zone" so any mask shape keeps it intact.
  { file: 'icons/maskable-512.png', size: 512, radius: 0, scale: 0.78 },
  // iOS home screen: opaque square (iOS rounds it itself).
  { file: 'apple-touch-icon.png', size: 180, radius: 0, scale: 1.05 },
];

for (const t of targets) {
  await sharp(Buffer.from(svg(t)), { density: 384 })
    .resize(t.size, t.size)
    .flatten(t.radius === 0 ? { background: GREEN } : false) // the full-bleed icons must be fully opaque
    .png({ compressionLevel: 9 })
    .toFile(path.join(root, t.file));
  console.log('wrote', t.file);
}
