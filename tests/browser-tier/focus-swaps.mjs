import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export async function focusSwaps(browser, origin, motion = 'reduce') {
  const page = await browser.newPage();
  const results = [];
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(`${origin}/focus-swaps.html?motion=${motion}`);
    await page.waitForSelector('body[data-ready]', { state: 'attached' });
    const show = (scene) => page.evaluate((scene) => window.focusSwaps.show(scene), scene);
    const enter = async (selector) => {
      const control = page.locator(selector).first();
      await control.focus();
      await control.press('Enter');
    };
    const focused = async (selector, label) => {
      await page.waitForFunction((selector) => document.activeElement?.matches(selector), selector, { timeout: 3000 });
      assert.notEqual(await page.evaluate(() => document.activeElement.tagName), 'BODY', label);
      const activeControl = await page.evaluate(() => {
        const active = document.activeElement;
        return active.matches('button, a[href]') ? { tabIndex: active.tabIndex, hidesRing: active.hasAttribute('data-arrival-focus') } : null;
      });
      if (activeControl) assert.deepEqual(activeControl, { tabIndex: 0, hidesRing: false }, `${label} stays keyboard reachable`);
      results.push(label); console.log('PASS', label);
    };
    await show('home');
    await enter('[data-edit-today]');
    await focused('[data-today-editor] h2', 'Today editor heading');
    const pins = await page.locator('[data-edit-pinned-row]').evaluateAll((rows) => rows.map((row) => row.dataset.editPinnedRow));
    await enter(`[data-edit-unpin="${pins[0]}"]`);
    await focused(`[data-edit-unpin="${pins[1]}"]`, 'Unpin next row');
    await enter(`[data-edit-add="${pins[0]}"]`);
    await focused(`[data-edit-unpin="${pins[0]}"]`, 'Add pinned row');
    for (const key of await page.locator('[data-edit-pinned-row]').evaluateAll(rows => rows.map(row => row.dataset.editPinnedRow))) {
      await enter(`[data-edit-unpin="${key}"]`);
    }
    await focused('[data-today-editor] h2', 'Unpin empty heading');
    await enter('[data-edit-done]');
    await focused('[data-edit-today]', 'Done edit row');
    await show('access');
    await enter('[data-list-row="pin"]');
    await focused('[data-access-step-heading]', 'Access detail heading');
    await enter('[data-access-continue]');
    await focused('[data-access-step-heading]', 'Access secret heading');
    for (const digit of '1234') await enter(`[data-key="${digit}"]`);
    await focused('[data-access-step-heading]', 'PIN confirmation heading');
    assert.equal(await page.locator('[data-access-step-heading]').last().textContent(), 'Type it once more');
    await enter('[data-access-secret-back]');
    await focused('[data-access-step-heading]', 'Back detail heading');
    await enter('[data-access-back]');
    await focused('[data-access-step-heading]', 'Mode list heading');
    await show('trash');
    await page.waitForSelector('[data-restore-entry]');
    const restores = await page.locator('[data-restore-entry]').evaluateAll((rows) => rows.map((row) => row.dataset.restoreEntry));
    await enter(`[data-restore-entry="${restores[0]}"]`);
    await focused(`[data-restore-entry="${restores[1]}"]`, 'Trash next row');
    await enter(`[data-restore-entry="${restores[1]}"]`);
    await focused('h1', 'Trash empty heading');
    await show('words');
    await enter('[data-unignore-word="first"]');
    await focused('[data-unignore-word="second"]', 'Words next row');
    await enter('[data-unignore-word="second"]');
    await focused('h1', 'Words empty heading');
    await show('notices');
    await enter('[data-notice="first"] [data-notice-dismiss]');
    await focused('[data-notice="second"]', 'Notice next row');
    await enter('[data-notice="second"] [data-notice-dismiss]');
    await focused('h1', 'Notice empty heading');
    await show('recovery');
    await enter('[data-make-recovery-key]');
    await focused('.rk-shown-title', 'New recovery key heading');
    await enter('[data-recovery-key-done]');
    await focused('h1', 'Recovery key done heading');
    await enter('[data-list-row="replace-recovery-key"]');
    await enter('[data-confirm-replace]');
    await focused('.rk-shown-title', 'Replacement recovery key heading');
    await enter('[data-recovery-key-done]');
    await enter('[data-list-row="remove-recovery-key"]');
    await enter('[data-confirm-revoke]');
    await focused('h1', 'Removed recovery key heading');
    assert.deepEqual(errors, []);
    return results;
  } finally { await page.close(); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { createServer } = await import('vite');
  const { launchChromium } = await import('../browser-harness.mjs');
  const server = await createServer({ configFile: resolve(import.meta.dirname, 'browser-tier.vite.config.ts'), server: { port: 0, watch: null } });
  await server.listen();
  const browser = await launchChromium();
  try { for (const motion of ['reduce', 'full']) console.log(motion, await focusSwaps(browser, `http://localhost:${server.config.server.port}`, motion)); }
  finally { await browser.close(); await server.close(); }
}
