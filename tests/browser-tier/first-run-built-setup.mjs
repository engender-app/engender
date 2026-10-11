import assert from 'node:assert/strict';
import { preview } from 'vite';

/** A stale compiled onboarding form must yield to the existing unlock gate. */
export async function firstRunBuiltSetup(browser) {
  const server = await preview({ preview: { port: 0 } });
  const origin = `http://localhost:${server.httpServer.address().port}`;
  const context = await browser.newContext({ viewport: { width: 440, height: 940 }, locale: 'en-US', reducedMotion: 'reduce' });
  const a = await context.newPage(), b = await context.newPage();
  const errors = [];
  for (const page of [a, b]) {
    page.setDefaultTimeout(30000);
    page.on('pageerror', (error) => errors.push(error.message));
  }
  async function reachSecret(page, secret) {
    await page.goto(origin);
    await page.locator('[data-next]').waitFor();
    for (let step = 0; step < 10 && !(await page.locator('[data-access-modes]').count()); step++) {
      await page.locator('[data-next]').click();
      await page.waitForTimeout(350);
    }
    await page.locator('[data-list-row="passphrase"]').click();
    await page.locator('[data-access-continue]').click();
    await page.locator('#am-passphrase').fill(secret);
    await page.locator('#am-passphrase-confirm').fill(secret);
  }
  async function metadata(page) {
    return page.evaluate(async () => {
      const root = await navigator.storage.getDirectory();
      return (await (await root.getFileHandle('keystore.json')).getFile()).text();
    });
  }
  try {
    await reachSecret(a, 'original-test-password');
    await reachSecret(b, 'stale-test-password');
    assert.equal(await b.locator('[data-access-submit]').isEnabled(), true);
    await a.locator('[data-access-submit]').click();
    await a.locator('[data-access-submit]').waitFor({ state: 'detached' });
    const first = await metadata(a);
    await b.locator('[data-access-submit]').click();
    await b.locator('#journal-passphrase[autocomplete="current-password"]').waitFor();
    assert.equal(await metadata(b), first);
    await a.close();
    await b.locator('#journal-passphrase').fill('original-test-password');
    await b.locator('[data-passphrase-submit]').click();
    await b.locator('#journal-passphrase').waitFor({ state: 'detached' });
    assert.equal(await metadata(b), first);
    assert.deepEqual(errors, []);
    return { staleFormReachedUnlock: true, metadataUnchanged: true, originalCredentialReopened: true };
  } finally { await context.close(); await server.close(); }
}
