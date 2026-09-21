/* What a chart's tick says under a pointer (phase 11 UI/UX ticket 49).

   Drives the real AreaChart on tests/browser-tier/chart-tick.html across the
   three grains, both catalogues, both themes, three widths and disguise both
   ways, and reads the rendered readout rather than the props behind it. The
   plate is a live layout question - it wraps now, and it may not grow past
   half the plot - so every claim here is measured off the DOM.

   Two pointers, because the app has two. A mouse over a mark opens the label
   beside it (the hit rects are live only under `hover: hover`), and a held
   finger scrubs the plot and fills the corner plate; the readout's own
   annotations go quiet while a mark is hovered, so the two never answer at
   once. The touch path is dispatched rather than moved, since an 18px hit
   rect would otherwise swallow the pointer that is meant to be scrubbing.

   Run: node tests/chart-tick-readout.mjs [--gallery]
   --gallery also writes crops to .claude/chart-tick-shots, which is
   gitignored and durable. Shots are the default palette in both themes, and
   crop to the chart card: nothing else on the page changed. */
import { createServer } from 'vite';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './browser-harness.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const gallery = process.argv.includes('--gallery');
const outDir = resolve(here, '../.claude/chart-tick-shots');

/** AreaChart's own, and the plot's own count of positions. */
const PAD = 7;
const POSITIONS = 30;
/** Where the gallery put each tick, as a position index. */
const AT = { milestone: 5, surgery: 10, appointment: 15, era: 20, bare: 25, gathered: 28 };

const failures = [];
function check(ok, what) {
  if (!ok) failures.push(what);
}

await mkdir(outDir, { recursive: true });

const server = await createServer({
  configFile: `${here}/browser-tier/browser-tier.vite.config.ts`,
  server: { port: 0 }
});
await server.listen();
const port = server.config.server.port;
const browser = await launchChromium();

/** The readout as a person reads it: the name line of each tick, the line
    under it, and the count for the rest. */
async function readPlate(page) {
  return await page.evaluate(() => {
    const plate = document.querySelector('[data-chart-readout]');
    if (!plate) return null;
    const box = plate.getBoundingClientRect();
    const plot = plate.closest('.kit-area').getBoundingClientRect();
    return {
      names: [...plate.querySelectorAll('.kit-area-readout-annotation')].map((n) => n.textContent.trim()),
      notes: [...plate.querySelectorAll('.kit-area-annotation-note')].map((n) => n.textContent.trim()),
      text: plate.textContent.trim(),
      width: box.width,
      plotWidth: plot.width
    };
  });
}

async function readHoverLabel(page) {
  return await page.evaluate(() => {
    const label = document.querySelector('[data-annotation-label]');
    if (!label) return null;
    return {
      notes: [...label.querySelectorAll('.kit-area-annotation-note')].map((n) => n.textContent.trim()),
      text: label.textContent.trim()
    };
  });
}

/** Holds a finger at the position `index` of one chart's plot. Dispatched
    with a touch pointer type, which is the path the annotation readout is
    read on: a real mouse would land on a mark's hit rect and open the label
    beside it instead. */
async function scrubTo(page, grain, index) {
  await page.evaluate(
    ({ grain, index, PAD, POSITIONS }) => {
      const plot = document.querySelector(`[data-chart-card="${grain}"] .kit-area`);
      const box = plot.getBoundingClientRect();
      const span = box.width - PAD * 2;
      const clientX = box.left + PAD + (index / (POSITIONS - 1)) * span;
      const clientY = box.top + box.height / 2;
      plot.dispatchEvent(
        new PointerEvent('pointerdown', { pointerType: 'touch', clientX, clientY, bubbles: true })
      );
    },
    { grain, index, PAD, POSITIONS }
  );
  await page.waitForTimeout(80);
}

async function releaseScrub(page, grain) {
  await page.evaluate((grain) => {
    document
      .querySelector(`[data-chart-card="${grain}"] .kit-area`)
      .dispatchEvent(new PointerEvent('pointerup', { pointerType: 'touch', bubbles: true }));
  }, grain);
  await page.waitForTimeout(80);
}

async function openPage(context, { locale, theme, disguised, width }) {
  const page = await context.newPage();
  await page.setViewportSize({ width, height: 900 });
  const query = new URLSearchParams({ locale });
  if (disguised) query.set('disguise', '1');
  await page.goto(`http://localhost:${port}/chart-tick.html?${query}`, { waitUntil: 'networkidle' });
  await page.evaluate((theme) => {
    document.documentElement.dataset.theme = theme;
  }, theme);
  await page.waitForSelector('body[data-chart-tick-ready]', { state: 'attached' });
  await page.waitForTimeout(150);
  return page;
}

const context = await browser.newContext({ deviceScaleFactor: 2 });

/* Every combination the ticket names, read rather than photographed. */
for (const locale of ['en', 'pl']) {
  for (const theme of ['light', 'dark']) {
    for (const width of [390, 320, 195]) {
      for (const disguised of [false, true]) {
        const where = `${locale}/${theme}/${width}px${disguised ? '/disguised' : ''}`;
        const page = await openPage(context, { locale, theme, disguised, width });

        for (const grain of ['day', 'week', 'month']) {
          await scrubTo(page, grain, AT.milestone);
          const plate = await readPlate(page);
          check(plate !== null, `${where} ${grain}: no readout under the finger`);
          if (!plate) continue;

          if (disguised) {
            check(plate.notes.length === 0, `${where} ${grain}: drew free text under disguise`);
            check(plate.names.length === 1, `${where} ${grain}: lost the name and kind under disguise`);
          } else {
            check(plate.notes.length === 1, `${where} ${grain}: the milestone drew no line of its own`);
            check(
              /hands shook/.test(plate.notes[0] ?? ''),
              `${where} ${grain}: the milestone's line is not its own words`
            );
            /* Where a position stands for more than a day, the line carries
               the tick's own date; at the day grain the readout has already
               named that day. */
            const dated = /^\d/.test(plate.notes[0] ?? '');
            check(
              grain === 'day' ? !dated : dated,
              `${where} ${grain}: the line ${dated ? 'dated' : 'did not date'} itself when it should not have`
            );
          }
          /* Carpet ticket 08's cap, which this ticket keeps: the plate may
             not grow back across the midline it took a corner to clear. */
          check(
            plate.width <= plate.plotWidth / 2 + 0.5,
            `${where} ${grain}: the plate is ${plate.width.toFixed(1)}px of a ${plate.plotWidth.toFixed(1)}px plot`
          );
          await releaseScrub(page, grain);
        }

        /* A record with nothing written on it reads exactly as it did. */
        await scrubTo(page, 'day', AT.bare);
        const bare = await readPlate(page);
        check(bare?.notes.length === 0, `${where}: a milestone with no description drew a line anyway`);
        check(bare?.names.length === 1, `${where}: a milestone with no description lost its name`);
        await releaseScrub(page, 'day');

        /* An era states its boundary instead of naming itself and its kind,
           and goes back to the pair under disguise. */
        await scrubTo(page, 'day', AT.era);
        const era = await readPlate(page);
        check(
          disguised ? era?.notes.length === 0 : era?.notes.length === 1,
          `${where}: the era's own line is wrong`
        );
        check(
          disguised ? era?.names.length === 1 : era?.names.length === 0,
          `${where}: the era drew ${era?.names.length} name-and-kind pairs`
        );
        await releaseScrub(page, 'day');

        /* Three marks on one day: two in full and a count for the rest. */
        await scrubTo(page, 'day', AT.gathered);
        const gathered = await readPlate(page);
        const written = (gathered?.names.length ?? 0) + (gathered?.notes.length ?? 0);
        check(written > 0, `${where}: a gathered day wrote nothing`);
        /* Two ticks in full and one line counting the rest, which the plate
           draws in the same class as a tick's name. */
        const counted = gathered?.names.at(-1) ?? '';
        check(
          (gathered?.names.length ?? 0) <= 3,
          `${where}: a gathered day wrote ${gathered?.names.length} lines past the cap of two and a count`
        );
        check(/\b1\b/.test(counted), `${where}: a gathered day lost its count of the rest`);
        check(
          gathered.width <= gathered.plotWidth / 2 + 0.5,
          `${where}: a gathered day's plate is ${gathered.width.toFixed(1)}px of ${gathered.plotWidth.toFixed(1)}px`
        );
        await releaseScrub(page, 'day');

        /* The marks gain no tab stop, and the gesture is unchanged. */
        const stops = await page.evaluate(
          () =>
            document.querySelectorAll(
              '.kit-area [tabindex]:not([tabindex="-1"]), .kit-area a, .kit-area button'
            ).length
        );
        check(stops === 0, `${where}: the plot grew ${stops} tab stop(s)`);

        await page.close();
      }
    }
  }
}

/* The mouse path: a hovered mark answers beside itself, and its label
   carries the same line. */
{
  const page = await openPage(context, { locale: 'en', theme: 'light', disguised: false, width: 390 });
  await page.locator('[data-chart-card="day"] .kit-annotation-hit').nth(0).hover();
  await page.waitForTimeout(150);
  const label = await readHoverLabel(page);
  check(label !== null, 'hover: no label beside the mark');
  check(label?.notes.length === 1, 'hover: the label drew no line of its own');
  await page.close();
}

if (gallery) {
  for (const theme of ['light', 'dark']) {
    const page = await openPage(context, { locale: 'en', theme, disguised: false, width: 390 });
    const card = (grain) => page.locator(`[data-chart-card="${grain}"]`);

    for (const [grain, index, name] of [
      ['day', AT.milestone, 'day-milestone'],
      ['week', AT.milestone, 'week-milestone-dated'],
      ['month', AT.surgery, 'month-surgery-dated'],
      ['day', AT.era, 'day-era'],
      ['day', AT.bare, 'day-nothing-written'],
      ['day', AT.gathered, 'day-gathered']
    ]) {
      await scrubTo(page, grain, index);
      await card(grain).screenshot({ path: `${outDir}/${theme}-${name}.png` });
      await releaseScrub(page, grain);
    }

    await page.locator('[data-chart-card="day"] .kit-annotation-hit').nth(0).hover();
    await page.waitForTimeout(150);
    await card('day').screenshot({ path: `${outDir}/${theme}-day-hovered-mark.png` });
    await page.close();

    const narrow = await openPage(context, { locale: 'pl', theme, disguised: false, width: 195 });
    await scrubTo(narrow, 'week', AT.milestone);
    await narrow.locator('[data-chart-card="week"]').screenshot({ path: `${outDir}/${theme}-pl-195px.png` });
    await narrow.close();

    const hidden = await openPage(context, { locale: 'en', theme, disguised: true, width: 390 });
    await scrubTo(hidden, 'day', AT.milestone);
    await hidden.locator('[data-chart-card="day"]').screenshot({ path: `${outDir}/${theme}-disguised.png` });
    await hidden.close();
  }
  console.log(outDir);
}

await browser.close();
await server.close();

if (failures.length) {
  console.error(`${failures.length} failure(s):`);
  for (const failure of failures) console.error(`  ${failure}`);
  process.exit(1);
}
console.log('chart tick readout: every state reads its own record');
