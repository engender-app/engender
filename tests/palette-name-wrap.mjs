/* Palette names under the flags in Settings (pre-publish ticket 03).

   A name is one word or two, and a word is never broken: the Polish
   picker showed "Transpłciow / a" at phone width, because the grid's names
   wrapped with overflow-wrap: anywhere. Every name, both languages, at
   the widths a phone gives, must either fit its column or wrap between
   words, and must not paint past its own flag into the next column.

   Run: node tests/palette-name-wrap.mjs   (dev server, no build needed) */
import { realpathSync } from 'node:fs';
import { createServer } from 'vite';
import { launchChromium, setAppLanguage, settlePage } from './browser-harness.mjs';

const WIDTHS = [320, 360, 390, 430];

const server = await createServer({ server: { port: 0, fs: { allow: [process.cwd(), realpathSync('node_modules')] } } });
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await launchChromium();
const failures = [];

/** Each name: where its lines break, and how far its words reach past the flag above it. */
const readNames = () =>
  [...document.querySelectorAll('.palette-grid [data-palette-pick]')].map((button) => {
    const name = /** @type {HTMLElement} */ (button.querySelector('.swatch-name'));
    const flag = /** @type {HTMLElement} */ (button.querySelector('.swatch-preview')).getBoundingClientRect();
    const text = /** @type {Text} */ (name.firstChild);
    const value = text.textContent ?? '';
    const range = document.createRange();
    const tops = [];
    let right = -Infinity;
    for (let i = 0; i < value.length; i++) {
      range.setStart(text, i);
      range.setEnd(text, i + 1);
      const rect = range.getClientRects()[0];
      tops.push(rect ? Math.round(rect.top) : null);
      if (rect && value[i] !== ' ') right = Math.max(right, rect.right);
    }
    const breaks = [];
    for (let i = 1; i < value.length; i++) {
      if (tops[i] === null || tops[i - 1] === null || tops[i] === tops[i - 1]) continue;
      if (value[i] !== ' ' && value[i - 1] !== ' ') breaks.push(`${value.slice(0, i)} / ${value.slice(i)}`);
    }
    return { key: /** @type {HTMLElement} */ (button).dataset.palettePick, value, breaks, overhang: right - flag.right, column: flag.width, columns: getComputedStyle(button.parentElement).gridTemplateColumns.split(' ').length };
  });

try {
  for (const locale of ['en', 'pl']) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    await settlePage(page, base, '/settings', 'light');
    if (locale === 'pl') await setAppLanguage(page, 'pl');
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 844 });
      await settlePage(page, base, '/settings', 'light');
      await page.waitForSelector('.palette-grid [data-palette-pick]');
      await page.evaluate(() => document.fonts.ready);
      const names = await page.evaluate(readNames);
      if (names.length !== 16) failures.push(`${locale} ${width}px: expected 16 palettes, found ${names.length}`);
      for (const { value, breaks, overhang } of names) {
        for (const at of breaks) failures.push(`${locale} ${width}px: "${value}" breaks inside a word as "${at}"`);
        if (overhang > 0.5) failures.push(`${locale} ${width}px: "${value}" runs ${overhang.toFixed(1)}px past its flag`);
      }
      const tightest = names.reduce((a, b) => (a.overhang >= b.overhang ? a : b));
      console.log(`${locale} ${width}px: ${tightest.columns} columns of ${tightest.column.toFixed(1)}px, tightest "${tightest.value}" ${(-tightest.overhang).toFixed(1)}px to spare`);
    }
    await context.close();
  }
} finally {
  await browser.close();
  await server.close();
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('palette names: no word broken, none past its flag');
