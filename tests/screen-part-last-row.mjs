/* A row arriving or leaving last in a `.screen-part` moves nothing but
   itself (phase 12 ux-carpet ticket 195).

   `.screen > .screen-part > *` gives every row 20px under it, and until
   this ticket `:last-child` took that away from whichever row was last. So
   the margin a row carried depended on whether anything came after it: a
   row inserted as the new last child handed its predecessor 20px in the
   frame it was inserted, and a last row leaving took 20px from the one
   before it in the frame it was removed. Neither transition can animate a
   neighbour's margin, so the page stepped 20px on top of whatever the
   transition did (the voice screen's task line, ticket 166, 248 -> 268px).

   The check runs on the real stylesheet. A throwaway `.screen-part` goes
   into a live screen with a block after it, and a row is appended as its
   last child the way `disclose` draws it on its first frame: height 0,
   clipped, and its bottom margin at minus the smaller of the margins it
   meets above and below (`restingMarginBelow`, reveal.ts; reveal.test.ts
   holds that arithmetic). Nothing may move, and the row before it must
   keep its own margin; the same when it is taken out. The one instance
   measured before this ticket, the voice screen's task line, was fixed in
   place by ticket 166 and keeps that fix; this checks the rule every other
   screen part now inherits.

   Against a demo build:
     VITE_DEMO=1 npm run build
     node tests/screen-part-last-row.mjs [--root <built tree>] */
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium, settlePage, previewBuild } from './browser-harness.mjs';
import { FILL_EVERY_FEATURE_EXPRESSION, INIT_HIDE_DEMO_SCRIPT, RESET_PERSONA_EXPRESSION } from './yank-sweep-core.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1] : fallback;
};

const browser = await launchChromium();
const app = await previewBuild(resolve(flag('root', resolve(here, '..'))));
const base = `http://localhost:${app.httpServer.address().port}`;
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
await page.addInitScript(INIT_HIDE_DEMO_SCRIPT);
await page.addInitScript(() => {
  if (navigator.storage) navigator.storage.persist = () => Promise.resolve(true);
});
await settlePage(page, base, '/', 'light');
if (!(await page.evaluate(RESET_PERSONA_EXPRESSION))) throw new Error('persona reset never reached Home');
await page.evaluate(FILL_EVERY_FEATURE_EXPRESSION);
await page.waitForTimeout(1500);

let failed = false;

for (const route of ['/settings', '/care/labs', '/more']) {
  await settlePage(page, base, route, 'light');
  await page.waitForTimeout(800);
  const r = await page.evaluate(() => {
    const screen = document.querySelector('.screen');
    const part = document.createElement('div');
    part.className = 'screen-part';
    const first = document.createElement('div');
    first.style.height = '40px';
    part.append(first);
    const after = document.createElement('div');
    after.style.height = '10px';
    const header = screen.querySelector(':scope > .screen-header');
    (header ?? screen.firstElementChild).after(part, after);
    const top = () => after.getBoundingClientRect().top;
    const margin = () => getComputedStyle(first).marginBottom;
    const before = { top: top(), margin: margin() };
    const row = document.createElement('div');
    const px = (el, prop) => parseFloat(getComputedStyle(el)[prop]) || 0;
    const meets = Math.min(px(first, 'marginBottom'), Math.max(px(part, 'marginBottom'), px(after, 'marginTop')));
    row.style.cssText = `height: 0; margin: 0 0 ${-meets}px; overflow: hidden`;
    part.append(row);
    const arrived = { top: top() - before.top, margin: margin() };
    row.remove();
    const left = { top: top() - before.top, margin: margin() };
    part.remove();
    after.remove();
    return { before, arrived, left };
  });
  const ok = r.arrived.top === 0 && r.left.top === 0 && r.arrived.margin === r.before.margin;
  if (!ok) failed = true;
  console.log(
    `mechanism ${route}: ${ok ? 'ok' : 'FAIL'} - a last row on its first frame moved the block after it ${r.arrived.top}px arriving, ` +
      `${r.left.top}px leaving; the row before it ${r.before.margin} -> ${r.arrived.margin} -> ${r.left.margin}`
  );
}

await browser.close();
await app.close();
process.exit(failed ? 1 : 0);
