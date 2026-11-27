import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { createServer } from 'vite';
import { launchBrowser, untilSplashLets } from './browser-harness.mjs';

const server = await createServer({
  server: { port: 0, watch: null, fs: { allow: [process.cwd(), realpathSync('node_modules')] } },
  plugins: [{ name: 'language-no-watch', configResolved(config) { config.server.watch = null; } }]
});
await server.listen();
const browser = await launchBrowser();
const context = await browser.newContext({ locale: 'en-GB', hasTouch: true });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
let loads = 0;
page.on('load', () => loads++);

async function ready() {
  await page.waitForSelector('[data-app-root][data-boot="ready"]', { timeout: 60000 });
  await untilSplashLets(page);
}
const language = page.locator('[data-segmented="language"][role="radiogroup"]');
const option = value => language.locator(`[data-segment="${value}"]`);

try {
  await page.goto(new URL('/settings', server.resolvedUrls.local[0]).href, { waitUntil: 'networkidle' });
  await ready();
  if (await page.locator('[data-leave-setup]').count()) {
    await page.locator('[data-leave-setup]').click();
    await page.goto(new URL('/settings', server.resolvedUrls.local[0]).href, { waitUntil: 'networkidle' });
    await ready();
  }
  await language.waitFor();
  assert.equal(await option('system').getAttribute('aria-checked'), 'true');
  assert.equal(await page.getAttribute('html', 'lang'), 'en');
  await option('system').focus();
  const beforeArrows = loads;
  for (const value of ['en', 'pl']) {
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(value => document.activeElement?.getAttribute('data-segment') === value, value);
    assert.equal(await option('system').getAttribute('aria-checked'), 'true', 'arrows retain the saved System preference');
    assert.equal(await option(value).getAttribute('aria-checked'), 'false', 'focus does not select a language');
    assert.equal(await language.locator('[role="radio"][tabindex="0"]').count(), 1);
    assert.equal(await option(value).getAttribute('tabindex'), '0');
    assert.equal(await page.getAttribute('html', 'lang'), 'en');
    assert.equal(loads, beforeArrows, 'arrows must not reload');
  }
  await Promise.all([page.waitForEvent('load'), page.keyboard.press('Enter')]);
  await ready();
  assert.equal(await page.getAttribute('html', 'lang'), 'pl');
  assert.equal(loads, beforeArrows + 1);
  await language.waitFor();
  assert.equal(await option('pl').getAttribute('aria-checked'), 'true', 'Enter persists the focused language across reload');
  await option('pl').focus();
  await page.keyboard.press('ArrowLeft');
  await page.waitForFunction(() => document.activeElement?.getAttribute('data-segment') === 'en');
  assert.equal(await option('pl').getAttribute('aria-checked'), 'true');
  assert.equal(await page.getAttribute('html', 'lang'), 'pl');
  await Promise.all([page.waitForEvent('load'), page.keyboard.press('Space')]);
  await ready();
  assert.equal(await page.getAttribute('html', 'lang'), 'en');
  await language.waitFor();
  assert.equal(await option('en').getAttribute('aria-checked'), 'true', 'Space persists the focused language across reload');
  await Promise.all([page.waitForEvent('load'), option('pl').tap()]);
  await ready();
  assert.equal(await page.getAttribute('html', 'lang'), 'pl');
  await language.waitFor();
  assert.equal(await option('pl').getAttribute('aria-checked'), 'true', 'touch still commits immediately');
  assert.deepEqual(errors, []);
  console.log('PASS Language arrows retain System and locale without reload; Enter, Space and touch commit durably');
} finally {
  await context.close();
  await browser.close();
  await server.close();
}
