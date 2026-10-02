import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { createServer } from 'vite';
import { launchChromium } from './browser-harness.mjs';

const server = await createServer({
  cacheDir: '.svelte-kit/leave-lock-vite',
  server: { port: 0, fs: { allow: [process.cwd(), realpathSync('node_modules')] } }
});
await server.listen();
const browser = await launchChromium();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));

async function prepare(timing) {
  await page.evaluate(async ({ timing }) => {
    const { prefs } = await import('/src/lib/data/prefs/store.svelte.ts');
    const { markUnlocked } = await import('/src/lib/stores/lock.svelte.ts');
    prefs.lockAfter = timing;
    markUnlocked();
  }, { timing });
  await page.waitForSelector('[data-nav-item="home"]');
}

async function swipe() {
  const session = await page.context().newCDPSession(page);
  const points = (y) => Array.from({ length: 2 }, (_, id) => ({ x: 150 + id * 80, y, id }));
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points(220) });
  await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: points(350) });
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await session.detach();
}

async function state() {
  return page.evaluate(async () => {
    const { lockState } = await import('/src/lib/stores/lock.svelte.ts');
    return lockState.unlocked;
  });
}

try {
  await page.goto(server.resolvedUrls.local[0], { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]', { timeout: 60000 });
  if (await page.locator('[data-leave-setup]').count()) await page.locator('[data-leave-setup]').click();
  await page.goto(server.resolvedUrls.local[0] + 'settings', { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-settings-list]');
  await page.locator('[data-list-row="disguise"]').click();
  assert.equal(await page.getByRole('switch', { name: 'Quick exit', exact: true }).count(), 0);
  assert.equal(await page.getByRole('switch', { name: 'Disguise app', exact: true }).count(), 1);
  await page.keyboard.press('Escape');
  await page.waitForSelector('[data-sheet]', { state: 'detached' });
  for (const timing of ['immediately', 'one-minute', 'five-minutes', 'restart']) {
    await prepare(timing);
    await swipe();
    assert.equal(await state(), true, `swipe under ${timing}`);
    await page.waitForSelector('[data-nav-item="home"]');
    console.log(`PASS two-finger swipe leaves journal open under ${timing}`);
  }
  await prepare('immediately');
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    delete document.visibilityState;
  });
  await page.waitForSelector('[data-applock]');
  assert.equal(await state(), false);
  assert.equal(await page.locator('[data-settings-list]').count(), 0);
  console.log('PASS Immediately locks on leave and unmounts journal');
  await prepare('restart');
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    delete document.visibilityState;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  assert.equal(await state(), true);
  console.log('PASS restart timing leaves running journal open');
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  await server.close();
}
