import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { firstRun, ready } from './built-flow.mjs';

/** Runs against the complete shell, including actual gate removal and route arrival. */
export async function focusArrival(browser, origin) {
  const app = origin ? null : await (await import('../browser-harness.mjs')).previewBuild(process.cwd());
  origin ??= `http://localhost:${app.httpServer.address().port}`;
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await firstRun(page, origin);
    await page.reload();
    await page.locator('#journal-passphrase').fill('verify-build passphrase');
    await page.locator('[data-passphrase-submit]').press('Enter');
    await ready(page);
    await page.waitForFunction(() => document.activeElement?.matches('[data-home-hero]'), null, { timeout: 5000 });
    assert.notEqual(await page.evaluate(() => document.activeElement.tagName), 'BODY');
    return ['cold unlock focuses Today heading'];
  } finally {
    await context.close();
    if (app) await new Promise(resolve => app.httpServer.close(resolve));
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { launchChromium, previewBuild } = await import('../browser-harness.mjs');
  const app = await previewBuild(process.cwd());
  const browser = await launchChromium();
  try { console.log(await focusArrival(browser, `http://localhost:${app.httpServer.address().port}`)); }
  finally { await browser.close(); await new Promise(resolve => app.httpServer.close(resolve)); }
}
