import { launchChromium } from './tests/browser-harness.mjs';
const SP = process.env.SP;
const browser = await launchChromium();
const page = await browser.newPage({ viewport: { width: 420, height: 1000 }, deviceScaleFactor: 2 });
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto('file://' + process.cwd() + '/.claude/ticket-30/signoff.html', { waitUntil: 'load' });
await page.waitForTimeout(1200);
console.log('errors:', errs.length ? errs : 'none');

// bubble + static readout, held
const thumb = page.locator('[data-max="100"] .slider-thumb').first();
await thumb.scrollIntoViewIfNeeded();
const b = await thumb.boundingBox();
await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
await page.mouse.down();
await page.mouse.move(b.x + 400, b.y + b.height / 2, { steps: 8 });
await page.waitForTimeout(500);
console.log('bubble:', await page.locator('[data-max="100"] .slider-bubble').first().evaluate((el) => ({
  opacity: getComputedStyle(el).opacity, text: el.textContent })));
await page.screenshot({ path: `${SP}/sign-held.png`, clip: { x: 0, y: b.y - 120, width: 420, height: 260 } });
await page.mouse.up();

// segmented pill
const seg = page.locator('[data-segmented]').first();
await seg.scrollIntoViewIfNeeded();
const pill = seg.locator('.segment-pill');
const before = await pill.boundingBox();
await page.screenshot({ path: `${SP}/sign-seg-before.png`, clip: await seg.boundingBox() });
await seg.locator('.segment').last().click();
await page.waitForTimeout(120);
await page.screenshot({ path: `${SP}/sign-seg-mid.png`, clip: await seg.boundingBox() });
await page.waitForTimeout(500);
const after = await pill.boundingBox();
console.log('pill moved', Math.round(after.x - before.x), 'px; width', Math.round(before.width), '->', Math.round(after.width));
await page.screenshot({ path: `${SP}/sign-seg-after.png`, clip: await seg.boundingBox() });
await browser.close();
