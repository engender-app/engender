import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { launchChromium, previewBuild, settlePage } from '../tests/browser-harness.mjs';
import { FILL_EVERY_FEATURE_EXPRESSION, INIT_HIDE_DEMO_SCRIPT, STUB_PERSIST_SCRIPT } from '../tests/yank-sweep-core.mjs';
const tag = process.argv[2] ?? 'before';
const out = resolve(`evidence117/${tag}`);
await mkdir(out, { recursive: true });
const app = await previewBuild(process.cwd());
const browser = await launchChromium();
const results = [];
try {
 for (const theme of ['light', 'dark']) {
  const context = await browser.newContext({ viewport: { width: 195, height: 844 } });
  const page = await context.newPage();
  await page.addInitScript(INIT_HIDE_DEMO_SCRIPT);
  await page.addInitScript(STUB_PERSIST_SCRIPT);
  await settlePage(page, `http://localhost:${app.httpServer.address().port}`, '/', theme);
  await page.evaluate(FILL_EVERY_FEATURE_EXPRESSION);
  await settlePage(page, `http://localhost:${app.httpServer.address().port}`, '/settings', theme);
  await page.locator('[data-list-row="language"]').click();
  await page.locator('[data-segment="en"]').click();
  await page.waitForTimeout(1000);
  await settlePage(page, `http://localhost:${app.httpServer.address().port}`, '/settings', theme);
  for (const width of tag === 'before' ? [195] : [195,390,1280]) {
   await page.setViewportSize({ width, height: 844 });
   for (const key of ['theme', 'measurement-unit']) {
    const group = page.locator(`[data-segmented="${key}"]`);
    await group.scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    const geometry = await group.evaluate(node => {
     const box = el => { const r = el.getBoundingClientRect(); return { left:r.left,right:r.right,width:r.width,height:r.height,scrollWidth:el.scrollWidth,clientWidth:el.clientWidth,text:el.textContent }; };
     const row = node.closest('.kit-row');
     return { main:box(document.querySelector('.app-main')),row:box(row),title:box(row.querySelector('.kit-row-title')),group:box(node),name:node.getAttribute('aria-label'),buttons:[...node.querySelectorAll('[role="radio"]')].map(box) };
    });
    results.push({theme,width,key,geometry});
    await page.screenshot({ path:`${out}/${theme}-${key}-${width}.png` });
   }
  }
  await context.close();
 }
 await writeFile(`${out}/geometry.json`,JSON.stringify(results,null,2)+'\n');
} finally { await browser.close(); await app.close(); }
console.log(JSON.stringify(results));
