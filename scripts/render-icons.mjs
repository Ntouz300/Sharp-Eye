// Génère les icônes PNG de l'application à partir de public/icons/icon.svg (Playwright + Chromium).
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

// Playwright est fourni par l'environnement (NODE_PATH) ou installé localement.
const { chromium } = createRequire(import.meta.url)('playwright');

const svg = readFileSync('public/icons/icon.svg', 'utf8');
const browser = await chromium.launch();
const page = await browser.newPage();
const sizes = [
  ['icon-192.png', 192, false],
  ['icon-512.png', 512, false],
  ['apple-touch-icon.png', 180, false],
  ['icon-maskable-512.png', 512, true],
];
for (const [name, size, maskable] of sizes) {
  // Icône « maskable » : fond plein jusqu'aux bords et motif réduit dans la zone sûre.
  const inner = maskable ? `<div style="width:${size}px;height:${size}px;background:#0B1626;display:grid;place-items:center">${svg.replace('<svg', `<svg width="${size * 0.8}" height="${size * 0.8}"`).replace('rx="112"', 'rx="0"')}</div>` : svg.replace('<svg', `<svg width="${size}" height="${size}"`).replace(maskable ? '' : 'rx="112"', size === 180 ? 'rx="0"' : 'rx="112"');
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${inner}</body></html>`);
  await page.screenshot({ path: `public/icons/${name}`, omitBackground: true });
}
await browser.close();
console.log('icônes générées');
