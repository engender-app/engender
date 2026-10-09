import assert from 'node:assert/strict';
import { PALETTES } from '../tests/palettes.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { launchChromium, previewBuild, settlePage } from '../tests/browser-harness.mjs';
import { FILL_EVERY_FEATURE_EXPRESSION, INIT_HIDE_DEMO_SCRIPT, STUB_PERSIST_SCRIPT } from '../tests/yank-sweep-core.mjs';
const out = resolve('evidence117/matrix');
await mkdir(out,{recursive:true});
const app = await previewBuild(process.cwd());
const browser = await launchChromium();
const base = `http://localhost:${app.httpServer.address().port}`;
const results=[];
try {
 for (const reduced of [false,true]) {
  const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:reduced?'reduce':'no-preference'});
  const page=await context.newPage();
  const errors=[];page.on('pageerror', e=>errors.push(String(e)));
  await page.addInitScript(INIT_HIDE_DEMO_SCRIPT);await page.addInitScript(STUB_PERSIST_SCRIPT);
  await settlePage(page,base,'/','light');await page.evaluate(FILL_EVERY_FEATURE_EXPRESSION);await settlePage(page,base,'/settings','light');
  for (const language of ['en','pl']) {
   {await page.locator('[data-list-row="language"]').click();await page.locator(`[data-segment="${language}"]`).click();await page.waitForTimeout(1000);await settlePage(page,base,'/settings','light');}
   for(const width of [195,390,1280]) {
    await page.setViewportSize({width,height:844});
    for(const theme of ['light','dark']) {
     const choice=page.locator(`[data-segmented="theme"] [data-segment="${theme}"]`);
     await choice.scrollIntoViewIfNeeded();await choice.click();await page.waitForTimeout(reduced?100:700);
     for(const palette of PALETTES) {
      await page.evaluate(p=>document.documentElement.dataset.palette=p,palette);
      for(const key of ['theme','measurement-unit']) {
       const group=page.locator(`[data-segmented="${key}"]`);await group.scrollIntoViewIfNeeded();
       const geometry=await group.evaluate(node=>{const box=e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,width:r.width,height:r.height,scrollWidth:e.scrollWidth,clientWidth:e.clientWidth};};const row=node.closest('.kit-row');return {group:box(node),row:box(row),title:box(row.querySelector('.kit-row-title')),name:node.getAttribute('aria-label'),buttons:[...node.querySelectorAll('[role="radio"]')].map(e=>({...box(e),name:e.textContent.trim(),checked:e.getAttribute('aria-checked')}))};});
       assert.ok(geometry.name);assert.equal(geometry.group.scrollWidth,geometry.group.clientWidth,`${language}/${width}/${key} scrolling`);
       assert.ok(geometry.group.left>=-0.5&&geometry.group.right<=width+0.5,`${language}/${width}/${key} clipped`);
       assert.ok(geometry.title.width<=geometry.row.width+0.5);
       for(const button of geometry.buttons){assert.ok(button.name);assert.ok(button.width>=48&&button.height>=48);assert.ok(button.left>=geometry.group.left&&button.right<=geometry.group.right+0.5);}
       results.push({language,width,theme,palette,reduced,key,geometry});
      }
     }
     if(width===195) await page.screenshot({path:`${out}/${language}-${theme}-${reduced?'reduced':'motion'}-${width}.png`});
    }
    for(const key of ['theme','measurement-unit']) {
     const group=page.locator(`[data-segmented="${key}"]`);const current=group.locator('[aria-checked="true"]');await current.focus();await current.press('ArrowRight');await page.waitForTimeout(reduced?100:700);
     assert.equal(await group.locator('[aria-checked="true"]').evaluate(e=>e===document.activeElement),true);
     await group.locator('[aria-checked="true"]').press('ArrowLeft');await page.waitForTimeout(reduced?100:700);
     assert.equal(await group.locator('[aria-checked="true"]').evaluate(e=>e===document.activeElement),true);
     const last=group.locator('[role="radio"]').last();await last.focus();await last.press('Space');await page.waitForTimeout(reduced?100:700);
     assert.equal(await group.locator('[role="radio"]').last().getAttribute('aria-checked'),'true');
    }
   }
  }
  await page.reload({waitUntil:'networkidle'});await page.waitForSelector('[data-app-root][data-boot="ready"]');
  assert.equal(await page.locator('[data-segmented="theme"] [data-segment="dark"]').getAttribute('aria-checked'),'true');
  assert.equal(await page.locator('[data-segmented="measurement-unit"] [data-segment="in"]').getAttribute('aria-checked'),'true');
  assert.deepEqual(errors,[]);await context.close();
 }
 await writeFile(`${out}/results.json`,JSON.stringify(results,null,2)+'\n');
 console.log(`${results.length} layout cases passed; keyboard and reload persistence passed`);
} finally {await browser.close();await app.close();}
