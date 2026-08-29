import { launchChromium } from '/home/alice/_projekty/priv/gender-diary/tests/browser-harness.mjs';
const browser = await launchChromium();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.goto('http://localhost:5173/calendar');
await page.waitForSelector('[data-cal-month-btn]', { timeout: 15000 });
await page.waitForTimeout(400);
await page.click('[data-cal-month-btn]');
await page.waitForTimeout(400);
await page.screenshot({ path: 'cal-jump-sheet.png' });
// step year back twice, pick August
await page.click('.cal-jump-year button[aria-label="Previous month"]'); // wrong label - just click first button
await browser.close();
