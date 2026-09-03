/* One-off screenshots for ticket 05 (phase 8 UX) sign-off: the interval-mood
   and custom-interval notes on /stats now only print once their card has
   something to explain. Two states, default trans theme only.

   Run against a VITE_DEMO=1 build: node tests/ux05-stats-notes-gallery.mjs [outDir] */
import { preview } from 'vite';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { launchChromium } from './browser-harness.mjs';

const outDir = resolve(process.argv[2] ?? resolve(process.cwd(), '.claude/ux05-shots'));
await mkdir(outDir, { recursive: true });

const app = await preview({ preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const browser = await launchChromium();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });

async function goto(path) {
  await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]');
}

/* The app scrolls inside [data-app-root], not the document, so a viewport
   screenshot after scrolling the target card into view is what a fullPage
   capture cannot do here (unprompted-gallery.mjs's own note). */
async function shootCard(kind, path) {
  await page.evaluate((selector) => {
    document.querySelector(selector)?.scrollIntoView({ block: 'center' });
    for (const toast of document.querySelectorAll('[data-toast]')) toast.remove();
  }, `[data-chart-card="${kind}"]`);
  await page.waitForTimeout(300);
  // [data-app-root] only, the way dose-sheet-gallery.mjs does it, so the
  // review-only demo bar never lands in a sign-off screenshot.
  await page.locator('[data-app-root]').screenshot({ path });
}

await goto('/');
if (await page.locator('[data-leave-setup]').count()) {
  await page.locator('[data-leave-setup]').click();
  await page.waitForSelector('[data-home-hello]');
}

// State A: fresh demo persona, no dose log at all (persona.ts).
await goto('/stats');
await shootCard('interval-mood', `${outDir}/a-no-doses-interval-mood.png`);
await shootCard('custom-interval', `${outDir}/a-no-doses-custom-interval.png`);

// State B: fill every feature (resolves with goto('/more') - wait for that
// before navigating on, or the click's own await races the nav). Any
// settings route boots the shell before the demo bar is queried
// (walkthrough.test.mjs).
await goto('/settings/measurements');
await page.click('[data-fill-every-feature]');
await page.waitForURL('**/more', { timeout: 120000 });
await page.waitForSelector('[data-app-root][data-boot="ready"]');
await goto('/stats');
await shootCard('interval-mood', `${outDir}/b-with-doses-interval-mood.png`);
await shootCard('custom-interval', `${outDir}/b-with-doses-custom-interval.png`);

await browser.close();
await new Promise((res) => app.httpServer.close(res));
console.log('wrote', outDir);
