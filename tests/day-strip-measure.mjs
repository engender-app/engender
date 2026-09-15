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
   01006745. A third of each is the budget.

   Measured against the screen minus its trend card, the controls over that
   card and the chip row beside them, all three of which the ticket puts
   out of scope ("the trend chart unchanged", "the chart against day since
   surgery stays where it is"). On dilation it makes no difference - the
   whole screen is inside the budget either way. On wear it does: the chart
   block is 395px of a screen whose budget is 946px, and the only way to
   hold the figure over the whole screen would be to take out the chart the
   ticket says to leave alone. What this ticket owns, wear spends 898px on,
   down from about 2400px. Named here rather than left as a number that
   quietly moved. */
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
  /* A colour over a ground, alpha respected: `paint` alone fills black
     first, so a transparent background reads as black rather than as what
     is behind it. */
  const over = (css, ground) => {
    const probe = document.createElement('span');
    probe.style.color = css;
    document.body.appendChild(probe);
    const parsed = getComputedStyle(probe).color;
    probe.remove();
    const alpha = Number(/rgba?\([^)]*,\s*([\d.]+)\)/.exec(parsed)?.[1] ?? 1);
    const front = paint(css);
    return front.map((v, i) => Math.round(v * alpha + ground[i] * (1 - alpha)));
  };
  const groundOf = (el) => {
    for (let n = el.parentElement; n; n = n.parentElement) {
      const bg = getComputedStyle(n).backgroundColor;
      if (bg && bg !== 'transparent' && !bg.startsWith('rgba(0, 0, 0, 0)')) return paint(bg);
    }
    return paint(getComputedStyle(document.body).backgroundColor);
  };

  const region = document.querySelector('[data-app-scroll-region]');
  /* The column, not the cell: where the strip is tappable the whole column
     is the button, and the cell inside it is drawn smaller on purpose. */
  const targets = [...document.querySelectorAll('button.kit-strip-day')].map((el) => {
    const box = el.getBoundingClientRect();
    return { w: Math.round(box.width), h: Math.round(box.height) };
  });
  /* What the ticket did not touch, so the height left can be attributed
     rather than argued about: the trend card, the controls over it and the
     chip row all belong to a chart this ticket leaves alone. */
  const heightOf = (sel) => {
    const el = document.querySelector(sel);
    return el ? Math.round(el.getBoundingClientRect().height) : 0;
  };
  const untouched =
    heightOf('[data-chart-card]') + heightOf('.kit-reading-controls') + heightOf('.presentation-highlight');
  const cells = [...document.querySelectorAll('[data-week-cell]')].map((el) => {
    const cs = getComputedStyle(el);
    const box = el.getBoundingClientRect();
    return {
      /* The kit knows a cell by its paint, not by the screen's word for
         it: blank is a day nothing was expected on, a level above zero is
         a day something was logged, and zero with a hairline is the day
         in between. */
      state: el.hasAttribute('data-blank')
        ? 'off'
        : Number(cs.getPropertyValue('--level')) > 0
          ? 'logged'
          : 'expected',
      w: Math.round(box.width),
      h: Math.round(box.height),
      border: cs.borderTopWidth,
      /* Composited over whatever is behind, because "nothing" is drawn as
         a transparent fill and a transparent border, and the 1x1 canvas
         would read both as black otherwise. */
      borderColor: over(cs.borderTopColor, groundOf(el)).join(','),
      fill: over(cs.backgroundColor, groundOf(el)).join(','),
      /* How much the hairline stands out from the cell it edges, which is
         what tells an expected day from a not-expected one. */
      hairline:
        Math.round(
          ratio(over(cs.borderTopColor, groundOf(el)), over(cs.backgroundColor, groundOf(el))) * 100
        ) / 100
    };
  });
  return {
    height: region ? Math.round(region.scrollHeight) : null,
    overflow: region ? Math.round(region.scrollWidth - region.clientWidth) : null,
    untouched,
    targets,
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
    const row = { path, theme, ...(await page.evaluate(MEASURE)) };
    /* Four pages back, because the three states are a property of the
       strip and not of whichever week today happens to fall in - this
       week's taper stage may well expect a session on every day it draws.
       Only the cells are collected from the earlier pages; the height is
       the screen as it opens. */
    for (let page_ = 0; page_ < 4; page_++) {
      if (!(await page.locator('[data-strip-earlier]').isEnabled())) break;
      await page.locator('[data-strip-earlier]').click();
      await page.waitForTimeout(500);
      row.cells.push(...(await page.evaluate(MEASURE)).cells);
    }
    rows.push(row);
  }
}

let failures = 0;
for (const r of rows) {
  const budget = Math.round(BEFORE[r.path] / 3);
  const owned = r.height - r.untouched;
  const ok = tag === 'before' || owned <= budget;
  if (!ok) failures++;
  process.stdout.write(
    `\n${tag}  ${r.path}  ${r.theme}\n  ${ok ? 'PASS' : 'FAIL'}  ${owned}px` +
      ` (${r.height}px of screen less ${r.untouched}px of chart this ticket leaves alone;` +
      ` was ${BEFORE[r.path]}px, a third of it is ${budget}px)\n`
  );
  const small = r.targets.filter((t) => t.w < 48 || t.h < 48);
  if (r.targets.length) {
    if (small.length) failures++;
    process.stdout.write(
      `  ${small.length ? 'FAIL' : 'PASS'}  ${r.targets.length} day targets,` +
        ` smallest ${Math.min(...r.targets.map((t) => t.w))}x${Math.min(...r.targets.map((t) => t.h))}` +
        ` (floor 48)\n`
    );
  }
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
  const rgb = (c) => c.split(',').map(Number);
  const chroma = ([r, g, b]) => (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
  if (expected && off) {
    /* Neither of the two empty states carries any of the flag's colour -
       that is what "no colour difference between them" has to mean, since
       one of them is the page showing through and the other is the kit's
       own empty cell over it. What separates them is the hairline: visible
       on the expected day, gone on the day nothing was expected. */
    const gap = (a, b) => Math.hypot(...rgb(a).map((v, i) => v - rgb(b)[i]));
    /* The two empty days sit together and the logged one sits a long way
       off: whatever separates an expected day from a day nothing was
       expected on, it is a step in the page's own ground and not a step
       towards the flag's colour. */
    const neutral = gap(expected.fill, off.fill) * 4 < gap(expected.fill, logged.fill);
    /* And it is a step you can see - the hairline where the theme gives it
       one, the ground under it where the hairline is too faint to carry it
       alone (dark, where --outline is 1.06:1 against an empty cell). */
    const visible = expected.hairline > 1.05 || gap(expected.fill, off.fill) >= 8;
    const hairlineGone = off.hairline < 1.02;
    if (!neutral || !visible || !hairlineGone) failures++;
    process.stdout.write(
      `  ${neutral && visible && hairlineGone ? 'PASS' : 'FAIL'}  expected vs not-expected:` +
        ` ${Math.round(gap(expected.fill, off.fill))} apart where the logged day is` +
        ` ${Math.round(gap(expected.fill, logged.fill))}, hairline ${expected.hairline}:1` +
        ` against ${off.hairline}:1 on the day with none\n`
    );
  }
  if (logged && off) {
    /* And the one state that does carry colour is the one that says
       something happened. */
    const coloured = chroma(rgb(logged.fill)) > 0.15;
    if (!coloured) failures++;
    process.stdout.write(
      `  ${coloured ? 'PASS' : 'FAIL'}  a logged day is filled in the flag's colour, an empty one is not\n`
    );
  }
}

writeFileSync(`${OUT}/measure-${tag}.json`, JSON.stringify(rows, null, 2));
process.stdout.write(`\n${failures} FAILURE(S)\n`);
await browser.close();
await app.httpServer.close();
process.exit(failures ? 1 : 0);
