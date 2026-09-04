/* Screenshots of Safe Space's letters (phase 8 features ticket 21): the
   section with one letter, with more than it shows, and the screen with no
   unlocked letters at all.

   Default flag only, both themes, which is what the sign-off asked for.

   Run: VITE_DEMO=1 npm run build   first, then
        node tests/safe-space-letters-gallery.mjs [outDir]
   Default outDir is .claude/safe-space-letter-shots, which is gitignored. */
import { preview } from 'vite';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './browser-harness.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(process.argv[2] ?? resolve(here, '../.claude/safe-space-letter-shots'));

/* Two letters written during the run. With the persona's own two that is
   four unlocked, one past the cap, so the section is shot with its overflow
   row and with a mix of write dates rather than three rows all dated today.
   The first is long and paragraphed on purpose: the row's clamp is the half
   of the truncation-versus-link decision that only a render argues about. */
const EXTRA_LETTERS = [
  `You are reading this on a bad day, which is why you set it for today rather than for a date you would have to wait out.\n\nThe thing you are afraid of right now is the thing you were afraid of in March, and in March you were wrong. Not a little wrong. You wrote down what you expected and none of it happened.\n\nGo and put the kettle on.`,
  'The haircut was the right call. You knew it within a day.'
];

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

  const shoot = async (name, fullPage = false) => {
    await strip();
    const file = `${outDir}/${name}-trans-${theme}.png`;
    await page.screenshot({ path: file, fullPage });
    shots.push(`${name}-trans-${theme}`);
  };

  /* The letters block on its own: the intro line through the bottom of the
     card, found from a letter row rather than from a handle added to the
     screen for a screenshot's sake. */
  const shootLetterBlock = async (name) => {
    await strip();
    await page.evaluate(() => {
      const row = document.querySelector('[data-list-row="letter-preview"]');
      row.closest('[data-list-card]').scrollIntoView({ block: 'center' });
    });
    await page.waitForTimeout(300);
    const clip = await page.evaluate(() => {
      const row = document.querySelector('[data-list-row="letter-preview"]');
      const card = row.closest('[data-list-card]');
      const intro = card.previousElementSibling;
      const top = intro.getBoundingClientRect();
      const bottom = card.getBoundingClientRect();
      return {
        x: Math.max(0, top.x - 8) + window.scrollX,
        y: Math.max(0, top.y - 8) + window.scrollY,
        width: Math.min(window.innerWidth, bottom.width + 16),
        height: Math.min(window.innerHeight - 16, bottom.bottom - top.top + 16)
      };
    });
    const file = `${outDir}/${name}-trans-${theme}.png`;
    await page.screenshot({ path: file, clip });
    shots.push(`${name}-trans-${theme}`);
  };

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

  const dress = async () => {
    await settle('/settings');
    await page.locator('[data-palette-pick="trans"]').click();
    await page.locator(`[data-segment="${theme}"]`).click();
    await page.waitForFunction((want) => document.documentElement.dataset.theme === want, theme);
  };

  await dress();

  /* ---------- no unlocked letters. The persona alone writes none, so this
     is the common case early on: the section is absent rather than empty,
     and the screen is the one that shipped.

     The jump is clicked from /settings rather than from Home, because the
     control only navigates once the reseed has finished - landing on Home
     is the signal, and starting there would have nothing to wait for. ----- */
  await page.getByRole('button', { name: 'Reset demo state' }).click();
  await page.waitForURL(`${base}/`);
  await page.waitForSelector('[data-home-hello]');
  await dress();
  await settle('/doubt');
  await page.waitForSelector('[data-safe-space-stats]');
  await page.waitForTimeout(600);
  await shoot('01-no-letters', true);

  /* ---------- the demo persona's own two, which is the section at rest.
     ---------- */
  await settle('/');
  await page.locator('[data-fill-every-feature]').click();
  await page.waitForURL('**/more', { timeout: 60000 });
  await dress();
  await settle('/doubt');
  await page.waitForSelector('[data-list-row="letter-preview"]');
  await page.waitForTimeout(600);
  await shoot('02-two-letters', true);
  await shootLetterBlock('03-two-letters-close');

  /* ---------- four unlocked letters: three rows and the way out to the
     rest. Written through the letters screen's own composer, which unlocks
     a letter dated today straight away. ---------- */
  for (const text of EXTRA_LETTERS) {
    await settle('/settings/letters');
    await page.locator('[data-add]').click();
    await page.locator('textarea').fill(text);
    await page.locator('[data-save-letter]').click();
    await page.waitForTimeout(400);
  }

  await settle('/doubt');
  await page.waitForSelector('[data-list-row="letter-preview"]');
  await page.waitForTimeout(600);
  await shoot('04-four-letters', true);
  await shootLetterBlock('05-four-letters-close');

  /* ---------- and the other half of the decision: the whole letter, one
     tap away on its own screen. ---------- */
  await page.locator('[data-list-row="letter-preview"]').first().click();
  await page.waitForSelector('[data-letter-text]');
  await page.waitForTimeout(500);
  await shoot('06-whole-letter', true);

  await page.close();
}

await app.httpServer.close();
await browser.close();

console.log(`${shots.length} shot(s) in ${outDir}`);
for (const shot of shots) console.log(' ', shot);
