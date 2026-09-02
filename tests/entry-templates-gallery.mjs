/* One-off screenshots of the new entry templates screen (phase 6 ticket 07),
   for a design pass rather than a committed suite - not wired into any npm
   script.

   Run: node tests/entry-templates-gallery.mjs [outDir]
   Default outDir is .claude/entry-templates-shots, gitignored. */
import { preview } from 'vite';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { launchChromium } from './browser-harness.mjs';

const root = resolve(import.meta.dirname, '..');
const outDir = resolve(process.argv[2] ?? resolve(root, '.claude/entry-templates-shots'));

const THEMES = ['dark', 'light'];
const PALETTES = ['trans', 'nonbinary'];

const run = (command, args, env) =>
  new Promise((done, fail) => {
    const child = spawn(command, args, { cwd: root, stdio: 'inherit', env: { ...process.env, ...env } });
    child.on('exit', (code) => (code === 0 ? done() : fail(new Error(`${command} exited ${code}`))));
  });

await mkdir(outDir, { recursive: true });
const shots = [];

await run('npx', ['vite', 'build'], { VITE_DEMO: '1' });

const app = await preview({ preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const browser = await launchChromium();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });

const settle = async (path) => {
  await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]');
  if (await page.locator('[data-leave-setup]').count()) {
    await page.locator('[data-leave-setup]').click();
    await page.waitForSelector('[data-home-hello]');
    await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-app-root][data-boot="ready"]');
  }
  await page.evaluate(() => {
    for (const toast of document.querySelectorAll('[data-toast]')) toast.remove();
  });
};

const shoot = async (name) => {
  await page.evaluate(() => {
    for (const toast of document.querySelectorAll('[data-toast]')) toast.remove();
  });
  await page.screenshot({ path: `${outDir}/${name}.png` });
  shots.push(name);
};

try {
  for (const palette of PALETTES) {
    for (const theme of THEMES) {
      await settle('/settings');
      await page.locator(`[data-palette-pick="${palette}"]`).click();
      await page.locator(`[data-segment="${theme}"]`).click();
      await page.waitForFunction((want) => document.documentElement.dataset.theme === want, theme);

      await settle('/settings/entry-templates');
      await page.waitForSelector('[data-entry-template]');
      await shoot(`list-${palette}-${theme}`);

      // A built-in, opened: name pre-filled by the message catalogue, tags
      // and dims empty because reconcile seeds no display text or values -
      // pick euphoria_day, which has both.
      await page.locator('[data-entry-template]').first().click();
      await page.waitForSelector('[data-add]', { state: 'hidden' }).catch(() => {});
      await page.waitForTimeout(300);
      await shoot(`edit-empty-${palette}-${theme}`);

      // Toggle a tag and drag a dimension slider, to see the picked state.
      const tagChip = page.locator('.tag-chip').first();
      if (await tagChip.count()) await tagChip.click();
      const slider = page.locator('input[type="range"]').first();
      if (await slider.count()) {
        await slider.focus();
        await page.keyboard.press('ArrowRight');
        await page.keyboard.press('ArrowRight');
      }
      const presentationChip = page.locator('.presentation-chip').first();
      if (await presentationChip.count()) await presentationChip.click();
      await page.waitForTimeout(300);
      await shoot(`edit-filled-${palette}-${theme}`);

      // Scroll the open sheet to see the tag picker and the note scaffold.
      await page.evaluate(() => {
        const sheet = document.querySelector('[role="dialog"], .sheet, .sheet-body');
        (sheet ?? document.scrollingElement)?.scrollTo({ top: 100000 });
      });
      await page.waitForTimeout(200);
      await shoot(`edit-filled-foot-${palette}-${theme}`);
    }
  }

  await page.close();
  await browser.close();
  await app.close();
} finally {
  await run('npx', ['vite', 'build'], { VITE_DEMO: '1' });
}

console.log(`\n${shots.length} shots in ${outDir}`);
for (const name of shots) console.log(`  ${name}.png`);
