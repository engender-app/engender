/* Keep the navigation above Quick add's backdrop for its full lifetime. */
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
      await context.addInitScript(() => { navigator.storage.persist = () => Promise.resolve(true); });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.emulateMedia({ reducedMotion: reduced ? 'reduce' : 'no-preference' });
      await settlePage(page, base, '/', theme);
      for (const action of ['escape', 'scrim', 'button']) {
        const fab = page.locator('[data-nav-fab]');
        await fab.focus();
        await page.keyboard.press('Enter');
        await page.locator('[data-fan]').waitFor();
        await page.waitForFunction(() => document.getAnimations().every(animation =>
          animation.playState !== 'running' || animation.effect?.getTiming().iterations === Infinity));
        await page.evaluate(() => {
          window.__closeLayers = [];
          const sample = () => {
            const scrim = document.querySelector('.fan-scrim');
            const nav = document.querySelector('[data-app-nav]');
            window.__closeLayers.push({ scrim: !!scrim, navZ: +getComputedStyle(nav).zIndex,
              scrimZ: scrim ? +getComputedStyle(scrim).zIndex : null });
            if (scrim) requestAnimationFrame(sample);
          };
          sample();
        });
        if (action === 'escape') await page.keyboard.press('Escape');
        else if (action === 'scrim') await page.locator('.fan-scrim').click({ position: { x: 8, y: 8 } });
        else await fab.click();
        await page.locator('.fan-scrim').waitFor({ state: 'detached' });
        await page.waitForFunction(() => window.__closeLayers.some(sample => !sample.scrim));
        const samples = await page.evaluate(() => window.__closeLayers);
        assert(samples.some(sample => sample.scrim), `${theme}/${action}: no live scrim sampled`);
        assert(samples.filter(sample => sample.scrim).every(sample => sample.navZ > sample.scrimZ),
          `${theme}/${action}: navigation drops under a live scrim`);
        assert.equal(await fab.evaluate(element => getComputedStyle(element.closest('nav')).zIndex), '30');
        if (action !== 'button') assert(await fab.evaluate(element => element === document.activeElement),
          `${theme}/${action}: cancelling did not restore add-button focus`);
        assert.equal(new URL(page.url()).pathname, '/');
        console.log(`PASS ${theme}/${reduced ? 'reduced' : 'full'}/${action}: layer lifetime, route, focus`);
      }
      const navigation = page.locator('[data-app-nav] a[href="/calendar"]');
      const destination = await navigation.getAttribute('href');
      const target = await navigation.boundingBox();
      assert(target.width >= 48 && target.height >= 48, 'navigation target falls below 48px');
      await navigation.click();
      await page.waitForURL(`**${destination}`);
      console.log(`PASS ${theme}/${reduced ? 'reduced' : 'full'}: navigation after cancellation`);
      assert.deepEqual(errors, []);
      await context.close();
    }
  }
} finally {
  await browser.close();
  await app.close();
}
