/* Ticket 42: selected track context must travel with the shown goal list.
   Runs against the demo production build. */
import { preview } from 'vite';
import { launchChromium } from './browser-harness.mjs';

const app = await preview({ preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const browser = await launchChromium();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

try {
  await page.goto(`${base}/transition/roadmap`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]');
  if (await page.locator('[data-leave-setup]').count()) {
    await page.locator('[data-leave-setup]').click();
    await page.waitForSelector('[data-home-hello]');
    await page.goto(`${base}/transition/roadmap`, { waitUntil: 'networkidle' });
  }

  await page.locator('[data-segment="legal"]').click();
  const panel = page.locator('[data-track-panel="legal"]:not([hidden])');
  const count = panel.locator('[data-roadmap-track-steps="legal"]');
  const before = await count.innerText();
  if (!/steps? left/.test(before)) throw new Error(`legal track count missing: ${before}`);

  await page.locator('[data-open-goal="pl-legal-written-reasons"]').click();
  await page.waitForSelector('[data-goal-sheet-status]');
  await page.keyboard.press('Escape');

  await page.locator('[data-goal="pl-legal-written-reasons"]').click();
  await page.waitForFunction(
    (previous) => document.querySelector('[data-track-panel="legal"]:not([hidden]) [data-roadmap-track-steps="legal"]')?.textContent !== previous,
    before
  );
} finally {
  await browser.close();
  await app.close();
}
