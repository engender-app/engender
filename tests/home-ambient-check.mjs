import assert from 'node:assert/strict';
import { launchChromium, settlePage } from './browser-harness.mjs';
import { serveBuild } from './serve-build.mjs';

const app = await serveBuild(process.cwd());
const browser = await launchChromium();
const base = `http://localhost:${app.httpServer.address().port}`;
try {
  for (const theme of ['light', 'dark']) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
    await settlePage(page, base, '/', theme);
    await page.touchscreen.tap(20, 80);
    const start = Date.now();
    await page.waitForSelector('.home[data-home-ambient="paused"]', { timeout: 31_000 });
    assert(Date.now() - start >= 29_000, 'Home paused before its 30-second input deadline');
    await page.waitForFunction(() => document.getAnimations().filter((animation) =>
      ['breathe', 'face-glance', 'face-blink'].includes(animation.animationName)
    ).every((animation) => animation.playState === 'paused' && !animation.pending));
    const held = await page.evaluate(() => {
      globalThis.__homeArrivals = document.getAnimations().filter((animation) => animation.animationName === 'ring-in')
        .map((animation) => ({ animation, time: animation.currentTime }));
      globalThis.__ambientLoops = document.getAnimations().filter((animation) =>
        ['breathe', 'face-glance', 'face-blink'].includes(animation.animationName));
      return globalThis.__ambientLoops.map((animation) => ({ name: animation.animationName, time: animation.currentTime }));
    });
    assert(held.some((animation) => animation.name === 'breathe'));
    assert(held.some((animation) => animation.name === 'face-blink'));
    assert(held.some((animation) => animation.name === 'face-glance'));
    await page.waitForTimeout(700);
    assert.deepEqual(await page.evaluate(() => globalThis.__ambientLoops.map((animation) =>
      ({ name: animation.animationName, time: animation.currentTime }))), held, 'An idle loop advanced');
    await page.touchscreen.tap(20, 80);
    await page.waitForFunction(() => document.querySelector('.home')?.dataset.homeAmbient === 'running');
    const resumed = await page.evaluate(() => {
      const live = document.getAnimations();
      return globalThis.__ambientLoops.map((animation) => ({
        name: animation.animationName, time: animation.currentTime, same: live.includes(animation)
      }));
    });
    for (let i = 0; i < held.length; i++) {
      assert(resumed[i].same, 'Input replaced an ambient animation');
      assert(resumed[i].time >= held[i].time && resumed[i].time - held[i].time < 150,
        `Input jumped ${held[i].name}'s phase: ${held[i].time} to ${resumed[i].time}`);
    }
    assert(await page.evaluate(() => globalThis.__homeArrivals.every(({ animation, time }) =>
      document.getAnimations().includes(animation) && animation.playState === 'finished' &&
      animation.currentTime === time)), 'Input replayed the sun arrival');
    await page.waitForTimeout(250);
    assert(await page.evaluate(() => globalThis.__ambientLoops.some((animation) =>
      animation.animationName === 'breathe' && animation.playState === 'running')));
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForFunction(() => !document.getAnimations().some((animation) =>
      ['breathe', 'face-glance', 'face-blink'].includes(animation.animationName)));
    await page.keyboard.press('Tab');
    assert.equal(await page.locator('.home').getAttribute('data-home-ambient'), 'running');
    assert.equal(await page.evaluate(() => document.getAnimations().filter((animation) =>
      ['breathe', 'face-glance', 'face-blink'].includes(animation.animationName)).length), 0);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.waitForFunction(() => document.getAnimations().some((animation) => animation.animationName === 'breathe'));
    await page.close();
    console.log(`PASS ${theme}: 30-second pause, frozen clocks, touch resume without phase reset, reduced motion`);
  }
} finally {
  await browser.close();
  await app.close();
}
