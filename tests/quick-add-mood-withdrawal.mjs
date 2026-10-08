/* Quick add must finish withdrawing before navigation captures its backdrop.
   Run against a demo build: node tests/quick-add-mood-withdrawal.mjs. */
import assert from 'node:assert/strict';
import { launchChromium, previewBuild, settlePage } from './browser-harness.mjs';
import { INIT_HIDE_DEMO_SCRIPT } from './yank-sweep-core.mjs';

const browser = await launchChromium();
const app = await previewBuild(process.cwd());
const base = `http://localhost:${app.httpServer.address().port}`;
try {
  for (const theme of ['light', 'dark']) {
    for (const reduced of [false, true]) {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
      await context.addInitScript(INIT_HIDE_DEMO_SCRIPT);
      await context.addInitScript(() => {
        navigator.storage.persist = () => Promise.resolve(true);
      });
      const page = await context.newPage();
      await page.emulateMedia({ reducedMotion: reduced ? 'reduce' : 'no-preference' });
      await settlePage(page, base, '/', theme);
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      for (const input of ['tap', 'keyboard', 'slide']) {
        await settlePage(page, base, '/', theme);
        await page.evaluate(() => {
          window.__moodDeparture = [];
          const start = document.startViewTransition?.bind(document);
          if (start) document.startViewTransition = (...args) => {
            const scrim = document.querySelector('.fan-scrim');
            window.__moodDeparture.push(scrim ? +getComputedStyle(scrim).opacity : 0);
            return start(...args);
          };
        });
        const fab = page.locator('[data-nav-fab]');
        if (input === 'keyboard') {
          await fab.focus();
          await page.keyboard.press('Enter');
        } else if (input === 'slide') {
          const box = await fab.boundingBox();
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
          await page.mouse.down();
        } else await fab.click();
        await page.locator('[data-fan]').waitFor();
        await page.waitForFunction(() => document.getAnimations().every(a =>
          a.playState !== 'running' || a.effect?.getTiming().iterations === Infinity));
        const target = page.locator('[data-fan-target="mood-4"]');
        if (reduced) assert.equal(await page.locator('.fan-scrim').evaluate(el =>
          getComputedStyle(el).backdropFilter), 'none');
        if (input === 'keyboard') {
          await target.focus();
          await page.keyboard.press('Enter');
        } else if (input === 'slide') {
          const box = await target.boundingBox();
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 6 });
          await page.mouse.up();
        } else await target.click();
        await page.waitForURL('**/entry/new/today?seedMood=4');
        await page.locator('[data-save-moods] [data-mood="4"][aria-checked="true"]').waitFor();
        await page.waitForFunction(() => document.activeElement?.matches('#app-main h1'));
        const departures = await page.evaluate(() => window.__moodDeparture);
        if (!reduced) assert(departures.every(opacity => opacity <= 0.01), `${theme}/${input}: navigation captures a live scrim: ${departures}`);
        await page.locator('[data-fan]').waitFor({ state: 'detached' });
        console.log(`PASS ${theme}/${reduced ? 'reduced' : 'full'}/${input}: withdrawal, mood, route, heading focus`);
      }
      assert.deepEqual(errors, []);
      await context.close();
    }
  }
} finally {
  await browser.close();
  await app.close();
}
