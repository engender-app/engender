/* The scroll region stayed locked for good after one sheet handed off to
   another. lockBackground() used to remember the region's inline overflow
   per lock and put it back on release. A sheet's lock is released only
   when its scrim is destroyed, after its outro, so a second sheet opened
   inside that outro saved `hidden` as its "previous" value. The first
   sheet then restored '' and the second, released last, wrote `hidden`
   back: nothing scrolled again until the app was restarted.

   The entry editor's template picker is the real handoff: "Manage" closes
   the picker and raises the templates manager in the same click. The
   manager is lazily imported, so on a cold chunk it can arrive after the
   picker's outro and dodge the bug; the probe does the handoff twice, the
   second time with the chunk warm, and checks after each. The same
   out-of-order release used to un-inert the shell behind the still-open
   manager, so that is checked too. */
import { preview } from 'vite';
import { createReporter, launchChromium } from './browser-harness.mjs';

const { ok, fail, finish } = createReporter();
const app = await preview({ preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const browser = await launchChromium();

const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
await page.goto(`${base}/`, { waitUntil: 'networkidle' });
await page.waitForSelector('[data-app-root][data-boot="ready"]', { timeout: 60000 });
if (await page.locator('[data-leave-setup]').count()) {
  await page.locator('[data-leave-setup]').click();
  await page.waitForSelector('[data-home-hello]');
}
await page.goto(`${base}/entry/new/today`, { waitUntil: 'networkidle' });
await page.waitForSelector('[data-app-root][data-boot="ready"]', { timeout: 60000 });
await page.waitForSelector('#ed-note');

async function sheetsGone() {
  await page.waitForFunction(() => !document.querySelector('.sheet-scrim'), null, { timeout: 5000 });
}

/** Wheels the scroll region and reports whether it moved, so the check is
    the symptom (nothing scrolls) rather than the inline style behind it. */
async function scrolls() {
  await page.evaluate(() => document.querySelector('[data-app-scroll-region]').scrollTo(0, 0));
  await page.mouse.move(195, 600);
  await page.mouse.wheel(0, 400);
  await page.waitForTimeout(300);
  return page.evaluate(() => document.querySelector('[data-app-scroll-region]').scrollTop > 0);
}

if (await scrolls()) ok('the editor scrolls before any sheet opens');
else fail('the editor does not scroll even before any sheet opens, so the probe cannot tell');

/* Control: one sheet opened and closed on its own has always released. */
await page.locator('[data-use-template]').click();
await page.waitForSelector('[data-manage-entry-templates]');
await page.waitForTimeout(450);
await page.keyboard.press('Escape');
await sheetsGone();
if (await scrolls()) ok('the editor scrolls after the picker alone opens and closes');
else fail('the editor stopped scrolling after the picker alone opened and closed');

for (const round of [1, 2]) {
  await page.locator('[data-use-template]').click();
  await page.waitForSelector('[data-manage-entry-templates]');
  await page.waitForTimeout(450);
  await page.locator('[data-manage-entry-templates]').click();
  await page.waitForSelector('[data-sheet]');
  await page.waitForTimeout(450);
  /* The out-of-order release happens when the picker's scrim is destroyed
     at the end of its outro, so the shell is judged after that, with the
     manager the only sheet left. Judged inside the outro (a slow runner
     past 450ms), querySelector found the departing picker first and
     reported the manager's own scrim as background. The one sheet left
     has to be the manager rather than a picker whose outro outlived a
     manager not yet mounted, so the picker's own button rules it out. */
  await page.waitForFunction(() => {
    const sheets = document.querySelectorAll('[data-sheet]');
    return sheets.length === 1 && !sheets[0].querySelector('[data-manage-entry-templates]');
  }, null, { timeout: 5000 });
  const reachable = await page.evaluate(() => {
    const sheet = document.querySelector('[data-sheet]');
    return Array.from(document.querySelector('[data-app-root]').children)
      .filter((child) => !child.contains(sheet) && !child.hasAttribute('inert'))
      .map((child) => child.className || child.tagName);
  });
  if (reachable.length === 0) ok(`handoff ${round}: the background stays inert behind the manager`);
  else fail(`handoff ${round}: background reachable behind the manager: ${reachable.join(', ')}`);
  await page.keyboard.press('Escape');
  await sheetsGone();
  if (await scrolls()) ok(`handoff ${round}: the editor scrolls after picker hands off to manager and both close`);
  else fail(`handoff ${round}: the editor no longer scrolls after picker hands off to manager and both close`);
}

await browser.close();
await app.httpServer.close();
finish();
