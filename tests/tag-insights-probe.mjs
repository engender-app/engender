/* Throwaway probe for carpet ticket 10: the tag insights card, its sheet,
   and the frames of the sheet-to-entry navigation.

   Run: VITE_DEMO=1 npm run build, then node tests/tag-insights-probe.mjs */
import { preview } from 'vite';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './browser-harness.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(process.argv[2] ?? resolve(here, '../.claude/carpet-10-shots'));
const theme = process.argv[3] ?? 'dark';

await mkdir(outDir, { recursive: true });
const browser = await launchChromium();
const app = await preview({ preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;

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

const shot = async (name) => {
  await strip();
  await page.locator('[data-app-root]').screenshot({ path: `${outDir}/${name}.png` });
  console.log('shot', name);
};

await settle('/');
await page.getByRole('button', { name: 'Reset demo state' }).click();
await page.waitForTimeout(1500);
await settle('/settings');
await page.locator('[data-palette-pick="trans"]').click();
await page.locator(`[data-segment="${theme}"]`).click();
await page.waitForFunction((want) => document.documentElement.dataset.theme === want, theme);

await settle('/stats');
await page.waitForSelector('[data-chart-card="tag-insights"]');
await page.locator('[data-segmented="stats-range"] [data-segment="365"]').click();
await page.waitForTimeout(1500);
await page.locator('[data-chart-card="tag-insights"]').scrollIntoViewIfNeeded();
await page.waitForTimeout(400);
await strip();
await page
  .locator('[data-chart-card="tag-insights"]')
  .screenshot({ path: `${outDir}/01-card.png` });
console.log('shot 01-card');

/* The note text as the DOM has it, so the labelling question is answered
   from the real string rather than from the message file. */
console.log(
  'notes:',
  JSON.stringify(
    await page.locator('[data-chart-card="tag-insights"] .kit-bar-note').allTextContents()
  )
);
console.log(
  'values:',
  JSON.stringify(
    await page.locator('[data-chart-card="tag-insights"] [data-bar-value]').allTextContents()
  )
);

// The press, mid-animation.
const firstBar = page.locator('[data-chart-card="tag-insights"] [data-bar-row]').first();
await firstBar.hover();
await page.mouse.down();
await page.waitForTimeout(80);
await shot('02-bar-pressed');
await page.mouse.up();

await page.waitForSelector('[data-sheet]');
await page.waitForTimeout(900);
await shot('03-sheet');

const entries = await page.locator('[data-sheet] [data-entry-card]').count();
console.log('entry cards in sheet:', entries);

/* Slow every duration token down so the navigation's frames are readable at
   screenshot cadence, then walk the sheet-to-entry transition. */
await page.addStyleTag({
  content: `:root, html[data-theme] {
    --dur-fast: 2s !important; --dur-med: 2s !important;
    --dur-slow: 2s !important; --dur-crossfade: 2s !important;
  }`
});
await page.waitForTimeout(200);
await page.locator('[data-sheet] [data-entry-card]').first().click();
for (let i = 0; i < 8; i++) {
  await page.waitForTimeout(250);
  await page
    .locator('[data-app-root]')
    .screenshot({ path: `${outDir}/04-nav-${String(i).padStart(2, '0')}.png` });
  console.log('nav frame', i, 'data-nav=', await page.evaluate(() => document.documentElement.dataset.nav), page.url());
}
await page.waitForTimeout(2500);
await shot('05-entry');

/* The same navigation from a screen with no sheet over it, as the control:
   whichever half of the container transform is missing shows up as the
   difference between these two runs. */
await settle('/');
await page.addStyleTag({
  content: `:root, html[data-theme] {
    --dur-fast: 2s !important; --dur-med: 2s !important;
    --dur-slow: 2s !important; --dur-crossfade: 2s !important;
  }`
});
await page.waitForSelector('[data-entry-card], [data-day-entry]');
await page.waitForTimeout(600);
await strip();
await page.locator('[data-entry-card], [data-day-entry]').first().click();
for (let i = 0; i < 6; i++) {
  await page.waitForTimeout(300);
  await page
    .locator('[data-app-root]')
    .screenshot({ path: `${outDir}/06-home-nav-${String(i).padStart(2, '0')}.png` });
}
console.log('control run at', page.url());

await browser.close();
await app.close();
