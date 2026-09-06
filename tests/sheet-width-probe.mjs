/* Throwaway (carpet 10): does .sheet's hairline take layout width from what
   is drawn inside it? Measures the sheet's content box and the injection
   map's tightest pair of dots, which is the check that failed. */
import { preview } from 'vite';
import { launchChromium } from './browser-harness.mjs';

const browser = await launchChromium();
const app = await preview({ preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const page = await browser.newPage({ viewport: { width: 320, height: 844 } });

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
await page.getByRole('button', { name: 'Fill every feature' }).click();
await page.waitForTimeout(6000);
await settle('/stats');
await page.locator('[data-segmented="stats-range"] [data-segment="365"]').click();
await page.waitForTimeout(1200);
await page.locator('[data-chart-card="tag-insights"] [data-bar-row]').first().click();
await page.waitForSelector('[data-sheet]');
await page.waitForTimeout(600);

const box = await page.evaluate(() => {
  const sheet = document.querySelector('[data-sheet]');
  const cs = getComputedStyle(sheet);
  return {
    clientWidth: sheet.clientWidth,
    contentWidth: sheet.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight),
    borderLeft: cs.borderLeftWidth,
    boxShadow: cs.boxShadow
  };
});
console.log(JSON.stringify(box, null, 1));

const found = await page.locator('[data-site]').count();
console.log('site dots found:', found);
if (found) {
  const out = await page.evaluate(() => {
    const sheet = document.querySelector('[data-sheet]');
    const cs = sheet && getComputedStyle(sheet);
    const dots = [...document.querySelectorAll('[data-site]')].map((el) => {
      const b = el.getBoundingClientRect();
      return { key: el.dataset.site, x: b.x + b.width / 2, y: b.y + b.height / 2 };
    });
    let closest = { gap: Infinity, pair: '' };
    for (const [i, a] of dots.entries()) {
      for (const b of dots.slice(i + 1)) {
        const g = Math.hypot(a.x - b.x, a.y - b.y);
        if (g < closest.gap) closest = { gap: g, pair: `${a.key}+${b.key}` };
      }
    }
    return {
      sheetClientWidth: sheet?.clientWidth,
      sheetBorder: cs?.borderLeftWidth,
      figure: document.querySelector('[data-site]')?.closest('svg, figure')?.getBoundingClientRect().width,
      closest
    };
  });
  console.log(JSON.stringify(out, null, 1));
}
await browser.close();
await app.close();
