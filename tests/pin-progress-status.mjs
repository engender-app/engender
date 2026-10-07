import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import { launchChromium } from './browser-harness.mjs';

export async function verifyPinProgressStatus() {
  const server = await createServer({
    configFile: resolve('tests/browser-tier/browser-tier.vite.config.ts'),
    server: { port: 0 }
  });
  await server.listen();
  const browser = await launchChromium();
  try {
    for (const locale of ['en', 'pl']) {
      const page = await browser.newPage();
      await page.addInitScript((locale) => localStorage.setItem('PARAGLIDE_LOCALE', locale), locale);
      await page.goto(`http://localhost:${server.config.server.port}/pin-progress.html`);
      await page.waitForSelector('body[data-pin-progress-ready]', { state: 'attached' });
      const expected = (count) => locale === 'en'
        ? `PIN progress: ${count} of 4 digits`
        : `Wpisano ${count} z 4 cyfr PIN-u`;
      const status = page.locator('[role="status"]');
      const check = async (count) => {
        assert.equal(await status.textContent(), expected(count));
        const tree = await page.locator('main').ariaSnapshot();
        assert.ok(tree.includes(expected(count)), tree);
        assert.ok(!tree.includes('9876'), tree);
      };
      await status.waitFor({ state: 'attached', timeout: 3000 });
      await check(0);
      await status.evaluate((node) => { window.pinProgressStatus = node; });
      for (const [index, digit] of [...'9876'].entries()) {
        await page.locator(`[data-key="${digit}"]`).focus();
        await page.keyboard.press(index % 2 ? 'Space' : 'Enter');
        await check(index + 1);
      }
      await page.locator('[data-backspace]').focus();
      await page.keyboard.press('Space');
      await check(3);
      await page.locator('[data-refuse]').click();
      await check(0);
      assert.equal(await status.evaluate((node) => node === window.pinProgressStatus), true);
      await page.locator('[data-disable]').click();
      assert.equal(await page.locator('[data-key="9"]').isDisabled(), true);
      await check(0);
      await page.close();
      console.log(`PASS PIN progress ${locale}: 0..4, backspace, refusal, disabled, keyboard, count-only tree`);
    }
  } finally {
    await browser.close();
    await server.close();
  }
}

if (process.argv[1]?.endsWith('pin-progress-status.mjs')) {
  await verifyPinProgressStatus();
}
