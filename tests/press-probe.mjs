/* Throwaway (carpet 10): what a tag-insight bar row actually does under the
   finger, and how far its edge travels. */
import { preview } from 'vite';
import { launchChromium } from './browser-harness.mjs';

const browser = await launchChromium();
const app = await preview({ preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

const settle = async (path) => {
  await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]');
  if (await page.locator('[data-leave-setup]').count()) {
    await page.locator('[data-leave-setup]').click();
    await page.waitForSelector('[data-home-hello]');
    await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-app-root][data-boot="ready"]');
  }
};

await settle('/');
await page.getByRole('button', { name: 'Reset demo state' }).click();
await page.waitForTimeout(1500);
await settle('/stats');
await page.locator('[data-segmented="stats-range"] [data-segment="365"]').click();
await page.waitForTimeout(1500);

const row = page.locator('[data-chart-card="tag-insights"] [data-bar-row]').first();
await row.scrollIntoViewIfNeeded();
const before = await row.boundingBox();
await row.hover();
await page.mouse.down();
await page.waitForTimeout(400); // past --dur-press
const held = await row.evaluate((el) => {
  const s = getComputedStyle(el);
  return { transform: s.transform, background: s.backgroundColor, rect: el.getBoundingClientRect().toJSON() };
});
await page.mouse.up();
await page.keyboard.press('Escape');
await page.waitForTimeout(600);
console.log('resting  width', before.width.toFixed(1), 'height', before.height.toFixed(1));
console.log('pressed  transform', held.transform, 'background', held.background);
console.log('pressed  width', held.rect.width.toFixed(1), 'edge travel px', ((before.width - held.rect.width) / 2).toFixed(2));

/* The same question for the other consumer of a pressable bar row. */
const high = page.locator('[data-chart-card="highest-days"] [data-bar-row]').first();
if (await high.count()) {
  await high.scrollIntoViewIfNeeded();
  const hb = await high.boundingBox();
  await high.hover();
  await page.mouse.down();
  await page.waitForTimeout(400);
  const hh = await high.evaluate((el) => getComputedStyle(el).transform);
  await page.mouse.up();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);
  console.log('highest-days width', hb.width.toFixed(1), 'pressed transform', hh);
}

/* And an entry card, which is the same shape of surface. */
await settle('/');
const card = page.locator('[data-entry-card]').first();
if (await card.count()) {
  const cb = await card.boundingBox();
  await card.hover();
  await page.mouse.down();
  await page.waitForTimeout(400);
  const ct = await card.evaluate((el) => getComputedStyle(el).transform);
  await page.mouse.up();
  console.log('entry-card width', cb.width.toFixed(1), 'pressed transform', ct);
}

await browser.close();
await app.close();
