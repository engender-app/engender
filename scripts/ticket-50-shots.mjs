/* Screenshots of everything phase 8 features ticket 50 puts on a screen, for
   the sign-off round before it merges: the wear log with a running binder
   session past eight hours, the record sheet's safety facts for each of the
   three kinds, Home's tile carrying the cue, and the Settings row that
   switches the cue off.

   Same shape as scripts/feature-screen-shots.mjs, which is where the theme
   handling, the demo-bar hiding and the settled() wait come from - this one
   opens sheets and drives a picker, which that one does not.

   Run against a demo build (`VITE_DEMO=1`):
     npm run build && npx vite preview --port 5199 &
     node scripts/ticket-50-shots.mjs http://127.0.0.1:5199 [outDir]

   Default outDir is .claude/ticket-50-shots, gitignored and durable. */
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from '../tests/browser-harness.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const base = process.argv[2] ?? 'http://127.0.0.1:5199';
const outDir = resolve(process.argv[3] ?? resolve(here, '../.claude/ticket-50-shots'));
const THEMES = ['dark', 'light'];

await mkdir(outDir, { recursive: true });

const browser = await launchChromium();
const page = await browser.newPage({ viewport: { width: 390, height: 1600 }, deviceScaleFactor: 2 });
page.on('pageerror', (error) => process.stdout.write(`  page error: ${error.message}\n`));

const useTheme = (theme) =>
  page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);

const hideScaffolding = () =>
  page.addStyleTag({ content: '.demo-bar { display: none !important; }' });

async function settled() {
  await page.waitForSelector('[data-screen-header]', { timeout: 30_000 });
  await page
    .waitForFunction(() => document.querySelector('.skeleton-stack') === null, null, { timeout: 30_000 })
    .catch(() => {});
  await page.waitForTimeout(900);
}

const shot = async (name) => {
  await page.waitForTimeout(250);
  await page.locator('[data-app-root]').screenshot({ path: `${outDir}/${name}.png` });
  process.stdout.write(`${name}\n`);
};

async function open(route) {
  await page.goto(`${base}${route}`, { waitUntil: 'networkidle' });
  await hideScaffolding();
  await settled();
}

for (const theme of THEMES) {
  /* The wear log itself: the running binder session, nine hours in, with the
     cue under its row, and completed rows naming their own kind. */
  await open('/practice/wear');
  await useTheme(theme);
  await shot(`wear-log-${theme}`);

  /* The record sheet, once per kind. Opened on the running session, so the
     picker is the only thing changing between the three. */
  await page.locator('[data-wear-running]').click();
  await page.waitForSelector('[data-wear-facts]');
  for (const [kind, label] of [
    ['binder', 'Binder'],
    ['tucking', 'Tucking'],
    ['compression', 'Compression']
  ]) {
    await page.getByRole('radio', { name: label, exact: true }).click();
    await page.waitForSelector(`[data-wear-facts="${kind}"]`);
    await shot(`wear-sheet-${kind}-${theme}`);
  }

  /* Home's tile, with the cue on the note's line. */
  await open('/');
  await useTheme(theme);
  await shot(`home-tile-${theme}`);

  /* And the switch that silences the cue without hiding the tile. */
  await open('/settings');
  await useTheme(theme);
  await page.locator('[data-wear-duration-cue-toggle]').scrollIntoViewIfNeeded();
  await shot(`settings-toggle-${theme}`);
}

await browser.close();
process.stdout.write(`\n${outDir}\n`);
