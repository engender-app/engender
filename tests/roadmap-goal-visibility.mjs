import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { launchChromium, previewBuild } from './browser-harness.mjs';
import { INIT_HIDE_DEMO_SCRIPT } from './yank-sweep-core.mjs';
import { PALETTES } from './palettes.mjs';

const gallery = process.argv.includes('--gallery');
const locale = process.argv.includes('--polish') ? 'pl' : 'en';
const narrow = process.argv.includes('--zoom');
const out = resolve('.claude/roadmap-visibility-shots');
if (gallery) await mkdir(out, { recursive: true });
const app = await previewBuild(process.cwd());
const base = `http://localhost:${app.httpServer.address().port}`;
const browser = await launchChromium();
const page = await browser.newPage({ viewport: { width: narrow ? 195 : 390, height: 844 }, locale });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const key = 'pl-legal-appeal';
const row = () => page.locator(`[data-goal="${key}"]`);
const visibility = () => page.locator(`[data-goal-visibility="${key}"]`);
try {
  await page.addInitScript(INIT_HIDE_DEMO_SCRIPT);
  await page.addInitScript((locale) => localStorage.setItem('PARAGLIDE_LOCALE', locale), locale);
  await page.goto(`${base}/transition/roadmap`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]', { timeout: 60000 });
  if (await page.locator('[data-leave-setup]').count()) {
    await page.locator('[data-leave-setup]').click();
    await page.goto(`${base}/transition/roadmap`, { waitUntil: 'networkidle' });
  }
  await page.locator('[data-segment="legal"]').click();
  await row().waitFor({ state: 'visible' });
  const status = await row().getAttribute('data-status');
  const otherStates = await page.locator(`[data-goal]:not([data-goal="${key}"])`).evaluateAll((nodes) => nodes.map((node) => [node.dataset.goal, node.dataset.status]));
  await page.locator(`[data-open-goal="${key}"]`).click();
  assert.equal(await visibility().getAttribute('data-hidden'), 'false');
  const statusLabel = await page.locator(`[data-goal-sheet-status="${key}"] .kit-row-title`).innerText();
  await visibility().click();
  await row().waitFor({ state: 'detached' });
  assert.equal(await page.locator('[data-track-toggle="legal"]').getAttribute('data-dismissed'), 'false');
  assert.deepEqual(await page.locator(`[data-goal]:not([data-goal="${key}"])`).evaluateAll((nodes) => nodes.map((node) => [node.dataset.goal, node.dataset.status])), otherStates);

  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('[data-show-hidden-goals]').click();
  await page.locator(`[data-hidden-goal="${key}"]`).waitFor({ state: 'visible' });
  if (gallery) {
    for (const theme of ['light', 'dark']) {
      for (const palette of PALETTES) {
        await page.evaluate(({ theme, palette }) => {
          document.documentElement.dataset.theme = theme;
          document.documentElement.dataset.palette = palette;
        }, { theme, palette });
        await page.waitForTimeout(300);
        await page.screenshot({ path: `${out}/hidden-${palette}-${theme}.png` });
      }
    }
  }
  await page.locator(`[data-hidden-goal="${key}"]`).click();
  assert.equal(await visibility().getAttribute('data-hidden'), 'true');
  assert.equal(await page.locator(`[data-goal-sheet-status="${key}"] .kit-row-title`).innerText(), statusLabel);
  if (gallery) {
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${out}/restore-goal.png` });
  }
  await page.keyboard.press('Escape');

  // Document links name the bundled key, even when the normal list omits it.
  await page.goto(`${base}/transition/roadmap?goal=${key}`, { waitUntil: 'networkidle' });
  await visibility().waitFor({ state: 'visible' });
  assert.equal(await visibility().getAttribute('data-hidden'), 'true');
  assert.equal(await row().count(), 0);
  await visibility().click();
  await page.locator('[data-segment="legal"]').click();
  await row().waitFor({ state: 'visible' });
  assert.equal(await row().getAttribute('data-status'), status);
  await page.reload({ waitUntil: 'networkidle' });
  await row().waitFor({ state: 'attached' });
  assert.equal(await row().getAttribute('data-status'), status);
  assert.equal(await page.locator('[data-show-hidden-goals]').count(), 0);
  assert.deepEqual(errors, []);
  console.log('Roadmap goal visibility: hide, reload, source link and restore passed');
} finally {
  await browser.close();
  await app.close();
}
