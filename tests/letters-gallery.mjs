/* The letters screen's three card states and its arrival moment (phase 10
   redesign ticket 45).

   Cropped to what the ticket changed rather than shot as whole screens: the
   sealed card, the ready card, the opened card folded and unfolded, and the
   arrival moment. Whole-screen shots earn their place only where a ticket changed
   the whole screen, and this one changed the cards on it.

   Default flag (`trans`) crossed with the two themes and nothing else - the
   eight-palette cross product is `palette-contrast.test.ts`'s concern, not
   something to look through by eye.

   The demo persona ships two sealed letters and two unlocked ones and no
   letter unlocking today, which is the one state it cannot show. So the
   arrival's letter is written here, through the screen's own compose sheet
   with today's date on it, which is the same write path a person takes and
   puts a real row in the journal rather than a fixture.

   Run: VITE_DEMO=1 npm run build   first, then
        node tests/letters-gallery.mjs --tag after [--out <dir>]
   and the same script from a detached worktree of main with `--tag before`,
   since `vite preview` serves the process's own cwd rather than a root it is
   handed. Default outDir is .claude/letters-shots, gitignored and durable. */
import { preview } from 'vite';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './browser-harness.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1] : fallback;
};
const tag = flag('tag', 'after');
const outDir = resolve(flag('out', resolve(here, '../.claude/letters-shots')));

await mkdir(outDir, { recursive: true });
const browser = await launchChromium();
const app = await preview({ preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const shots = [];

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

  /* The palette and the theme are set after the last navigation, never
     before: `goto` remounts the shell and takes a manually stamped
     `data-theme` with it. */
  const dress = async () => {
    await settle('/settings');
    await page.locator('[data-palette-pick="trans"]').click();
    await page.locator(`[data-segment="${theme}"]`).click();
    await page.waitForFunction((want) => document.documentElement.dataset.theme === want, theme);
  };

  /* A crop rather than a screen: the element is shot on its own, with the
     screen's own horizontal inset added back so the card is not measured
     tight against its own text. */
  const crop = async (name, selector, pad = 20) => {
    await strip();
    /* Scrolled to first: the app scrolls `[data-app-scroll-region]` and the
       floating bar sits over its foot, so a card below the fold crops as a
       picture of the bar. */
    await page.locator(selector).first().scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    const box = await page.locator(selector).first().boundingBox();
    if (!box) throw new Error(`${name}: nothing at ${selector}`);
    const file = `${outDir}/${tag}-${name}-trans-${theme}.png`;
    await page.screenshot({
      path: file,
      clip: {
        x: Math.max(0, box.x - pad),
        y: Math.max(0, box.y - pad),
        width: Math.min(390, box.width + pad * 2),
        height: box.height + pad * 2
      }
    });
    shots.push(`${tag}-${name}-trans-${theme}`);
  };

  const shootViewport = async (name) => {
    await strip();
    const file = `${outDir}/${tag}-${name}-trans-${theme}.png`;
    await page.locator('[data-app-root]').screenshot({ path: file });
    shots.push(`${tag}-${name}-trans-${theme}`);
  };

  await settle('/');
  await page.getByRole('button', { name: 'Reset demo state' }).click();
  await page.waitForTimeout(1500);
  await page.locator('[data-fill-every-feature]').click();
  /* Generous: the seeding writes a whole journal before it resolves, and on
     the second context of a run it is competing with the first one's
     leftovers. Playwright's own 30s default is not enough on a cold cache. */
  await page.waitForURL('**/more', { timeout: 180000 });
  await page.waitForTimeout(1500);
  await dress();

  /* On main every letter is one row of one list card; on this branch they
     are cards in two groups, each naming its own state. The selectors below
     name the row on main and the card here, so one script shoots both
     columns. */
  const before = tag === 'before';
  const CARD = before ? '[data-letter]' : '[data-letter-state]';

  await settle('/transition/letters');
  await page.waitForSelector(CARD);
  await page.waitForTimeout(900);

  /* ---------- 01: a sealed letter. Five years of waiting, which read on
     main as a lock glyph, the word Sealed and a grey subtitle. ---------- */
  await crop('01-sealed', before ? '[data-letter]' : '[data-letter-state="sealed"]');

  /* ---------- 02: the whole list, for the ordering and for the claim that
     ten letters still fit at once. ---------- */
  await shootViewport('02-list');

  /* ---------- 03: an unlocked letter nobody has read yet. Its first line,
     the day it was written, and the mark that says it is waiting to be read
     - the reading Today's live tile carries and this screen keeps. ------ */
  await crop('03-ready', before ? '[data-letter]' : '[data-letter-state="ready"]');

  /* ---------- 04: the same letter open. On main this is a sheet over the
     screen; here it is the card itself, unfolded in place. ---------- */
  if (before) {
    await page.locator('[data-letter]').last().click();
    await page.waitForSelector('[data-letter-text]');
    await page.waitForTimeout(700);
    await shootViewport('04-reading');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(600);
    await crop('05-opened', '[data-letter]');
  } else {
    await page.locator('[data-letter-open]').last().click();
    await page.waitForSelector('[data-letter-state="reading"]');
    await page.waitForTimeout(1000);
    await crop('04-reading', '[data-letter-state="reading"]');

    /* ---------- 05: and folded again, now that it has been read: the same
       card without the mark. ---------- */
    await page.locator('[data-letter-close]').click();
    await page.waitForSelector('[data-letter-state="opened"]');
    await page.waitForTimeout(900);
    await crop('05-opened', '[data-letter-state="opened"]');
  }

  /* The demo persona has no letter whose day is now, which is the one state
     it cannot show, so the last two shots write their own - through the
     screen's compose sheet with today's date on it, which is the write path
     a person takes rather than a fixture reaching past it. A reload is what
     meets the result: the arrival is owed on the next visit, not in the
     frame the letter was sealed. */
  const writeLetterForToday = async (text) => {
    await page.locator('[data-add]').click();
    await page.waitForSelector('[data-save-letter]');
    await page.locator('textarea.input').fill(text);
    await page.evaluate(() => {
      const el = document.querySelector('#letter-unlock');
      const fp = el?._flatpickr ?? el?.flatpickr;
      if (!fp) throw new Error('no flatpickr instance on #letter-unlock');
      fp.setDate(new Date(), true);
    });
    await page.locator('[data-save-letter]').click();
    await page.waitForTimeout(900);
    await settle('/transition/letters');
    await page.waitForTimeout(1000);
  };

  await writeLetterForToday(
    'You made it to today. I remember picking this date and not really believing in it, and here you are reading it.'
  );

  if (before) {
    /* Main has no arrival at all, which is the whole of the comparison: the
       letter whose day is today is the top row of the same list, in the same
       shape as the other three. */
    await page.waitForSelector('[data-letter]');
    await shootViewport('06-arrival');
    await page.locator('[data-letter]').first().click();
    await page.waitForTimeout(800);
    await shootViewport('07-arrival-open');
  } else {
    /* ---------- 06: the arrival, which is the whole screen. ---------- */
    await page.waitForSelector('[data-letter-arrival]');
    await shootViewport('06-arrival');

    /* ---------- 07: opened where it arrived. The card unfolds in place
       rather than handing over to a sheet of text. ---------- */
    await page.locator('[data-letter-arrival-open]').click();
    await page.waitForSelector('[data-letter-text]');
    await page.waitForTimeout(1000);
    await shootViewport('07-arrival-open');
  }

  await page.close();
}

await browser.close();
await app.close();
console.log(`${shots.length} shots in ${outDir}`);
for (const shot of shots) console.log(`  ${shot}.png`);
