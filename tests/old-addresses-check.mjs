import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { launchChromium, previewBuild } from './browser-harness.mjs';
import { firstRun, unlock } from './browser-tier/built-flow.mjs';

// Snapshot of 52 route ids that had redirect-only +page.ts files before FA11.
const oldRoutes = JSON.parse(readFileSync(new URL('./old-addresses.json', import.meta.url), 'utf8'));
assert.equal(oldRoutes.length, 52);
const app = await previewBuild(process.cwd());
const browser = await launchChromium();
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const base = `http://localhost:${app.httpServer.address().port}`;
  await firstRun(page, base);
  for (const route of oldRoutes) {
    const path = route.replaceAll('[id]', 'old-bookmark-id');
    await page.goto(base + path, { waitUntil: 'networkidle' });
    if (await page.locator('#journal-passphrase').count()) await unlock(page);
    await page.locator('[data-error-screen="not-found"]').waitFor({ timeout: 10000 });
    assert.equal(new URL(page.url()).pathname, path);
    assert.equal(await page.locator('[data-error-home][href="/"]').count(), 1);
  }
  console.log(`${oldRoutes.length} old addresses rendered unknown-address screen`);
} finally {
  await browser.close();
  await new Promise((resolve) => app.httpServer.close(resolve));
}
