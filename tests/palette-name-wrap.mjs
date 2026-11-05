/* Palette names under the flags in Settings and setup (pre-publish ticket 03).

   The grid is four flags across at every phone width. A name is one word
   or two, and a word is never broken: the Polish picker showed
   "Transpłciow / a" at 360px, because the grid's names wrapped with
   overflow-wrap: anywhere. A three-column grid kept the words whole but
   left the sixteenth flag alone on its last row, which Alicja rejected
   (2026-11-04). So a name whose longest word does not fit its column
   steps its type down from --text-xs, as far as 0.75 of it (9px); a name that
   fits keeps --text-xs. Every name, both languages, at the widths a phone
   gives: no break inside a word, four columns, the type size as small as
   the name needs and no smaller, and nothing painted past its own flag.
   At 320px "Panseksualna" needs 9.3px, which the 9px floor allows.

   Setup's flags arrive row by row (onboarding's .setup-flags stagger),
   so the same sweep reads each flag's wipe delay there and checks that
   the flags sharing a visual row share a delay and every row waits
   longer than the one above it. And in both places the first frame the
   grid paints already carries each name's settled size.

   Run: node tests/palette-name-wrap.mjs   (dev server, no build needed) */
import { realpathSync } from 'node:fs';
import { createServer } from 'vite';
import { launchChromium, setAppLanguage, settlePage, untilSplashLets } from './browser-harness.mjs';

/* Four across on a phone; eight across from the 1024px desktop layout up. */
const WIDTHS = [[320, 4], [360, 4], [390, 4], [430, 4], [1280, 8]];
const FLOOR = 0.75;
/* Nothing may reach past its own flag, even by a pixel (sub-pixel noise
   only): at 320px a column is 58.5px and "Panseksualna" needs 9.3px type
   to fit it, so the floor sits under that. */
const OVERHANG = 0.25;

const server = await createServer({ server: { port: 0, fs: { allow: [process.cwd(), realpathSync('node_modules')] } } });
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await launchChromium();
const failures = [];

/** Each name: where its lines break, how far it reaches past its flag,
 *  its type size against --text-xs, and how wide its longest word sets at
 *  --text-xs. */
const readNames = () => {
  const grid = /** @type {HTMLElement} */ (document.querySelector('.palette-grid'));
  const ruler = document.createElement('span');
  ruler.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;font-size:var(--text-xs)';
  grid.append(ruler);
  const xs = parseFloat(getComputedStyle(ruler).fontSize);
  const names = [...grid.querySelectorAll('[data-palette-pick]')].map((button) => {
    const name = /** @type {HTMLElement} */ (button.querySelector('.swatch-name'));
    const style = getComputedStyle(name);
    ruler.style.fontFamily = style.fontFamily;
    ruler.style.fontWeight = style.fontWeight;
    const flag = /** @type {HTMLElement} */ (button.querySelector('.swatch-preview')).getBoundingClientRect();
    const text = /** @type {Text} */ (name.firstChild);
    const value = text.textContent ?? '';
    const word = Math.max(...value.split(' ').map((w) => ((ruler.textContent = w), ruler.getBoundingClientRect().width)));
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
    const delay = parseFloat(getComputedStyle(/** @type {HTMLElement} */ (button.querySelector('.swatch-preview'))).animationDelay);
    return { value, breaks, overhang: right - flag.right, column: flag.width, top: Math.round(flag.top), size: parseFloat(style.fontSize), xs, word, delay };
  });
  ruler.remove();
  return { names, columns: getComputedStyle(grid).gridTemplateColumns.split(' ').length };
};

/** @param {string} where @param {number} expected @param {Awaited<ReturnType<typeof readNames>>} read */
function checkNames(where, expected, { names, columns }) {
  if (names.length !== 16) failures.push(`${where}: expected 16 palettes, found ${names.length}`);
  if (columns !== expected) failures.push(`${where}: ${columns} columns, expected ${expected}`);
  for (const { value, breaks, overhang, column, size, xs, word } of names) {
    for (const at of breaks) failures.push(`${where}: "${value}" breaks inside a word as "${at}"`);
    if (overhang > OVERHANG) failures.push(`${where}: "${value}" runs ${overhang.toFixed(1)}px past its flag at ${size.toFixed(2)}px`);
    if (word <= column && Math.abs(size - xs) > 0.05) failures.push(`${where}: "${value}" fits at ${xs}px but is set at ${size.toFixed(2)}px`);
    if (size < xs * FLOOR - 0.05) failures.push(`${where}: "${value}" is set at ${size.toFixed(2)}px, under the ${(xs * FLOOR).toFixed(2)}px floor`);
  }
  const tightest = names.reduce((a, b) => (a.overhang >= b.overhang ? a : b));
  const smallest = names.reduce((a, b) => (a.size <= b.size ? a : b));
  console.log(`${where}: ${columns} columns of ${tightest.column.toFixed(1)}px, tightest "${tightest.value}" ${(-tightest.overhang).toFixed(1)}px to spare, smallest "${smallest.value}" at ${smallest.size.toFixed(2)}px`);
}

/* The type size a name paints with on the first frame its grid is on
   screen. paletteNameFit measures before that frame, so the first paint
   must already be the settled size: a name painted at --text-xs and then
   stepped down is a jump. */
const FIRST_FRAME = `(() => {
  const tick = () => {
    const names = document.querySelectorAll('.palette-grid .swatch-name');
    if (names.length) window.__firstNameSizes = [...names].map((n) => parseFloat(getComputedStyle(n).fontSize));
    else requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
})()`;

/** @param {string} where @param {import('playwright-core').Page} page @param {Awaited<ReturnType<typeof readNames>>} read */
async function checkFirstFrame(where, page, { names }) {
  const first = /** @type {number[] | undefined} */ (await page.evaluate(() => /** @type {any} */ (window).__firstNameSizes));
  if (!first) return void failures.push(`${where}: no first frame of the grid was sampled`);
  names.forEach(({ value, size }, i) => {
    if (Math.abs(first[i] - size) > 0.05) failures.push(`${where}: "${value}" first painted at ${first[i].toFixed(2)}px, then ${size.toFixed(2)}px`);
  });
}

/** Flags in one visual row share a wipe delay, and each row waits longer
 *  than the row above it. @param {string} where @param {Awaited<ReturnType<typeof readNames>>} read */
function checkStagger(where, { names }) {
  /** @type {Map<number, number[]>} */
  const rows = new Map();
  for (const { top, delay } of names) rows.set(top, [...(rows.get(top) ?? []), delay]);
  const ordered = [...rows.entries()].sort((a, b) => a[0] - b[0]).map(([, delays]) => delays);
  ordered.forEach((delays, row) => {
    if (new Set(delays).size !== 1) failures.push(`${where}: visual row ${row + 1} wipes in at ${delays.join('/')}s, not together`);
    if (row > 0 && Math.min(...delays) <= Math.max(...ordered[row - 1])) failures.push(`${where}: visual row ${row + 1} (${delays.join('/')}s) does not wait for row ${row} (${ordered[row - 1].join('/')}s)`);
  });
  console.log(`${where}: stagger ${ordered.map((d) => `${d.length}@${d[0]}s`).join(' ')}`);
}

try {
  for (const locale of ['en', 'pl']) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    await context.addInitScript(FIRST_FRAME);
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    await settlePage(page, base, '/settings', 'light');
    if (locale === 'pl') await setAppLanguage(page, 'pl');
    for (const [width, columns] of WIDTHS) {
      await page.setViewportSize({ width, height: 844 });
      await settlePage(page, base, '/settings', 'light');
      await page.waitForSelector('.palette-grid [data-palette-pick]');
      await page.evaluate(() => document.fonts.ready);
      const settings = await page.evaluate(readNames);
      checkNames(`${locale} settings ${width}px`, columns, settings);
      await checkFirstFrame(`${locale} settings ${width}px`, page, settings);

      await page.goto(`${base}/onboarding`, { waitUntil: 'networkidle' });
      await untilSplashLets(page);
      await page.locator('[data-next]').click();
      await page.locator('[data-next]').click();
      await page.waitForSelector('.setup-flags [data-palette-pick]');
      await page.evaluate(() => document.fonts.ready);
      await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running' || a.effect?.getTiming().iterations === Infinity));
      const setup = await page.evaluate(readNames);
      checkNames(`${locale} setup ${width}px`, columns, setup);
      checkStagger(`${locale} setup ${width}px`, setup);
      await checkFirstFrame(`${locale} setup ${width}px`, page, setup);
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
console.log('palette names: four across, no word broken, none past its flag, smaller only where needed; setup rows wipe in together');
