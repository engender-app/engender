import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const endpoint = process.env.WORDMARK_CDP;
if (!endpoint) throw new Error('WORDMARK_CDP must point to the isolated test APK WebView');
const browser = await chromium.connectOverCDP(endpoint);
const page = browser.contexts()[0].pages()[0];
page.setDefaultTimeout(20000);
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const results = [];
try {
  await page.goto('https://localhost/ui03/index.html');
  await page.waitForFunction(() => !!window.wordmarkProbe);
  assert.equal(await page.evaluate(() => window.Capacitor.getPlatform()), 'android');
  for (const locale of ['en', 'pl']) for (const theme of ['light', 'dark']) for (const disguise of [false, true]) {
    const name = disguise ? locale === 'pl' ? 'Notatki' : 'Notes' : 'engender';
    for (const scene of ['cold', 'session']) {
      await page.evaluate(({ scene, locale, disguise, theme }) => window.wordmarkProbe.show(scene, locale, disguise, theme), { scene, locale, disguise, theme });
      const selector = scene === 'cold' ? '[data-key-status]' : '[data-pin-status="wrong"]';
      await page.waitForFunction(({ selector, name }) => document.querySelector(selector)?.textContent.includes(name), { selector, name });
      await page.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all(document.getAnimations().filter(a => a.playState === 'running' && a.effect?.getTiming().iterations !== Infinity).map(a => a.finished.catch(() => {})));
      });
      const text = await page.locator(selector).innerText();
      const gateText = await page.locator('#gate').innerText();
      if (disguise) assert.doesNotMatch(gateText, /engender/i);
      else assert.doesNotMatch(gateText, /\b(?:Notes|Notatki)\b/);
      assert.equal(await page.locator('[data-session-device-credential]').count(), scene === 'session' ? 1 : 0);
      results.push({ scene, locale, theme, disguise, text });
    }
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ platform: 'android', userAgent: await page.evaluate(() => navigator.userAgent), checks: results.length, results }, null, 2));
} finally { await browser.close(); }
