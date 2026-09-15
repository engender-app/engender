/* How tall the two schedule screens are, and what the strip's three cell
   states measure (phase 10 redesign ticket 44).

   The ticket's budget is a height: dilation captured at 4545px and wear at
   2839px on a demo build with every feature filled, and neither may exceed
   a third of that afterwards. So the number this prints is the scroll
   region's own scrollHeight - the app scrolls inside
   `[data-app-scroll-region]` rather than the document, so
   `document.scrollingElement` answers one viewport and nothing else.

   It also reads the strip: the three states have to be told apart without
   colour (no hue between expected-and-empty and not-expected), every day
   has to be a 48px-or-larger target, and the hairline that edges an
   expected day has to still be there, measured against the cell it edges
   rather than against the page.

   Colours are read by painting each one twice, on black and on white, and
   solving for its alpha - every line token in this app is ink mixed into
   `transparent`, and a single pass over black hands back the colour
   already multiplied by its alpha, which reads as a nearly-black opaque
   line. That mistake is what first reported this hairline at 17.59:1; it
   is 1.35:1. Colours are painted into a 1x1 canvas and read back rather
   than parsed out of `getComputedStyle`, which hands `color-mix()` back as
   an unresolved `oklab(...)` - every tinted surface in this app computes to
   one (tests/surgery-rail-measure.mjs hit the same wall).

   Run: VITE_DEMO=1 npm run build, then
   node tests/day-strip-measure.mjs [--tag before|after]

   For `before`, build from the ticket's base commit first - which
   `node tests/day-strip-gallery.mjs before` already does, and it leaves that
   build in build/ when it restores the sources, so the two run back to back
   and produce a before and an after measured by the same script:

     node tests/day-strip-gallery.mjs before && node tests/day-strip-measure.mjs --tag before
     node tests/day-strip-gallery.mjs after  && node tests/day-strip-measure.mjs --tag after */
import { mkdirSync, writeFileSync } from 'node:fs';
import { preview } from 'vite';
import { launchChromium } from './browser-harness.mjs';

const tag = process.argv.includes('--tag') ? process.argv[process.argv.indexOf('--tag') + 1] : 'after';
const OUT = '.claude/day-strip-shots';
mkdirSync(OUT, { recursive: true });

/* The before-figures this run is scored against: not the door audit's 4545
   and 2839 at tip 01006745, but what this script itself reads on the base
   commit, since the budget divides by three and a 40px drift in the
   baseline moves the pass line by 13px. Both are in
   .claude/day-strip-shots/measure-before.json.

   The ticket asks for a third of each. Dilation clears it and wear does
   not, on any reading of the figure: 1293px against a 931px third, and
   still short with the untouched chart taken off both sides (898px against
   800px). That is reported rather than engineered around - an earlier
   version of this script scored the new height-minus-chart against the old
   whole-screen third, which is two different measurements either side of
   the comparison and turned a real miss into a PASS.

   So there are two lines per screen. The ticket's own figure, printed as
   MET or MISSED with the shortfall, which never fails the run because
   whether to spend the remaining 362px by moving the trend chart is the
   ticket owner's call and not this script's. And a ratchet at what the
   branch actually achieved, which does fail, so the compression cannot
   quietly come back. */
const BEFORE = { '/health/dilation': 4505, '/practice/wear': 2794 };

/* What each screen measured on this branch, pinned. A screen growing past
   its own figure is something whoever caused it should see.

   Read it as a figure about the demo fixture and not only about the code.
   `fullFixture.ts` seeds from one `r()` sequence, and wear's sessions are
   drawn after the tryouts', so ticket 53 adding a felt-sense reading every
   twelfth day of every tryout moved every wear draw after it - different
   days got sessions, the shown week got two more rows, and this screen went
   from 1293px to 1424px with nothing on it changed. The wear seeding's own
   comment warns about exactly this. So a failure here is a prompt to look
   at what moved, which may be the fixture rather than the screen. */
const RATCHET = { '/health/dilation': 1160, '/practice/wear': 1430 };

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
  /* Any CSS colour resolved to opaque rgb plus its alpha, by painting it
     twice - once on black, once on white. A colour C at alpha a reads
     C*a on black and C*a + 255*(1-a) on white, so the difference is
     255*(1-a) and the two together give both numbers back. One pass over
     black is not enough: it returns the colour already multiplied by its
     alpha, which is indistinguishable from an opaque dark colour, and
     every line token in this app is a `color-mix(..., transparent)`. */
  const probe = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 1;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    const on = (ground, css) => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = ground;
      ctx.fillRect(0, 0, 1, 1);
      ctx.fillStyle = css;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
      return [r, g, b];
    };
    return (css) => {
      const black = on('#000', css);
      const white = on('#fff', css);
      const alpha = Math.min(1, Math.max(0, 1 - (white[1] - black[1]) / 255));
      const rgb = alpha === 0 ? [0, 0, 0] : black.map((v) => Math.min(255, Math.round(v / alpha)));
      return { rgb, alpha };
    };
  })();
  /* An opaque read, for a ground: alpha is 1 for every surface token. */
  const paint = (css) => probe(css).rgb;
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
  /** What a colour actually looks like once it is painted on a ground.
      Every line token here is ink at 14 to 19 per cent over whatever is
      behind it, so its painted value is the only one worth comparing. */
  const over = (css, ground) => {
    const { rgb, alpha } = probe(css);
    return rgb.map((v, i) => Math.round(v * alpha + ground[i] * (1 - alpha)));
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
    /* Paging has to update the seven cells, not replace them: a node that
       was just created has nothing to transition from, so it paints its
       state on arrival in one frame and the fade kit.css declares never
       runs. Keyed by day rather than by column, that is exactly what
       happened, and nothing but the nodes themselves shows it. */
    await page.evaluate(() => {
      document.querySelectorAll('[data-week-cell]').forEach((el, i) => (el.dataset.nodeTag = String(i)));
    });

    for (let page_ = 0; page_ < 4; page_++) {
      /* count() first: on a screen with no strip at all - a taper that has
         not started, a journal with no wear session - isEnabled() waits out
         its whole timeout rather than answering false. */
      if ((await page.locator('[data-strip-earlier]').count()) === 0) break;
      if (!(await page.locator('[data-strip-earlier]').isEnabled())) break;
      await page.locator('[data-strip-earlier]').click();
      await page.waitForTimeout(500);
      if (page_ === 0) {
        row.kept = await page.evaluate(
          () => [...document.querySelectorAll('[data-week-cell]')].filter((el) => el.dataset.nodeTag).length
        );
      }
      row.cells.push(...(await page.evaluate(MEASURE)).cells);
    }
    rows.push(row);
  }
}

let failures = 0;
for (const r of rows) {
  const budget = Math.round(BEFORE[r.path] / 3);
  const owned = r.height - r.untouched;
  const ownedBudget = Math.round((BEFORE[r.path] - r.untouched) / 3);
  process.stdout.write(`\n${tag}  ${r.path}  ${r.theme}\n`);

  if (tag !== 'before') {
    /* The ticket's figure, both ways round, neither of them failing the
       run: what is left is a chart the ticket says to leave alone. */
    const met = r.height <= budget;
    process.stdout.write(
      `  ${met ? 'MET' : 'MISSED'}  the ticket's third: ${r.height}px against ${budget}px` +
        (met ? '' : `, over by ${r.height - budget}px`) +
        ` (${owned}px against ${ownedBudget}px with the ${r.untouched}px chart off both sides)\n`
    );
    const ok = r.height <= RATCHET[r.path];
    if (!ok) failures++;
    process.stdout.write(
      `  ${ok ? 'PASS' : 'FAIL'}  ${r.height}px against this branch's own ${RATCHET[r.path]}px\n`
    );
  } else {
    process.stdout.write(`  note  ${r.height}px, ${r.untouched}px of it the chart block\n`);
  }
  if (r.kept !== undefined) {
    const ok = r.kept === 7;
    if (!ok) failures++;
    process.stdout.write(
      `  ${ok ? 'PASS' : 'FAIL'}  ${r.kept} of 7 cells kept their node across a page,` +
        ` so the fill and hairline have something to travel from\n`
    );
  }
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
    /* And it is a step you can see. Two cues, and the honest figure for
       both: the hairline is `--outline`, the app's own line strength, and
       it lands at about 1.35:1 against the cell it edges in light and
       1.33:1 in dark - a card's edge, not a 3:1 mark, because rule 4
       leaves the app two line strengths and this ticket is not the place
       to mint a third. Under it the cell's own ground is 14 steps from the
       page in light and 38 in dark. What carries the day's meaning where
       neither is enough is the label on the button and the row in the log
       below, which both say it in words. */
    const visible = expected.hairline > 1.2 && gap(expected.fill, off.fill) >= 8;
    const hairlineGone = off.hairline < 1.02;
    if (!neutral || !visible || !hairlineGone) failures++;
    process.stdout.write(
      `  ${neutral && visible && hairlineGone ? 'PASS' : 'FAIL'}  expected vs not-expected:` +
        ` ${Math.round(gap(expected.fill, off.fill))} apart where the logged day is` +
        ` ${Math.round(gap(expected.fill, logged.fill))}, hairline ${expected.hairline}:1` +
        ` against ${off.hairline}:1 on the day with none\n`
    );
  }
  if (!expected && r.cells.length > 0) {
    /* Wear draws two states and never the middle one, because nothing
       schedules a wear session: a day with none is a day with none and not
       a day something was missed on. Said out loud, so the comparison above
       being skipped reads as the design rather than as a gap. */
    process.stdout.write(
      `  PASS  no expected-but-empty day here, which is the design:` +
        ` nothing schedules a session on this screen\n`
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
