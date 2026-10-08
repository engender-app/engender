import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import { launchChromium } from './browser-harness.mjs';

const out = resolve('.claude/phase-15-ux-carpet-delivery/109');
await mkdir(out, { recursive: true });
const server = await createServer({
  configFile: resolve('tests/browser-tier/browser-tier.vite.config.ts'),
  server: { port: 0 },
  plugins: [{
    name: 'session-auth-proof',
    transform(_code, id) {
      if (!id.endsWith('/src/lib/lock/keystore-bridge.ts')) return;
      return `export const androidKeystore = { confirm: async (request) => {
        window.sessionRequests.push(request);
        if (window.sessionThrow) throw new Error("native bridge unavailable");
        if (window.sessionHold) await new Promise(resolve => window.sessionRelease = resolve);
        return { outcome: window.sessionOutcome };
      } };`;
    }
  }]
});
await server.listen();
const browser = await launchChromium();
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(`http://localhost:${server.config.server.port}/gates.html`, { waitUntil: 'networkidle' });
  await page.waitForSelector('body[data-gates-ready]');
  await page.evaluate(() => { window.sessionRequests = []; window.sessionOutcome = 'unenrolled'; });
  await page.selectOption('select[aria-label="Platform"]', 'android');
  await page.selectOption('select[aria-label="Scene"]', 'session-device');
  await page.locator('[data-session-device-lock]').click();
  const fallback = page.locator('[data-session-device-credential]');
  await fallback.waitFor({ timeout: 3000 });
  assert.equal(await fallback.innerText(), 'Use your device PIN');
  assert.equal(await page.evaluate(() => window.sessionRequests[0].deviceCredential), false);
  for (const outcome of ['unenrolled', 'unavailable', 'lockedOut', 'cancelled', 'failed', 'unknown']) {
    await page.evaluate(value => { window.sessionOutcome = value; }, outcome);
    await fallback.click();
    assert.equal(await page.evaluate(() => window.sessionRequests.at(-1).deviceCredential), true);
    await page.locator('[data-pin-status="wrong"]').waitFor();
    assert.equal(await fallback.isEnabled(), true);
  }
  await page.evaluate(() => { window.sessionThrow = true; });
  await fallback.click();
  await page.locator('[data-pin-status="wrong"]').waitFor();
  assert.equal(await fallback.isEnabled(), true);
  await page.evaluate(() => { window.sessionThrow = false; });
  assert.ok(await fallback.evaluate(node => node.getBoundingClientRect().height >= 48));
  await page.locator('[data-session-device-lock]').focus();
  await page.keyboard.press('Tab');
  assert.equal(await fallback.evaluate(node => document.activeElement === node), true);
  for (const theme of ['light', 'dark']) {
    await page.selectOption('select[aria-label="Theme"]', theme);
    await page.waitForTimeout(500);
    await page.screenshot({ path: resolve(out, `session-${theme}.png`) });
  }
  await page.evaluate(() => { window.sessionHold = true; });
  await fallback.click();
  assert.equal(await fallback.isDisabled(), true);
  assert.equal(await page.locator('[data-session-device-lock]').isDisabled(), true);
  const before = await page.evaluate(() => window.sessionRequests.length);
  await page.locator('[data-session-device-lock]').evaluate(node => node.click());
  assert.equal(await page.evaluate(() => window.sessionRequests.length), before);
  await page.evaluate(() => { window.sessionHold = false; window.sessionRelease(); });
  await page.locator('[data-session-device-credential]:enabled').waitFor();
  await page.evaluate(() => { window.sessionOutcome = 'authenticated'; });
  await fallback.click();
  await page.locator('[data-session-device-credential]:disabled').waitFor();
  console.log('PASS session credential fallback, refusals, focus, feedback, concurrency, success; light/dark screenshots');
} finally {
  await browser.close();
  await server.close();
}
