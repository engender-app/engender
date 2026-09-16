/* Renders for ticket 16 (ADR-0084), for sign-off.

   Only what the ticket changed: the milestone rail (gained era bands
   behind the marks), the milestone list underneath it (now a closed
   "Every milestone (n)" row rather than a full list every visit), and the
   roadmap's pack provenance (now a closed "What this pack is, and what it
   is not" row instead of the whole first viewport). The Settings screen's
   new Eras row is a fourth, small crop - the reference-areas card it
   joined, not the whole screen.

   trans, light and dark, only (2026-09-14 standing rule) - the full
   palette cross product is palette-contrast.test.ts's job, not a sign-off
   page's.

   After only. The "before" for all four is what main still draws today -
   no bands on the rail, the list and the caveat both open by default, no
   Eras row in Settings - and needs no separate build to show, since it is
   just the same screen with this ticket's own three edits reverted.

   Run: VITE_DEMO=1 npm run build first, then
        node tests/ticket-16-sign-off-gallery.mjs [outDir]
   Default outDir is .claude/ticket-16-sign-off-shots. */
import { preview } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { launchChromium } from './browser-harness.mjs';

const outDir = resolve(process.argv[2] ?? '.claude/ticket-16-sign-off-shots');

await mkdir(outDir, { recursive: true });
const browser = await launchChromium();
const app = await preview({ preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const shots = [];
const errors = [];
const width = 390;

const page = await browser.newPage({ viewport: { width, height: 844 }, deviceScaleFactor: 2 });
page.on('pageerror', (err) => errors.push(String(err)));

async function settle(path) {
  await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]', { timeout: 30000 });
  if (await page.locator('[data-leave-setup]').count()) {
    await page.locator('[data-leave-setup]').click();
    await page.waitForSelector('[data-home-hello]');
    await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-app-root][data-boot="ready"]');
  }
}

async function strip() {
  await page.evaluate(() => {
    for (const toast of document.querySelectorAll('[data-toast]')) toast.remove();
    for (const bar of document.querySelectorAll('.demo-bar')) bar.remove();
    if (!document.getElementById('sign-off-shot-css')) {
      const style = document.createElement('style');
      style.id = 'sign-off-shot-css';
      style.textContent =
        '[data-app-scroll-region]{scrollbar-width:none}[data-app-scroll-region]::-webkit-scrollbar{display:none}';
      document.head.append(style);
    }
  });
}

async function fillEveryFeature() {
  await settle('/');
  await page.locator('[data-fill-every-feature]').click();
  await page.waitForURL('**/more', { timeout: 180000 });
  await page.waitForTimeout(1000);
}

async function setLook(palette, theme) {
  await settle('/settings');
  await page.locator(`[data-palette-pick="${palette}"]`).click();
  await page.locator(`[data-segment="${theme}"]`).first().click();
  await page.waitForFunction((t) => document.documentElement.dataset.theme === t, theme);
}

/** The whole document, with the viewport grown to the scroll region's
    height so nothing is clipped and every element rect is a page
    coordinate. */
async function grow() {
  const tall = await page.evaluate(() => {
    const s = document.querySelector('[data-app-scroll-region]');
    return Math.min(window.innerHeight + (s.scrollHeight - s.clientHeight) + 40, 8000);
  });
  await page.setViewportSize({ width, height: tall });
  await page.waitForTimeout(150);
}

async function crop(name, fromSel, toSel = fromSel) {
  await strip();
  await grow();
  const box = await page.evaluate(
    ([from, to]) => {
      const pick = (spec) => {
        const [sel, at] = spec.split('@');
        const all = [...document.querySelectorAll(sel)];
        if (at === undefined) return all[0];
        const n = Number(at);
        return n < 0 ? all[all.length + n] : all[n];
      };
      const first = pick(from);
      const last = pick(to);
      if (!first || !last) return null;
      const a = first.getBoundingClientRect();
      const b = last.getBoundingClientRect();
      return { top: a.top, bottom: b.bottom };
    },
    [fromSel, toSel]
  );
  if (!box) {
    errors.push(`${name}: ${fromSel} or ${toSel} not found`);
    await page.setViewportSize({ width, height: 844 });
    return;
  }
  const top = Math.max(0, Math.floor(box.top) - 10);
  const height = Math.min(Math.ceil(box.bottom - top) + 12, 4000);
  await page.screenshot({ path: `${outDir}/${name}.png`, clip: { x: 0, y: top, width, height } });
  shots.push(name);
  process.stdout.write(`  ${name}\n`);
  await page.setViewportSize({ width, height: 844 });
}

for (const theme of ['light', 'dark']) {
  await fillEveryFeature();
  await setLook('trans', theme);

  // 1. The rail with its era bands, and the collapsed list under it - what
  //    the screen opens on now.
  await settle('/transition/milestones');
  await page.waitForSelector('[data-milestone-rail]');
  await crop(`milestones-opens-${theme}`, '[data-screen-header]', '[data-ms-log-toggle]');

  // 2. The list, opened - proves the disclosure still holds the same rows
  //    (edit, delete, the photo slot) as before this ticket.
  await page.locator('[data-ms-log-toggle]').click();
  await page.waitForTimeout(400);
  await crop(`milestones-list-open-${theme}`, '[data-ms-log-toggle]', '[data-milestone]@1');

  // 3. The roadmap's fold - the caveat closed, the track and "N steps left"
  //    within the first viewport.
  await settle('/transition/roadmap');
  await page.waitForSelector('[data-roadmap-here]', { timeout: 10000 }).catch(() => {});
  await crop(`roadmap-opens-${theme}`, '[data-screen-header]', '[data-roadmap-here], [data-roadmap-pack-toggle]@-1');

  // 4. The caveat, opened - the same Poland notice and marker/not-advice
  //    lines as before this ticket, now behind a tap.
  await page.locator('[data-roadmap-pack-toggle]').click();
  await page.waitForTimeout(400);
  await crop(`roadmap-caveat-open-${theme}`, '[data-roadmap-pack-toggle]', '[data-roadmap-pack-details]');

  // 5. Settings' reference-areas card, with Eras now on it.
  await settle('/settings');
  await crop(`settings-eras-row-${theme}`, 'a[href="/settings/words"]', 'a[href="/settings/eras"]');
}

await writeFile(`${outDir}/manifest.json`, JSON.stringify({ shots, errors }, null, 2));
await page.close();
await browser.close();
await app.close();

console.log(`${shots.length} shot(s) in ${outDir}`);
if (errors.length) {
  console.error(`${errors.length} error(s):`);
  for (const e of errors) console.error(`  ${e}`);
  process.exitCode = 1;
}
