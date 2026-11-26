import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { browserEngine, launchPersistentBrowser, previewBuild } from './browser-harness.mjs';
import { firstRun, unlock } from './browser-tier/built-flow.mjs';

// Route ids FA11 removed (they were redirect-only +page.ts files). None may come back: each must render the unknown-address screen.
// BROWSER_ENGINE=firefox runs it in Firefox, on a real profile directory.
const oldRoutes = JSON.parse(readFileSync(new URL('./old-addresses.json', import.meta.url), 'utf8'));
assert.equal(oldRoutes.length, 54);
const app = await previewBuild(process.cwd());
const base = `http://localhost:${app.httpServer.address().port}`;

async function openProfile() {
  const profile = await mkdtemp(join(tmpdir(), 'oldaddr-'));
  const context = await launchPersistentBrowser(profile, { viewport: { width: 390, height: 844 } })
    .catch(async (error) => { await rm(profile, { recursive: true, force: true }); throw error; });
  return { page: await context.newPage(), close: async () => { await context.close(); await rm(profile, { recursive: true, force: true }); } };
}

async function checkRoute(page, route) {
  const path = route.replaceAll('[id]', 'old-bookmark-id');
  await page.goto(base + path, { waitUntil: 'networkidle' });
  await page.locator('#journal-passphrase, [data-error-screen="not-found"]').first().waitFor({ timeout: 30000 });
  if (await page.locator('#journal-passphrase').count()) await unlock(page);
  await page.locator('[data-error-screen="not-found"]').waitFor({ timeout: 10000 });
  assert.equal(new URL(page.url()).pathname, path, `${route} left its own address`);
  assert.equal(await page.locator('[data-error-home][href="/"]').count(), 1);
}

try {
  /* An address opened the instant setup finishes, on four fresh profiles. Firefox lost
     `onboarded` here (the worker died mid-write) in about three runs in four, so a finished
     journal opened onto setup behind its own unlock gate. */
  for (let attempt = 1; attempt <= 4; attempt++) {
    const fresh = await openProfile();
    try {
      await firstRun(fresh.page, base);
      await checkRoute(fresh.page, oldRoutes[0]);
    } catch (error) {
      error.message = `opened at once after setup, attempt ${attempt}: ${error.message}`;
      throw error;
    } finally {
      await fresh.close();
    }
  }

  const { page, close } = await openProfile();
  try {
    await firstRun(page, base);
    for (const route of oldRoutes) await checkRoute(page, route);
  } finally {
    await close();
  }
  console.log(`${browserEngine()}: ${oldRoutes.length} old addresses rendered unknown-address screen`);
} finally {
  await new Promise((resolve) => app.httpServer.close(resolve));
}
