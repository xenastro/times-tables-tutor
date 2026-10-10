// Generates the Ashra (عشرة) icons: a teal tile with "10" over "١٠" and a yellow accent.
// The digits are outlines of Baloo Bhaijaan 2 ExtraBold (SIL Open Font License), so the icons
// don't depend on fonts installed on the device. PNGs are rendered with Playwright's Chromium.
import { writeFileSync, mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const TEAL = '#0f8b8d';
const WHITE = '#ffffff';
const SUN = '#f7cf6e';

// Glyph outlines at font size 100, baseline at y = 0; box = [x, y, width, height].
const LATIN_10 = {
  d: 'M32.5-52.2L32.5-13.1L15.5-13.1L15.5-44.6L5.5-41.5Q4-42.5 2.5-44.3Q1-46.1 1-49.3L1-49.3Q1-55.3 8.3-57.7L8.3-57.7L19.5-61.5L23.2-61.5Q27.5-61.5 30-59Q32.5-56.5 32.5-52.2L32.5-52.2ZM15.5-7.2L15.5-26.4L32.5-26.4L32.5-0.1Q31.4 0.2 29.4 0.5Q27.3 0.8 24.9 0.8L24.9 0.8Q20 0.8 17.8-0.9Q15.5-2.6 15.5-7.2L15.5-7.2ZM79.3-30.4L79.3-30.4L79.3-30.4Q79.3-36.3 78.2-40.4Q77-44.5 74.8-46.7Q72.6-48.8 69.5-48.8L69.5-48.8Q66.4-48.8 64.3-46.7Q62.1-44.5 61.0-40.4Q59.9-36.3 59.9-30.4L59.9-30.4Q59.9-21 62.4-16.4Q64.9-11.9 69.5-11.9L69.5-11.9Q74.2-11.9 76.8-16.4Q79.3-21 79.3-30.4ZM69.6 1.6L69.6 1.6L69.6 1.6Q61.7 1.6 55.7-2Q49.6-5.6 46.2-12.7Q42.8-19.8 42.8-30.4L42.8-30.4Q42.8-40.7 46.2-47.8Q49.6-54.9 55.7-58.6Q61.7-62.3 69.6-62.3L69.6-62.3Q77.4-62.3 83.5-58.6Q89.5-54.9 93.0-47.8Q96.4-40.7 96.4-30.4L96.4-30.4Q96.4-19.8 93.0-12.7Q89.5-5.6 83.5-2Q77.4 1.6 69.6 1.6Z',
  box: [1, -62.3, 95.4, 63.9],
};
const ARABIC_10 = {
  d: 'M16.9 1L16.9 1Q13.4 1 11-0.6Q8.6-2.1 8.2-6.8L8.2-6.8L3.7-64.1Q4.8-64.5 7.8-65.2Q10.8-65.8 13.3-65.8L13.3-65.8Q22.3-65.8 22.6-58.7L22.6-58.7L25.3-0.5Q24.3-0.1 21.9 0.5Q19.5 1 16.9 1ZM46.2-22.4L46.2-22.4Q41.4-22.4 38.7-25.3Q36-28.1 36-32.5L36-32.5Q36-36.9 38.7-39.7Q41.4-42.5 46.2-42.5L46.2-42.5Q50.9-42.5 53.7-39.7Q56.4-36.9 56.4-32.5L56.4-32.5Q56.4-28.1 53.7-25.3Q50.9-22.4 46.2-22.4Z',
  box: [3.7, -65.8, 52.7, 66.8],
};

/** A glyph scaled to `height` and centred on (cx, cy), in the 100 × 100 icon space. */
function place(glyph, cx, cy, height, fill) {
  const [x, y, w, h] = glyph.box;
  const s = height / h;
  const tx = cx - (w * s) / 2 - x * s;
  const ty = cy - (h * s) / 2 - y * s;
  return `<path transform="translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${s.toFixed(4)})" fill="${fill}" d="${glyph.d}"/>`;
}

const svg = (body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${body}</svg>\n`;

/** The full mark. `zoom` < 1 shrinks it into the maskable safe zone; `rx` 0 means full bleed. */
function fullIcon({ rx, zoom = 1 }) {
  const mark = [
    place(LATIN_10, 50, 37, 30, WHITE),
    `<rect x="33" y="57" width="34" height="3" rx="1.5" fill="${WHITE}" opacity=".35"/>`,
    place(ARABIC_10, 50, 75.5, 22, SUN),
  ].join('');
  const body = zoom === 1 ? mark : `<g transform="translate(50 50) scale(${zoom}) translate(-50 -50)">${mark}</g>`;
  return svg(`<rect width="100" height="100" rx="${rx}" fill="${TEAL}"/>${body}`);
}

/** The browser tab is too small for both lines: just a bold "10". */
function tabIcon() {
  return svg(`<rect width="100" height="100" rx="22" fill="${TEAL}"/>${place(LATIN_10, 50, 50, 46, WHITE)}`);
}

async function toPng(browser, markup, size, file) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(
    `<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${markup}`,
  );
  writeFileSync(file, await page.screenshot({ omitBackground: true }));
  await page.close();
}

mkdirSync('public', { recursive: true });
writeFileSync('public/favicon.svg', tabIcon());
const browser = await chromium.launch();
await toPng(browser, fullIcon({ rx: 22 }), 192, 'public/icon-192.png');
await toPng(browser, fullIcon({ rx: 22 }), 512, 'public/icon-512.png');
await toPng(browser, fullIcon({ rx: 0, zoom: 0.8 }), 512, 'public/icon-maskable-512.png');
await toPng(browser, fullIcon({ rx: 0 }), 180, 'public/apple-touch-icon.png');
await browser.close();
console.log('icons written to public/');
