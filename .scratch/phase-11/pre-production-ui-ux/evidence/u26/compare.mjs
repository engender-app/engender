import { preview } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
import { launchChromium, settlePage, fillDate } from '../../../../../tests/browser-harness.mjs';
const out=import.meta.dirname; await mkdir(out,{recursive:true});
const app=await preview({preview:{port:0}}); const base=`http://localhost:${app.httpServer.address().port}`;
const browser=await launchChromium(); const page=await browser.newPage({viewport:{width:390,height:844}});
page.on('pageerror',e=>console.log('PAGEERROR',String(e)));
const home=()=>settlePage(page,base,'/','light');
const results=[];
async function capture(name,compact=false){
 await home();
 if(compact) await page.addStyleTag({content:'[data-home-agenda] .kit-row {padding-block:4px} [data-home-agenda] .kit-heading {margin-block:12px;padding-block:8px}'});
 await page.waitForTimeout(700);
 const metrics=await page.evaluate(()=>{const rect=s=>{const r=document.querySelector(s)?.getBoundingClientRect();return r?{top:r.top,bottom:r.bottom,height:r.height}:null};return {mood:rect('[data-home-log]'),quickAdd:rect('[data-nav-fab]'),timer:rect('[data-live-tile="wear-timer"]'),agenda:rect('[data-home-agenda]'),pins:[...document.querySelectorAll('[data-home-pinned] a')].map(x=>x.getAttribute('href'))};});
 await page.screenshot({path:`${out}/${name}.png`}); results.push({name,...metrics});
}
try {
 await home(); await capture('baseline-persona');
 console.log('seed: existing persona');
 for(const days of [3,6,12]) {await settlePage(page,base,'/health/appointments','light');await page.locator('[data-add]').click(); const d=new Date();d.setDate(d.getDate()+days); await fillDate(page,'#appointment-date',d.toISOString().slice(0,10));await page.fill('#appointment-kind',`Visit ${days}`);await page.locator('[data-save-appointment]').click();}
 await capture('baseline-busy'); await capture('compact-busy',true);
 await home(); await page.locator('[data-nav-fab]').click(); await page.locator('[data-choose="wear"]').click();await page.waitForTimeout(600); 
 await capture('baseline-timer');await capture('compact-timer',true);
 await home();await page.locator('[data-nav-fab]').click();await page.locator('[data-fan-target="mood-3"]').click();await page.waitForURL('**/entry/new/today?seedMood=3');results.push({task:'busy timer: fixed Quick add then mood',result:'entry editor, 2 taps, no scrolling'});
 await home(); await page.evaluate(()=>document.querySelector('[data-fill-coming-back]').click());await page.waitForURL('**/coming-back',{timeout:180000});await page.waitForTimeout(600);await page.screenshot({path:`${out}/return-after-gap.png`});await page.locator('[data-coming-back-done]').click(); await capture('baseline-return');await capture('compact-return',true);
 await page.evaluate(()=>{const select=[...document.querySelectorAll('.demo-bar select')].find(x=>[...x.options].some(o=>o.value==='first-run'));select.value='first-run';select.dispatchEvent(new Event('change',{bubbles:true}));});await page.waitForURL('**/onboarding');await page.waitForFunction(()=>!document.querySelector('[data-demo-busy]'));await page.locator('[data-leave-setup]').click();await capture('baseline-empty');await capture('compact-empty',true);
 
 await writeFile(`${out}/metrics.json`,JSON.stringify(results,null,2));
} finally {await browser.close();await app.close();}
