/* Every piece of type on every step of setup, measured against what is
   actually behind it (phase 10 redesign ticket 33, DIRECTION.md rule 11).

   Rule 11 computes the eight field/ink pairs from the hexes, and
   palette-contrast.test.ts holds them at the 3:1 large-text floor. That is
   the palette's arithmetic; this is the screen's. A step draws the question
   on a flag colour and everything else on the page, and the two things a
   table cannot answer are what an element's effective background really is
   once a fill, a wash or a role has been resolved, and which of the two
   floors applies once a browser has laid the type out at whatever size the
   cascade actually gave it.

   So this walks the real DOM of every step in every palette and both
   themes and reports the worst ratio per step with the element that owns it.
   The measurement itself - resolving what is behind a piece of type, the
   field's paint included - is tests/contrast-walk.mjs, shared with the
   gates' own walker since redesign ticket 34 gave the two surfaces one
   field.

   Run: VITE_DEMO=1 npm run build   first, then
        node tests/setup-contrast.mjs [--palettes trans,agender] [--themes light,dark]
   Writes .claude/setup-contrast.json and prints the worst ratio per step. */
import { preview } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './browser-harness.mjs';
import { SETUP_STEPS } from './setup-flow.mjs';
import { MEASURE } from './contrast-walk.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = argv.indexOf(`--${name}`);
  return at >= 0 ? argv[at + 1] : fallback;
};
const PALETTES = flag(
  'palettes',
  'trans,nonbinary,genderfluid,bisexual,lesbian,pansexual,rainbow,agender'
).split(',');
const THEMES = flag('themes', 'light,dark').split(',');
const ORDER = SETUP_STEPS;

const outFile = resolve(here, '../.claude/setup-contrast.json');
await mkdir(dirname(outFile), { recursive: true });

const browser = await launchChromium();
const app = await preview({ preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.addInitScript(() => {
  const style = document.createElement('style');
  style.textContent =
    '[data-toast]{display:none !important}' +
    '.demo-bar{display:none !important}' +
    'body.has-demo-bar{display:block !important;height:auto !important}';
  addEventListener('DOMContentLoaded', () => document.head.append(style));
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

const wear = async (palette, theme) => {
  await settle('/settings');
  await page.locator(`[data-palette-pick="${palette}"]`).click();
  await page.locator(`[data-segment="${theme}"]`).click();
  await page.waitForFunction(
    ([p, t]) =>
      document.documentElement.dataset.palette === p && document.documentElement.dataset.theme === t,
    [palette, theme]
  );
};

const findings = {};
let worst = { ratio: Infinity };

for (const palette of PALETTES) {
  for (const theme of THEMES) {
    await wear(palette, theme);
    await settle('/');
    await page.locator('#demo-jump').evaluate((el) => {
      el.value = 'first-run';
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.waitForSelector('[data-next]');
    for (const step of ORDER) {
      await page.waitForTimeout(450);
      if (step === 'name') await page.locator('#ob-name').fill('Ola');
      const measured = await page.evaluate(MEASURE, '.screen-setup');
      const failed = measured.filter((m) => m.ratio < m.floor);
      const low = measured.reduce((a, b) => (b.ratio < a.ratio ? b : a), { ratio: Infinity });
      findings[`${palette}-${theme}-${step}`] = { lowest: low, failed };
      if (low.ratio < worst.ratio) worst = { ...low, where: `${palette} ${theme} ${step}` };
      if (failed.length) {
        for (const f of failed) {
          console.log(
            `UNDER FLOOR  ${palette} ${theme} ${step}: ${f.what} "${f.text}" ${f.ratio}:1 ` +
              `against a ${f.floor}:1 floor (${f.size}px/${f.weight})`
          );
        }
      }
      if (step !== 'done') await page.locator('[data-next]').click();
    }
    console.log(`${palette} ${theme}: measured ${ORDER.length} steps`);
  }
}

await writeFile(outFile, JSON.stringify({ worst, findings }, null, 2));
console.log(
  `\nworst anywhere: ${worst.ratio}:1 on ${worst.where} (${worst.what} "${worst.text}", ` +
    `${worst.size}px/${worst.weight}, floor ${worst.floor})`
);
const under = Object.values(findings).filter((f) => f.failed.length).length;
console.log(under ? `${under} step/palette pairs under the floor` : 'every step clears its floor');
await page.close();
await app.close();
await browser.close();
