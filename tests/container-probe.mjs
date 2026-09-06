/* Does the entry container transform have both halves? Hooks
   startViewTransition and reports which elements carry a view-transition-name
   in the old DOM and in the new one, from Home and from the tag insight
   sheet. Throwaway (carpet ticket 10). */
import { preview } from 'vite';
import { launchChromium } from './browser-harness.mjs';

const browser = await launchChromium();
const app = await preview({ preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
page.on('console', (msg) => console.log('page:', msg.text()));

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

const named = `() => Array.from(document.querySelectorAll('*'))
  .filter((el) => el.style && el.style.viewTransitionName)
  .map((el) => el.style.viewTransitionName + '@' + el.className)`;

const hook = () =>
  page.evaluate(`(() => {
    const real = document.startViewTransition.bind(document);
    document.startViewTransition = (cb) => {
      console.log('OLD named: ' + JSON.stringify((${named})()));
      return real(async () => {
        await cb();
        console.log('NEW named: ' + JSON.stringify((${named})()));
      });
    };
  })()`);

await settle('/');
await page.getByRole('button', { name: 'Reset demo state' }).click();
await page.waitForTimeout(1500);

await settle('/');
await hook();
await page.locator('[data-entry-card], [data-day-entry]').first().click();
await page.waitForTimeout(2000);
console.log('--- home run done,', page.url());

await settle('/stats');
await page.locator('[data-segmented="stats-range"] [data-segment="365"]').click();
await page.waitForTimeout(1500);
await page.locator('[data-chart-card="tag-insights"] [data-bar-row]').first().click();
await page.waitForSelector('[data-sheet]');
await page.waitForTimeout(800);
await hook();
await page.locator('[data-sheet] [data-entry-card]').first().click();
await page.waitForTimeout(2000);
console.log('--- sheet run done,', page.url());

await browser.close();
await app.close();
