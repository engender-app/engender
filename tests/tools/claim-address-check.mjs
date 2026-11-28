/* The address a pick that came back during a lock is claimed under
   (stores/pendingPick.ts keys on location.pathname): it must be the same at
   the lock, while locked and after the unlock, on every screen that claims. */
import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { createServer } from 'vite';
import { launchChromium } from '../browser-harness.mjs';

const server = await createServer({
  cacheDir: '.svelte-kit/claim-address-vite',
  server: { port: 0, fs: { allow: [process.cwd(), realpathSync('node_modules')] } }
});
await server.listen();
const browser = await launchChromium();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const base = server.resolvedUrls.local[0];

async function visibility(value) {
  await page.evaluate((state) => {
    Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    delete document.visibilityState;
  }, value);
}

try {
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]', { timeout: 60000 });
  if (await page.locator('[data-leave-setup]').count()) await page.locator('[data-leave-setup]').click();
  for (const route of ['entry/new/today?open=photos', 'entry/new/today', 'media/documents']) {
    await page.goto(base + route, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-app-root][data-boot="ready"]');
    await page.evaluate(async () => {
      const { prefs } = await import('/src/lib/data/prefs/store.svelte.ts');
      const { markUnlocked } = await import('/src/lib/stores/lock.svelte.ts');
      prefs.lockAfter = 'immediately';
      markUnlocked();
    });
    const before = await page.evaluate(() => location.pathname);
    await visibility('hidden');
    await page.waitForSelector('[data-applock]');
    const during = await page.evaluate(() => location.pathname);
    await page.evaluate(async () => {
      const { markUnlocked } = await import('/src/lib/stores/lock.svelte.ts');
      markUnlocked();
    });
    await visibility('visible');
    await page.waitForSelector('[data-applock]', { state: 'detached' });
    await page.waitForLoadState('networkidle');
    const after = await page.evaluate(() => location.pathname);
    assert.equal(during, before, `${route}: address moved while locked`);
    assert.equal(after, before, `${route}: address moved across the unlock`);
    console.log(`PASS ${route} keeps ${before} across lock and unlock`);
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  await server.close();
}
