/* A sheet could be dragged down with a mouse but not with a finger. The
   wrapper declared `touch-action: pan-y`, which hands every vertical touch
   gesture to the browser: it starts a pan, fires `pointercancel` within a few
   pixels, and Sheet's drag (which only begins after 4px and only captures the
   pointer then) is cancelled before the sheet has moved. A mouse never
   triggers a pan, which is why the mouse-driven dismissal checks stayed green.

   The probe drives real touch input through CDP, on the sheet body and on the
   handle, and reads the symptom: the wrapper follows the finger mid-drag, and
   a long swipe dismisses the sheet. */
import { preview } from 'vite';
import { createReporter, launchChromium } from './browser-harness.mjs';

const { ok, fail, finish } = createReporter();
const app = await preview({ preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const browser = await launchChromium();

const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
await page.goto(`${base}/`, { waitUntil: 'networkidle' });
await page.waitForSelector('[data-app-root][data-boot="ready"]', { timeout: 60000 });
if (await page.locator('[data-leave-setup]').count()) {
  await page.locator('[data-leave-setup]').click();
  await page.waitForSelector('[data-home-hello]');
}
await page.goto(`${base}/entry/new/today`, { waitUntil: 'networkidle' });
await page.waitForSelector('[data-app-root][data-boot="ready"]', { timeout: 60000 });
await page.waitForSelector('#ed-note');

const touch = (type, x, y) =>
  cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });

/** Swipes straight down from (x, y) and reports how far the wrapper had been
    pulled when the finger was still down, after 160px of travel. */
async function swipeDown(x, y, distance) {
  await touch('touchStart', x, y);
  let pulled = 0;
  for (let i = 1; i <= 16; i++) {
    await touch('touchMove', x, y + (distance * i) / 16);
    await page.waitForTimeout(16);
    if (i === 8) pulled = await page.locator('[data-sheet-drag]').evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).m42);
  }
  await touch('touchEnd', x, y + distance);
  return pulled;
}

async function openSheet() {
  await page.locator('[data-use-template]').click();
  await page.waitForSelector('[data-sheet]');
  await page.waitForTimeout(600);
  await page.evaluate(() => { document.querySelector('[data-sheet]').scrollTop = 0; });
}

for (const where of ['handle', 'body']) {
  await openSheet();
  const target = where === 'handle'
    ? await page.locator('.sheet-handle').boundingBox()
    : await page.locator('[data-sheet]').boundingBox();
  const x = target.x + target.width / 2;
  const y = where === 'handle' ? target.y + target.height / 2 : target.y + 24;
  const pulled = await swipeDown(x, y, 200);
  await page.waitForTimeout(700);
  const gone = (await page.locator('[data-sheet]').count()) === 0;
  if (pulled > 40) ok(`touch on the ${where} pulls the sheet with the finger (${Math.round(pulled)}px at mid-swipe)`);
  else fail(`touch on the ${where} did not move the sheet mid-swipe (${Math.round(pulled)}px)`);
  if (gone) ok(`a 200px touch swipe on the ${where} dismisses the sheet`);
  else {
    fail(`a 200px touch swipe on the ${where} left the sheet open`);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('[data-sheet]'), null, { timeout: 5000 });
  }
}

await browser.close();
await app.close();
finish();
