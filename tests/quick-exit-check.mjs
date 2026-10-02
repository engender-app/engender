import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { createServer } from 'vite';
import { launchChromium } from './browser-harness.mjs';

const server = await createServer({
  cacheDir: '.svelte-kit/quick-exit-vite',
  server: { port: 0, fs: { allow: [process.cwd(), realpathSync('node_modules')] } }
});
await server.listen();
const browser = await launchChromium();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));

async function prepare(timing, enabled) {
  await page.evaluate(async ({ timing, enabled }) => {
    const { prefs } = await import('/src/lib/data/prefs/store.svelte.ts');
    const { markUnlocked } = await import('/src/lib/stores/lock.svelte.ts');
    prefs.lockAfter = timing;
    prefs.quickExit = enabled;
    markUnlocked();
  }, { timing, enabled });
  await page.waitForSelector('[data-nav-item="home"]');
}

async function swipe(fingers = 2) {
  const session = await page.context().newCDPSession(page);
  const points = (y) => Array.from({ length: fingers }, (_, id) => ({ x: 150 + id * 80, y, id }));
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points(220) });
  await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: points(350) });
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await session.detach();
}

async function state() {
  return page.evaluate(async () => {
    const { lockState } = await import('/src/lib/stores/lock.svelte.ts');
    return { unlocked: lockState.unlocked, blanked: lockState.blanked };
  });
}

try {
  await page.goto(server.resolvedUrls.local[0], { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]', { timeout: 60000 });
  if (await page.locator('[data-leave-setup]').count()) await page.locator('[data-leave-setup]').click();
  for (const timing of ['immediately', 'one-minute', 'five-minutes', 'restart']) {
    await prepare(timing, true);
    await swipe();
    await page.waitForSelector('.quick-exit-blank');
    assert.deepEqual(await state(), { unlocked: false, blanked: true }, timing);
    assert.equal(await page.locator('[data-nav-item="home"]').count(), 0);
    console.log(`PASS two-finger swipe locks and blanks under ${timing}`);
  }
  await prepare('restart', false);
  await swipe();
  assert.deepEqual(await state(), { unlocked: true, blanked: false });
  await prepare('restart', true);
  await swipe(1);
  assert.deepEqual(await state(), { unlocked: true, blanked: false });
  console.log('PASS disabled Quick exit and single-finger swipe leave journal open');
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  await server.close();
}
