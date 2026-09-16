/* Screenshots of mood's ramp and mood's five faces (phase 10 ticket 27),
   one per preset per theme, plus one sweep across the eight flags.

   The icon gallery next door draws both mark families at every size and
   answers "do these read as one set". This one answers the two questions
   ticket 27 is: does each preset read as two colours end to end, and do the
   five faces still tell apart at 28px now that the drawing is filled rather
   than stroked. Only mood is on the page, so a reviewer is looking at what
   changed instead of finding it.

   Run: node tests/mood-gallery.mjs [outDir] [--tag before|after]
   Default outDir is .claude/mood-shots, which is gitignored and durable.

   `--app` runs a second pass instead of the first: the same drawing and the
   same ramp on the real screens that draw them, with the demo persona's own
   data, which is the pass that answers "does every surface that reads a mood
   still draw one" rather than "is the drawing right". It needs a demo build
   (`VITE_DEMO=1 npm run build`) and writes to .claude/mood-app/. */
import { createServer, preview } from 'vite';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './browser-harness.mjs';
import { PALETTES } from './palettes.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const tagAt = args.indexOf('--tag');
const tag = tagAt === -1 ? '' : `${args[tagAt + 1]}-`;
const outArg = args.find((a, i) => !a.startsWith('--') && (tagAt === -1 || i !== tagAt + 1));
const outDir = resolve(outArg ?? resolve(here, '../.claude/mood-shots'));

const THEMES = ['dark', 'light'];
const PRESETS = ['amber', 'teal', 'plum', 'moss'];

await mkdir(outDir, { recursive: true });

if (args.includes('--app')) {
  /* The eleven reuse sites the ticket lists, in the running app. The fixture
     below proves the drawing; this proves that Home's chips, a day's entries,
     the calendar's cells, the mood chart, the editor's picker, quick add's
     fan, the doubt journal's card and a voice take all still get one. */
  const appOut = resolve(here, '../.claude/mood-app');
  await mkdir(appOut, { recursive: true });
  const browser = await launchChromium();
  const app = await preview({ preview: { port: 0 } });
  const base = `http://localhost:${app.httpServer.address().port}`;
  for (const theme of ['light', 'dark']) {
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      colorScheme: theme
    });

    const strip = () =>
      page.evaluate(() => {
        for (const toast of document.querySelectorAll('[data-toast]')) toast.remove();
        for (const bar of document.querySelectorAll('.demo-bar')) bar.remove();
      });

    const settle = async (path) => {
      await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
      await page.waitForSelector('[data-app-root][data-boot="ready"]');
      if (await page.locator('[data-leave-setup]').count()) {
        await page.locator('[data-leave-setup]').click();
        await page.waitForSelector('[data-home-hello]');
        await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
        await page.waitForSelector('[data-app-root][data-boot="ready"]');
      }
    };

    /* Palette and theme after the last navigation, never before: goto remounts
       the shell and takes a manually stamped data-theme with it. */
    const dress = async () => {
      await settle('/settings');
      await page.locator('[data-palette-pick="trans"]').click();
      await page.locator(`[data-segment="${theme}"]`).click();
      await page.waitForFunction((want) => document.documentElement.dataset.theme === want, theme);
    };

    const crop = async (name, selector) => {
      await strip();
      const target = page.locator(selector).first();
      if (!(await target.count())) {
        console.log(`MISSING ${name} (${selector})`);
        return;
      }
      await target.scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);
      const file = `${appOut}/${tag || 'after-'}${name}-${theme}.png`;
      await target.screenshot({ path: file });
      console.log(file);
    };

    await settle('/');
    await page.locator('[data-fill-every-feature]').click();
    await page.waitForURL('**/more', { timeout: 240000 });
    await page.waitForTimeout(2000);
    await dress();

    /* Home: the chip row. */
    await settle('/');
    await page.waitForTimeout(900);
    await crop('home-chips', '.kit-moods');

    /* A day's own screen, which is where an entry's 28px mark and the
       entry-card dot are drawn (Home carries no entries since ticket 13). */
    await settle('/day/today');
    await page.waitForTimeout(1200);
    await crop('day-entries', '.kit-day');

    /* The calendar, with the month open and coloured by mood rather than by
       a gender dimension: this is where a mood is the cell's own colour and
       the face draws without its disc, and it is not what the screen shows by
       default. */
    await settle('/calendar');
    await page.waitForTimeout(1000);
    await page.selectOption('[data-chart-picker="calendar-metric"]', 'mood');
    if (await page.locator('.cal-open[aria-expanded="false"]').count()) {
      await page.locator('.cal-open').click();
    }
    await page.waitForTimeout(1400);
    await crop('calendar', '.cal-grid');

    /* Insights: the two charts that take --mood-N as a bar fill. */
    await settle('/stats');
    await page.waitForTimeout(1500);
    await crop('distribution', '.kit-chart:has(.kit-dist)');
    await crop('ordered-strip', '.kit-chart:has(.kit-ordered)');

    /* The entry editor's picker, which is the surface the drawing is drawn
       for, at 44px and alive. */
    await settle('/entry/new/today');
    await page.waitForTimeout(1200);
    await crop('picker', '.mood-picker');

    /* Quick add's fan: five faces at 34 on a card that clips them. */
    await settle('/');
    await page.waitForTimeout(700);
    const add = page.getByRole('button', { name: /quick add|add/i }).first();
    if (await add.count()) await add.click();
    await page.waitForTimeout(900);
    await crop('fan', '[data-fan]');

    /* The entry card's dot, which is one step of the ramp and no drawing at
       all. Safe space's counterevidence check is where a card renders with
       the demo's data - one tap down from /doubt since redesign ticket
       47. */
    await settle('/doubt/evidence');
    await page.waitForTimeout(1200);
    await crop('entry-card', '.entry-card');

    /* Felt sense on a voice take: a 36px face, read never chosen. Only if the
       demo seeded a take that carries one. */
    await settle('/practice/voice');
    await page.waitForTimeout(1500);
    await crop('voice-takes', '.kit-row:has(.mood-face)');

    await page.close();
  }
  await browser.close();
  await app.close();
  process.exit(0);
}

const server = await createServer({
  configFile: `${here}/browser-tier/browser-tier.vite.config.ts`,
  server: { port: 0 }
});
await server.listen();
const port = server.config.server.port;

const browser = await launchChromium();
/* A phone's width, because the picker and the chip row are laid out against
   one and five faces on a 520 column would sit further apart than they ever
   do in the app. */
const page = await browser.newPage({
  viewport: { width: 390, height: 900 },
  deviceScaleFactor: 2
});

await page.goto(`http://localhost:${port}/mood.html`, { waitUntil: 'networkidle' });
await page.waitForSelector('body[data-mood-ready]', { state: 'attached' });
await page.waitForFunction(() => document.querySelector('.mood-face') !== null);
// Nunito and Outfit both come off disk here, and a label in a fallback face
// is a label at the wrong width.
await page.evaluate(() => document.fonts.ready);

async function shoot(file) {
  // The palette swap is a stylesheet change, not an animation; this is only
  // giving it a frame to land.
  await page.waitForTimeout(120);
  const path = `${outDir}/${tag}${file}.png`;
  await page.screenshot({ path, fullPage: true });
  console.log(path);
}

/* The pass that actually moves the faces: mood's scale is keyed on
   [data-mood-preset] rather than on the flag (ADR-0077), so it is these
   four and not the eight palettes that change them. */
for (const preset of PRESETS) {
  for (const theme of THEMES) {
    await page.selectOption('select[aria-label="Palette"]', 'trans');
    await page.selectOption('select[aria-label="Theme"]', theme);
    await page.selectOption('select[aria-label="Mood preset"]', preset);
    await shoot(`mood-${preset}-${theme}`);
  }
}

/* And the pass that proves the claim the other way round: the same preset
   against every flag, where only the ink, the page and the picked face's
   ring move. This is where a ramp that had quietly re-derived itself from
   the palette would show up, and where the eight inks on the same five
   fills are checked by eye against the 4.5:1 the test computes. */
for (const palette of PALETTES) {
  for (const theme of THEMES) {
    await page.selectOption('select[aria-label="Palette"]', palette);
    await page.selectOption('select[aria-label="Theme"]', theme);
    await page.selectOption('select[aria-label="Mood preset"]', 'amber');
    await shoot(`flags-${palette}-${theme}`);
  }
}

await browser.close();
await server.close();
