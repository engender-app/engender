/* In a live .screen-part with a following block, append and remove a
   final child at disclose's collapsed geometry. Its height is zero,
   overflow clips, and margin cancels the smaller adjacent margin
   (reveal.ts and reveal.test.ts). The previous row keeps its 20px
   margin and no neighbor moves. A :last-child margin rule had shifted
   rows on insertion and removal.

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
