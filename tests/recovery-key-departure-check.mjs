import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { createServer } from 'vite';
import { launchChromium } from './browser-harness.mjs';

const server = await createServer({ server: { port: 0, fs: { allow: [process.cwd(), realpathSync('node_modules')] } } });
await server.listen();
const browser = await launchChromium();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
page.setDefaultTimeout(15000);

async function navigate(path) {
  await page.evaluate((href) => {
    const link = document.createElement('a');
    link.href = href;
    document.body.append(link);
    link.click();
    link.remove();
  }, path);
  await page.waitForURL((url) => url.pathname === path);
}

async function keepWriting(expectedKey) {
  await page.locator('[data-keep-writing-recovery-key]').click();
  await page.locator('[data-keep-writing-recovery-key]').waitFor({ state: 'detached' });
  assert.equal((await page.locator('[data-recovery-key]').innerText()).trim(), expectedKey);
  assert.equal(new URL(page.url()).pathname, '/settings/recovery-key');
}

try {
  await page.goto(server.resolvedUrls.local[0], { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]');
  if (await page.locator('[data-leave-setup]').count()) {
    await page.locator('[data-leave-setup]').click();
    await page.waitForSelector('[data-home-hello]');
  }

  await navigate('/settings/recovery-key');
  await page.locator('[data-make-recovery-key]').click();
  const shown = (await page.locator('[data-recovery-key]').innerText()).trim();

  await page.locator('[data-screen-back]').click();
  assert.match(await page.locator('[data-sheet]').last().innerText(), /reload this page or close the app/);
  for (const selector of ['[data-keep-writing-recovery-key]', '[data-leave-recovery-key]']) {
    const box = await page.locator(selector).boundingBox();
    assert.ok(box.width >= 48 && box.height >= 48);
  }
  await keepWriting(shown);
  console.log('PASS header Back keeps the displayed recovery key after cancellation');

  await page.locator('[data-nav-item="calendar"]:visible').click();
  await keepWriting(shown);
  console.log('PASS in-app tab departure uses the same recovery-key choice');

  await page.evaluate(() => history.back());
  await keepWriting(shown);
  console.log('PASS browser Back keeps the displayed recovery key after cancellation');

  const stored = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }));
  assert.equal(stored.includes(shown), false);
  console.log('PASS displayed recovery key is absent from web storage');

  await page.locator('[data-recovery-key-done]').click();
  await page.locator('[data-screen-back]').click();
  await page.waitForURL((url) => url.pathname !== '/settings/recovery-key');
  assert.equal(await page.locator('[data-keep-writing-recovery-key]').count(), 0);
  console.log('PASS acknowledgement removes the departure guard');

  await navigate('/settings/security');
  await page.locator('a[href="/settings/recovery-key"]').click();
  await page.locator('[data-list-row="replace-recovery-key"]').click();
  await page.locator('[data-confirm-replace]').click();
  await page.waitForSelector('[data-recovery-key]');
  await page.locator('[data-nav-item="calendar"]:visible').click();
  await page.locator('[data-leave-recovery-key]').click();
  await page.waitForURL((url) => url.pathname === '/calendar');
  console.log('PASS deliberate Leave resumes requested in-app navigation');
} finally {
  await browser.close();
  await server.close();
}
