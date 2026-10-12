import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import { launchChromium, settlePage } from './browser-harness.mjs';
import { PALETTES } from './palettes.mjs';

const server = await createServer({ server: { port: 0, fs: { allow: [process.cwd(), realpathSync('node_modules')] } } });
await server.listen();
const browser = await launchChromium();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
page.setDefaultTimeout(15000);
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const action = page.getByRole('link', { name: 'Manage eras', exact: true });
const region = page.locator('[data-app-scroll-region]');
const back = async () => {
  await page.locator('[data-screen-back]').click();
  await page.waitForURL('**/transition/milestones');
};

try {
  await settlePage(page, server.resolvedUrls.local[0], 'transition/milestones', 'light');
  await page.evaluate(async () => {
    const { journal } = await import('/src/lib/data/live/journal.svelte.ts');
    for (const era of await journal.eras.getEras()) await journal.eras.deleteEra(era.id);
    for (const milestone of await journal.milestones.getMilestones()) await journal.milestones.deleteMilestone(milestone.id);
  });
  await page.locator('[data-tl-era]').first().waitFor({ state: 'detached' });
  assert.equal(await page.locator('[data-tl-era]').count(), 0, 'the empty journal has no era bands');
  assert.equal(await action.count(), 1, 'Manage eras remains discoverable without an era');
  assert.equal(await action.isVisible(), true);
  assert.equal(await action.getAttribute('href'), '/settings/eras');
  if (process.argv.includes('--gallery')) {
    await mkdir('.claude/milestone-era-shots', { recursive: true });
    await page.screenshot({ path: '.claude/milestone-era-shots/empty.png' });
  }
  await action.focus();
  await page.keyboard.press('Enter');
  await page.waitForURL('**/settings/eras');
  await page.waitForFunction(() => document.activeElement?.matches('h1[data-arrival-focus]'));
  await page.locator('[data-add]').click();
  await page.locator('#era-name').fill('First era');
  await page.locator('[data-save-era]').click();
  await page.locator('#era-name').waitFor({ state: 'detached' });
  await back();
  assert.equal(await action.isVisible(), true, 'creation returns to milestones');

  await page.evaluate(async () => {
    const { journal } = await import('/src/lib/data/live/journal.svelte.ts');
    for (let i = 0; i < 24; i++) await journal.milestones.upsertMilestone({ name: `Milestone ${i}`, epochDay: 18000 + i * 30 });
  });
  const toggle = page.locator('[data-ms-log-toggle]');
  await toggle.click();
  await page.locator('[data-ms-log]').waitFor();
  await region.evaluate((el) => { el.scrollTop = 220; });
  const before = await region.evaluate((el) => el.scrollTop);
  assert.ok(before > 100, 'the milestone context starts scrolled');
  await action.evaluate((el) => el.click());
  await page.waitForURL('**/settings/eras');
  await page.locator('[data-era]').click();
  assert.equal(await page.locator('#era-name').inputValue(), 'First era', 'the action reaches the existing era editor');
  await page.locator('[data-close-record]').click();
  await page.locator('#era-name').waitFor({ state: 'detached' });
  await back();
  assert.equal(await page.locator('[data-ms-log-toggle]').getAttribute('aria-expanded'), 'true', 'the milestone disclosure remains open');
  await page.waitForFunction((before) => Math.abs(document.querySelector('[data-app-scroll-region]').scrollTop - before) <= 1, before);

  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const band = page.locator('[data-tl-era]').first();
  await band.focus();
  const bandBefore = await region.evaluate((el) => el.scrollTop);
  await page.keyboard.press('Enter');
  await page.locator('#era-name').waitFor();
  await page.waitForURL((url) => url.pathname === '/settings/eras' && !url.search);
  assert.equal(await page.locator('#era-name').inputValue(), 'First era', 'the band reaches the same editor');
  await page.locator('[data-close-record]').click();
  await page.locator('#era-name').waitFor({ state: 'detached' });
  await back();
  assert.equal(await page.locator('[data-ms-log-toggle]').getAttribute('aria-expanded'), 'true');
  await page.waitForFunction((before) => Math.abs(document.querySelector('[data-app-scroll-region]').scrollTop - before) <= 1, bandBefore);

  const eraId = await page.locator('[data-tl-era]').first().getAttribute('data-tl-era');
  await page.goto(`${server.resolvedUrls.local[0]}settings/eras?edit=${eraId}`, { waitUntil: 'networkidle' });
  await page.locator('#era-name').waitFor();
  assert.equal(await page.locator('#era-name').inputValue(), 'First era', 'direct edit links still open the era');
  await page.waitForURL((url) => url.pathname === '/settings/eras' && !url.search);
  await page.locator('[data-close-record]').click();
  await page.locator('#era-name').waitFor({ state: 'detached' });
  await page.goBack();
  await page.waitForURL('**/transition/milestones');

  if (process.argv.includes('--gallery')) {
    const out = '.claude/milestone-era-shots';
    await mkdir(out, { recursive: true });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await settlePage(page, server.resolvedUrls.local[0], 'transition/milestones', 'light');
    await region.evaluate((el) => { el.scrollTop = 0; });
    for (const palette of PALETTES) for (const theme of ['light', 'dark']) {
      await page.evaluate(async ({ palette, theme }) => {
        const { prefs } = await import('/src/lib/data/prefs/store.svelte.ts');
        prefs.palette = palette; prefs.theme = theme;
      }, { palette, theme });
      await page.waitForFunction(() => !document.documentElement.hasAttribute('data-appearance-transition')
        && !document.querySelector('.screen')?.getAnimations({ subtree: true }).some((animation) => animation.playState === 'running'));
      assert.ok((await action.boundingBox()).height >= 48, 'Manage eras has a 48px target');
      await page.screenshot({ path: `${out}/${palette}-${theme}.png` });
    }
    await page.evaluate(async () => {
      const { prefs } = await import('/src/lib/data/prefs/store.svelte.ts');
      prefs.disguise = true;
    });
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${out}/disguise.png` });
    await page.evaluate(async () => {
      const { prefs } = await import('/src/lib/data/prefs/store.svelte.ts');
      const { setLocale } = await import('/src/lib/paraglide/runtime.js');
      prefs.language = 'pl'; setLocale('pl', { reload: false });
    });
    await settlePage(page, server.resolvedUrls.local[0], 'transition/milestones', 'light');
    const polishAction = page.getByRole('link', { name: 'Zarządzaj erami', exact: true });
    for (const zoom of [1, 2]) {
      await page.evaluate((zoom) => { document.documentElement.style.zoom = String(zoom); }, zoom);
      await page.waitForTimeout(250);
      await page.screenshot({ path: `${out}/polish-zoom-${zoom}.png` });
      assert.equal(await polishAction.isVisible(), true, 'Polish Manage eras fits at 200% zoom');
      const bounds = await polishAction.boundingBox();
      assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 390, 'the era action stays within the viewport');
    }
  }
  assert.deepEqual(errors, []);
  console.log('PASS milestone era creation, shared editor, keyboard entry and return context');
} finally {
  await browser.close();
  await server.close();
}
