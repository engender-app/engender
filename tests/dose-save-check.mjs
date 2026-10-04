import assert from 'node:assert/strict';
import { launchChromium, previewBuild, settlePage } from './browser-harness.mjs';

const app = await previewBuild(process.cwd());
const base = `http://localhost:${app.httpServer.address().port}`;
const browser = await launchChromium();
try {
  for (const entry of ['care', 'quick-add', 'today']) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: entry === 'care' ? 'no-preference' : 'reduce' });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await settlePage(page, base, '/care/regimen', 'light');
    await page.locator('[data-add]').click();
    await page.locator('[data-own]').click();
    await page.locator('#regimen-drug').fill('Estradiol');
    await page.locator('#regimen-dose').fill('40');
    await page.locator('#regimen-dose-unit').fill('mg');
    await page.locator('#regimen-route').fill('IM every 7 days');
    await page.locator('#regimen-interval').fill('weekly');
    await page.locator('[data-save-regimen]').click();
    await page.waitForSelector('[data-sheet]', { state: 'detached' });
    await settlePage(page, base, entry === 'care' ? '/care' : '/', 'light');
    await page.evaluate(() => {
      window.doseOpenings = 0;
      const seen = new WeakSet();
      new MutationObserver((mutations) => {
        for (const mutation of mutations) for (const node of mutation.addedNodes) {
          if (!(node instanceof HTMLElement)) continue;
          for (const candidate of [node, ...node.querySelectorAll('[data-sheet]')]) {
            if (candidate.matches('[data-sheet]') && candidate.querySelector('[data-save-dose]') && !seen.has(candidate)) {
              seen.add(candidate);
              window.doseOpenings++;
            }
          }
        }
      }).observe(document.body, { childList: true, subtree: true });
    });
    if (entry === 'care') await page.locator('a[href="/care/doses?add=1&drug=Estradiol"]').click();
    if (entry === 'quick-add') {
      await page.locator('[data-nav-fab]').click();
      await page.locator('[data-choose="dose"]').click();
    }
    if (entry === 'today') await page.locator('[data-dose-add]').click();
    await page.locator('[data-save-dose]').waitFor();
    const before = await page.locator('[data-dose]').count();
    assert.equal(await page.locator('#dose-requirements').count(), 0, 'Opening has no validation announcement');
    await page.locator('button[data-site="thigh-left"]').click();
    assert.equal(await page.locator('[data-app-root]').evaluate((node) => node.scrollTop), 0, 'Sheet cannot scroll the fixed app frame');
    if (entry === 'care') {
      const main = page.locator('[data-app-scroll-region]');
      const scrollBefore = await main.evaluate((node) => node.scrollTop);
      assert.equal(await main.evaluate((node) => getComputedStyle(node).overflowY), 'hidden');
      await page.mouse.move(5, 20);
      await page.mouse.wheel(0, 300);
      await page.waitForTimeout(100);
      assert.equal(await main.evaluate((node) => node.scrollTop), scrollBefore, 'Background stays locked');
      await page.locator('[data-dose-what]').click();
      await page.waitForTimeout(400);
      await page.locator('#dose-amount').focus();
      const reachable = await page.locator('#dose-amount').evaluate((node) => {
        const input = node.getBoundingClientRect();
        const sheet = node.closest('[data-sheet]').getBoundingClientRect();
        const app = document.querySelector('[data-app-root]').getBoundingClientRect();
        return document.activeElement === node && input.top >= Math.max(sheet.top, app.top) && input.bottom <= Math.min(sheet.bottom, app.bottom);
      });
      assert.equal(reachable, true, 'Focused amount stays reachable in a tall sheet');
      await page.locator('[data-dose-what]').click();
      await page.waitForTimeout(400);
    }
    await page.locator('[data-save-dose]').click();
    await page.locator('[data-sheet]').waitFor({ state: 'detached', timeout: 2000 });
    const status = page.locator('[data-toast-kind="dose-saved"]');
    assert.equal(await status.getAttribute('role'), 'status');
    assert.equal(await status.innerText(), 'Dose saved.'); // text-under-test: save confirmation
    await page.waitForFunction((count) => document.querySelectorAll('[data-dose]').length === count, before + 1);
    await page.waitForTimeout(350);
    assert.equal(await page.locator('[data-sheet]').count(), 0, 'Sheet stays closed after live reads settle');
    assert.equal(await page.locator('[data-app-root]').evaluate((node) => node.scrollTop), 0, 'App frame stays fixed after close');
    assert.equal(await page.locator('[data-dose]').count(), before + 1, 'One save adds one row');
    assert.equal(await page.evaluate(() => window.doseOpenings), 1, 'Arrival opens editor once across live-query updates');
    assert.equal(await page.locator('#dose-requirements').count(), 0, 'Closed editor clears validation live region');
    assert.equal(await status.evaluate((node) => node.contains(document.activeElement)), false, 'Confirmation does not take focus');
    await page.locator('[data-screen-back]').click();
    await page.waitForURL(`${base}${entry === 'care' ? '/care' : '/'}`);
    assert.equal(await page.locator('[data-sheet]').count(), 0, 'Back does not reopen editor');
    await page.goForward();
    await page.waitForURL((url) => url.pathname === '/care/doses' && !url.searchParams.has('add'));
    assert.equal(await page.locator('[data-sheet]').count(), 0, 'Returning to saved log does not reopen editor');
    assert.deepEqual(errors, []);
    console.log(`PASS ${entry}: one dose, closed editor, status confirmation, clean return`);
    await page.close();
  }
} finally {
  await browser.close();
  await app.close();
}
