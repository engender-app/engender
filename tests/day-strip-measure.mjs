/* How tall the two schedule screens are, and what the strip's three cell
   states measure (phase 10 redesign ticket 44).

   The ticket's budget is a height: dilation captured at 4545px and wear at
   2839px on a demo build with every feature filled, and neither may exceed
   a third of that afterwards. So the number this prints is the scroll
   region's own scrollHeight - the app scrolls inside
   `[data-app-scroll-region]` rather than the document, so
   `document.scrollingElement` answers one viewport and nothing else.

   It also reads the strip: the three states have to be told apart by
   outline alone (no colour difference between expected-and-empty and
   not-expected), every cell has to be a 44px-or-larger target, and the
   contrast of the hairline against the page is the thing a palette could
   quietly lose. Colours are painted into a 1x1 canvas and read back rather
   than parsed out of `getComputedStyle`, which hands `color-mix()` back as
   an unresolved `oklab(...)` - every tinted surface in this app computes to
   one (tests/surgery-rail-measure.mjs hit the same wall).

   Run: VITE_DEMO=1 npm run build, then
   node tests/day-strip-measure.mjs [--tag before|after] */
import { mkdirSync, writeFileSync } from 'node:fs';
import { preview } from 'vite';
import { launchChromium } from './browser-harness.mjs';

const tag = process.argv.includes('--tag') ? process.argv[process.argv.indexOf('--tag') + 1] : 'after';
const OUT = '.claude/day-strip-shots';
mkdirSync(OUT, { recursive: true });

/* The ticket's own before-figures, measured for the door audit at tip
   01006745. A third of each is the budget. */
const BEFORE = { '/health/dilation': 4545, '/practice/wear': 2839 };

const app = await preview({ preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const browser = await launchChromium();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

const settle = async (path) => {
  await page.goto(base + path, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]');
  if (await page.locator('[data-leave-setup]').count()) {
    await page.locator('[data-leave-setup]').click();
    await page.waitForSelector('[data-home-hello]');
  }
  await page.waitForTimeout(600);
};

await settle('/');
await page.locator('[data-fill-every-feature]').click();
await page.waitForURL('**/more', { timeout: 180000 });
await page.waitForTimeout(2000);

await settle('/settings');
await page.locator('[data-palette-pick="trans"]').click();
await page.locator('[data-segment="light"]').click();
await page.waitForFunction(() => document.documentElement.dataset.theme === 'light');

const MEASURE = () => {
  const paint = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 1;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    return (css) => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, 1, 1);
      ctx.fillStyle = css;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
      return [r, g, b];
    };
  })();
  const lum = ([r, g, b]) => {
    const f = (v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (a, b) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };
  const groundOf = (el) => {
    for (let n = el.parentElement; n; n = n.parentElement) {
      const bg = getComputedStyle(n).backgroundColor;
      if (bg && bg !== 'transparent' && !bg.startsWith('rgba(0, 0, 0, 0)')) return paint(bg);
    }
    return paint(getComputedStyle(document.body).backgroundColor);
  };

  const region = document.querySelector('[data-app-scroll-region]');
  const cells = [...document.querySelectorAll('[data-week-cell]')].map((el) => {
    const cs = getComputedStyle(el);
    const box = el.getBoundingClientRect();
    return {
      state: el.dataset.cellState ?? 'n/a',
      w: Math.round(box.width),
      h: Math.round(box.height),
      border: cs.borderTopWidth,
      borderColor: paint(cs.borderTopColor).join(','),
      fill: paint(cs.backgroundColor).join(','),
      hairline: Math.round(ratio(paint(cs.borderTopColor), groundOf(el)) * 100) / 100
    };
  });
  return {
    height: region ? Math.round(region.scrollHeight) : null,
    overflow: region ? Math.round(region.scrollWidth - region.clientWidth) : null,
    cells
  };
};

const rows = [];
for (const theme of ['light', 'dark']) {
  await settle('/settings');
  await page.locator(`[data-segment="${theme}"]`).first().click();
  await page.waitForFunction((w) => document.documentElement.dataset.theme === w, theme);
  for (const path of ['/health/dilation', '/practice/wear']) {
    await settle(path);
    await page.waitForTimeout(900);
    rows.push({ path, theme, ...(await page.evaluate(MEASURE)) });
  }
}

let failures = 0;
for (const r of rows) {
  const budget = Math.round(BEFORE[r.path] / 3);
  const ok = tag === 'before' || r.height <= budget;
  if (!ok) failures++;
  process.stdout.write(
    `\n${tag}  ${r.path}  ${r.theme}\n  ${ok ? 'PASS' : 'FAIL'}  height ${r.height}px` +
      ` (was ${BEFORE[r.path]}px, a third of it is ${budget}px)\n`
  );
  if (r.overflow > 0) {
    failures++;
    process.stdout.write(`  FAIL  the scroll region overflows sideways by ${r.overflow}px\n`);
  }
  const byState = new Map();
  for (const c of r.cells) if (!byState.has(c.state)) byState.set(c.state, c);
  for (const [state, c] of byState) {
    const big = c.w >= 44 && c.h >= 44;
    process.stdout.write(
      `  ${big ? 'PASS' : 'note'}  cell ${state.padEnd(8)} ${c.w}x${c.h}` +
        `  border ${c.border} rgb(${c.borderColor}) at ${c.hairline}:1  fill rgb(${c.fill})\n`
    );
  }
  const logged = byState.get('logged');
  const expected = byState.get('expected');
  const off = byState.get('off');
  if (expected && off) {
    const sameFill = expected.fill === off.fill;
    const outlineDiffers = expected.borderColor !== off.borderColor || expected.border !== off.border;
    if (!sameFill || !outlineDiffers) failures++;
    process.stdout.write(
      `  ${sameFill && outlineDiffers ? 'PASS' : 'FAIL'}  expected vs not-expected:` +
        ` same fill ${sameFill}, differ by outline ${outlineDiffers}\n`
    );
  }
  if (logged && expected) {
    const differs = logged.fill !== expected.fill;
    if (!differs) failures++;
    process.stdout.write(`  ${differs ? 'PASS' : 'FAIL'}  a logged day is filled where an empty one is not\n`);
  }
}

writeFileSync(`${OUT}/measure-${tag}.json`, JSON.stringify(rows, null, 2));
process.stdout.write(`\n${failures} FAILURE(S)\n`);
await browser.close();
await app.httpServer.close();
process.exit(failures ? 1 : 0);
