/* Run against a demo build: VITE_DEMO=1 npm run build, then
   node tests/fa16-quick-add-return.mjs. */
import assert from 'node:assert/strict';
import { preview } from 'vite';
import { launchChromium } from './browser-harness.mjs';

const app = await preview({ preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const browser = await launchChromium();

try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.addInitScript(() => {
    navigator.storage.persist = async () => true;
  });
  await page.goto(base + '/', { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]');
  if (await page.locator('[data-leave-setup]').count()) {
    await page.locator('[data-leave-setup]').click();
    await page.waitForSelector('[data-home-hello]');
  }

  await page.locator('[data-nav-fab]:visible, [data-rail-add]:visible').first().click();
  await page.waitForSelector('[data-fan]');
  assert.equal(await page.locator('[data-fan-target="dose"]').count(), 0, 'no regimen: no quick dose');
  assert.equal(await page.locator('[data-fan-target="wear"]').count(), 0, 'wear unused: no quick wear');
  assert.equal(await page.locator('[data-fan-target="effects"]').count(), 0, 'no quick onset row');
  await page.keyboard.press('Escape');
  await page.waitForSelector('[data-fan]', { state: 'detached' });

  await page.locator('[data-fill-coming-back]').dispatchEvent('click');
  await page.waitForURL('**/coming-back', { timeout: 180000 });
  await page.waitForSelector('[data-coming-back-item="dose"]');
  const destinations = {
    letter: '/transition/letters',
    milestone: '/transition/milestones',
    era: '/settings/eras',
    'wear-session': '/body/wear',
    dose: '/care/doses?add=1'
  };
  for (const [kind, destination] of Object.entries(destinations)) {
    const row = page.locator(`[data-coming-back-item="${kind}"]`);
    for (const link of await row.all()) assert.equal(await link.getAttribute('href'), destination);
    await row.first().click();
    await page.waitForURL((url) => url.pathname + url.search === destination);
    await page.goto(base + '/coming-back', { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-coming-back-item="dose"]');
  }
  assert.equal(await page.locator('[data-coming-back-yes], [data-coming-back-no], [data-sheet]').count(), 0);

  await page.goto(base + '/', { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-home-hello]');
  await page.locator('[data-nav-fab]:visible, [data-rail-add]:visible').first().click();
  await page.waitForSelector('[data-fan-target="dose"]');
  await page.waitForSelector('[data-fan-target="wear"]');
  assert.equal(await page.locator('[data-fan-target="effects"]').count(), 0, 'no quick onset row with a regimen');
  await page.keyboard.press('Escape');
  await page.waitForSelector('[data-fan]', { state: 'detached' });
  await page.evaluate(() => {
    const link = document.createElement('a');
    link.href = '/coming-back';
    document.body.append(link);
    link.click();
    link.remove();
  });
  await page.waitForURL('**/coming-back');
  await page.waitForSelector('[data-coming-back-item="dose"]');
  await page.locator('[data-coming-back-item="dose"]').click();
  await page.waitForURL('**/care/doses*');
  await page.waitForSelector('[data-sheet]');
  console.log('FA16 quick add and return routes: pass');
} finally {
  await browser.close();
  await new Promise((resolve) => app.httpServer.close(resolve));
}
