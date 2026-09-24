/* The documents list, cold: nothing in the first group changes height after
   it first paints (phase 12 ux-carpet ticket 212).

   Each document row carries a second line naming what it is filed under,
   resolved through four reads of their own (documentTargets.svelte.ts), and
   the list carries a size line read on its own too. When one of them
   answered after the documents did, the line arrived in a row already on
   screen: the row grew 40 -> 59px, and the whole first group 11px, in one
   frame, under the gate's fade. It happened in about 1 of 15 cold loads at
   full speed and 1 of 3 at 4x CPU, so this runs slowed down.

   Cold-loads /media/documents over the demo journal with every feature
   filled (the fixture files paper under milestones, procedures and goals),
   samples the first group and everything in it after every paint, and fails
   if the group's height changes between two frames.

   Against a demo build:
     VITE_DEMO=1 npm run build
     node tests/documents-rows-settle.mjs [--runs 12] [--cpu 4] [--root <built tree>] */
import { preview } from 'vite';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium, settlePage } from './browser-harness.mjs';
import { FILL_EVERY_FEATURE_EXPRESSION, INIT_HIDE_DEMO_SCRIPT, RESET_PERSONA_EXPRESSION } from './yank-sweep-core.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1] : fallback;
};
const RUNS = Number(flag('runs', '12'));
const CPU = Number(flag('cpu', '4'));

const browser = await launchChromium();
const app = await preview({ root: resolve(flag('root', resolve(here, '..'))), preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
await page.addInitScript(INIT_HIDE_DEMO_SCRIPT);
await settlePage(page, base, '/', 'light');
if (!(await page.evaluate(RESET_PERSONA_EXPRESSION))) throw new Error('persona reset never reached Home');
await page.evaluate(FILL_EVERY_FEATURE_EXPRESSION);
await page.waitForTimeout(1500);

/* Installed before the app's own scripts, so the first frame sampled is the
   first frame there is. The headless browser never grants persistent
   storage, and the toast that says so is not the screen's. */
await page.addInitScript(() => {
  if (navigator.storage) navigator.storage.persist = () => Promise.resolve(true);
  const out = [];
  window.__docSamples = out;
  const t0 = performance.now();
  const ids = new WeakMap();
  let n = 0;
  const id = (el) => {
    if (!ids.has(el)) ids.set(el, `${n++}:${el.tagName.toLowerCase()}.${[...el.classList].filter((c) => !c.startsWith('svelte-')).slice(0, 2).join('.')}`);
    return ids.get(el);
  };
  const tick = () => {
    const at = performance.now() - t0;
    const row = { at, group: null, parts: {} };
    const group = document.querySelector('[data-documents-group]');
    if (group) {
      row.group = group.getBoundingClientRect().height;
      for (const el of group.querySelectorAll('*')) {
        const h = el.getBoundingClientRect().height;
        if (h) row.parts[id(el)] = h;
      }
    }
    out.push(row);
    if (at < 1800) requestAnimationFrame(() => setTimeout(tick, 0));
  };
  requestAnimationFrame(() => setTimeout(tick, 0));
});

const cdp = await page.context().newCDPSession(page);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });

let failed = 0;
for (let run = 1; run <= RUNS; run++) {
  /* A visit first, then the load that is measured: cold, since the last
     answers ticket 201 keeps live in memory and a reload clears them. */
  await page.goto(`${base}/media/documents`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  await page.goto(`${base}/media/documents`, { waitUntil: 'commit' });
  await page.waitForTimeout(2200);
  const samples = await page.evaluate(() => window.__docSamples);
  let finding = null;
  for (let i = 1; i < samples.length && !finding; i++) {
    const a = samples[i - 1];
    const b = samples[i];
    if (a.group == null || b.group == null || Math.abs(b.group - a.group) < 1) continue;
    const grew = Object.keys(b.parts)
      .filter((k) => a.parts[k] != null && Math.abs(b.parts[k] - a.parts[k]) >= 1)
      .map((k) => `${k.replace(/^\d+:/, '')} ${Math.round(a.parts[k])}->${Math.round(b.parts[k])}`)
      .slice(0, 3);
    finding = `first group ${Math.round(a.group)} -> ${Math.round(b.group)}px in one frame at ${Math.round(b.at)}ms (${grew.join(', ')})`;
  }
  if (!samples.some((s) => s.group != null)) finding = 'the first group never painted';
  if (finding) failed++;
  console.log(`documents cold load ${run}: ${finding ? 'FAIL' : 'ok'}${finding ? ` - ${finding}` : ''}`);
}
console.log(`${failed} of ${RUNS} cold loads at ${CPU}x CPU changed the first group's height after it painted`);

await browser.close();
await app.close();
process.exit(failed ? 1 : 0);
