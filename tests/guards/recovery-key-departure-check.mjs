import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { createServer } from 'vite';
import { launchChromium } from '../browser-harness.mjs';

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

// The demo journal is a passphrase journal; a hidden page under "immediately"
// is the same lock switching apps triggers.
async function lockImmediately() {
  await page.evaluate(async () => {
    const { prefs } = await import('/src/lib/data/prefs/store.svelte.ts');
    window.rkLockAfter ??= prefs.lockAfter;
    prefs.lockAfter = 'immediately';
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    delete document.visibilityState;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.locator('[data-applock]').waitFor();
  await page.waitForFunction(async () => {
    const { bootState } = await import('/src/lib/stores/boot.svelte.ts');
    return bootState.journal === null;
  });
}

async function unlock() {
  await page.locator('#session-passphrase').fill('demo');
  await page.locator('[data-session-submit]').click();
  await page.locator('[data-applock]').waitFor({ state: 'detached' });
}

try {
  await page.goto(server.resolvedUrls.local[0], { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]', { timeout: 60000 });
  if (await page.locator('[data-leave-setup]').count()) {
    await page.locator('[data-leave-setup]').click();
    await page.waitForSelector('[data-home-hello]');
  }

  await navigate('/settings/recovery-key');
  await page.locator('[data-make-recovery-key]').click();
  await page.locator('#current-protection-secret').fill('demo');
  await page.locator('[data-confirm-current-protection]').click();
  let shown = (await page.locator('[data-recovery-key]').innerText()).trim();

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

  // A lock is the one departure that cannot ask (last-audit UI 09): leaving
  // the app under "immediately" unmounts the screen, and the key used to go
  // with it while the screen came back saying a key was active.
  await lockImmediately();
  assert.equal((await page.content()).includes(shown), false, 'the locked gate holds no key text');
  const lockedStorage = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }));
  assert.equal(lockedStorage.includes(shown), false);
  console.log('PASS the locked gate and web storage hold no recovery key text');

  // Recorded from the unlock on: the screen must come back to the key
  // without first drawing the active-key rows it would otherwise fall to.
  await page.evaluate(() => {
    window.rkPaintedBeforeKey = [];
    const watch = new MutationObserver(() => {
      if (document.querySelector('[data-recovery-key]')) return watch.disconnect();
      for (const selector of ['[data-list-row="replace-recovery-key"]', '[data-make-recovery-key]']) {
        if (document.querySelector(selector)) window.rkPaintedBeforeKey.push(selector);
      }
    });
    watch.observe(document.body, { childList: true, subtree: true });
  });
  await unlock();
  await page.locator('[data-recovery-key]').waitFor();
  assert.equal((await page.locator('[data-recovery-key]').innerText()).trim(), shown, 'the same key comes back after unlocking');
  assert.equal(new URL(page.url()).pathname, '/settings/recovery-key');
  assert.deepEqual(await page.evaluate(() => window.rkPaintedBeforeKey), [], 'no frame drew the active-key state first');
  assert.equal(
    await page.evaluate(() => document.activeElement?.matches('#app-main h1') ?? false),
    true,
    'the returned key takes the screen heading as arrival focus'
  );
  console.log('PASS unlocking returns the same unacknowledged key, focus on the screen heading');

  await page.evaluate(() => {
    navigator.clipboard.writeText = async (text) => { window.rkCopied = text; };
  });
  await page.locator('[data-copy-recovery-key]').click();
  await page.waitForFunction(() => window.rkCopied !== undefined);
  assert.equal(await page.evaluate(() => window.rkCopied), shown, 'Copy copies the returned key');
  console.log('PASS Copy on the returned key copies the same characters');

  await page.locator('[data-screen-back]').click();
  await keepWriting(shown);
  console.log('PASS the returned key keeps its departure guard');

  await page.locator('[data-recovery-key-done]').click();
  await page.locator('[data-recovery-key]').waitFor({ state: 'detached' });
  await lockImmediately();
  await unlock();
  await page.locator('[data-list-row="replace-recovery-key"]').waitFor();
  assert.equal(await page.locator('[data-recovery-key]').count(), 0);
  console.log('PASS an acknowledged key does not come back after another lock');
  await page.evaluate(async () => {
    const { prefs } = await import('/src/lib/data/prefs/store.svelte.ts');
    prefs.lockAfter = window.rkLockAfter;
  });

  await page.locator('[data-list-row="replace-recovery-key"]').click();
  await page.locator('[data-confirm-replace]').click();
  await page.locator('#current-protection-secret').fill('demo');
  await page.locator('[data-confirm-current-protection]').click();
  shown = (await page.locator('[data-recovery-key]').innerText()).trim();

  await page.locator('[data-recovery-key-done]').click();
  await page.locator('[data-screen-back]').click();
  await page.waitForURL((url) => url.pathname !== '/settings/recovery-key');
  assert.equal(await page.locator('[data-keep-writing-recovery-key]').count(), 0);
  console.log('PASS acknowledgement removes the departure guard');

  await navigate('/settings/security');
  await page.locator('a[href="/settings/recovery-key"]').click();
  await page.locator('[data-list-row="replace-recovery-key"]').click();
  await page.locator('[data-confirm-replace]').click();
  await page.locator('#current-protection-secret').fill('demo');
  await page.locator('[data-confirm-current-protection]').click();
  await page.waitForSelector('[data-recovery-key]');
  await page.locator('[data-nav-item="calendar"]:visible').click();
  await page.locator('[data-leave-recovery-key]').click();
  await page.waitForURL((url) => url.pathname === '/calendar');
  console.log('PASS deliberate Leave resumes requested in-app navigation');
} finally {
  await browser.close();
  await server.close();
}
