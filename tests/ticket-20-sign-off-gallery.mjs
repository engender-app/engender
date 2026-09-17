/* Renders for ticket 20 (phase 11 all-four-doors), for sign-off.

   One crop per visual item, not a whole screen each: the ticket is fourteen
   measured small fixes and what it changed is a row here, a band there.
   Items 3, 5, 6, 7, 8, 9, 10, 11, 12 and 13, in that order.

   trans, light and dark, only (2026-09-14 standing rule) - the full palette
   cross product is palette-contrast.test.ts's job.

   The "before" side of the page is the whole-app audit's own captures of
   15 September (`.claude/audit-2026-09-15/`), which is the state every one
   of these items was measured against; this script shoots the after. Run it
   against a demo build of this branch:

     VITE_DEMO=1 npm run build
     node tests/ticket-20-sign-off-gallery.mjs --out /abs/dir */
import { preview } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { launchChromium } from './browser-harness.mjs';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1] : fallback;
};
const outDir = resolve(flag('out', resolve('.claude/ticket-20-sign-off-shots')));
const width = 390;

await mkdir(outDir, { recursive: true });
const browser = await launchChromium();
const app = await preview({ preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const shots = [];
const errors = [];

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

/** The epoch day arithmetic epochDay.ts uses (ADR-0001), duplicated here
    because this script runs against a built app with no `$lib` to import
    from. */
function todayEpochDay() {
  const now = new Date();
  return Math.floor(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86400000);
}

/** The nearest day ahead that carries a mark, so item 12's crop is a real
    forward day rather than an empty one. Read off the calendar's own grid
    the way a person would reach it. */
async function forwardDayWithAMark() {
  const today = todayEpochDay();
  for (let day = today + 1; day <= today + 60; day++) {
    await settle(`/day/${day}`);
    if (await page.locator('[data-list-row^="coming-"]').count()) return day;
  }
  return null;
}

for (const theme of ['light', 'dark']) {
  await fillEveryFeature();
  await setLook('trans', theme);

  // 3. The recovery key row says what an unset one costs.
  await settle('/settings/security');
  await page.waitForSelector('[data-list-row="recovery-key"]');
  await crop(`03-recovery-key-${theme}`, '[data-security-list]');

  // 5 + 6. Entry templates: a sheet over Settings, each row naming its own
  // dimensions and tags.
  await settle('/settings/entry-templates');
  await page.waitForSelector('[data-sheet] [data-entry-template]');
  await page.waitForTimeout(400);
  await crop(`05-06-templates-sheet-${theme}`, '[data-sheet]');

  // 7. Dilation: the schedule row names the procedure it follows and reads
  // that record's date, and the flat "sessions since surgery" chart is gone.
  await settle('/health/dilation');
  await page.waitForSelector('[data-schedule]');
  await crop(`07-dilation-schedule-${theme}`, '[data-screen-header]', '[data-schedule]');

  // 8. Measurements: both readings at the top, the protocol card under them.
  await settle('/body/measurements');
  await page.waitForSelector('[data-measurement-span]');
  await crop(`08-measurements-reading-${theme}`, '[data-measurement-span]', '[data-protocol]');

  // 9. Documents: a row draws its own page.
  await settle('/media/documents');
  await page.waitForSelector('[data-documents-group] img');
  await page.waitForTimeout(400);
  await crop(`09-documents-rows-${theme}`, '[data-documents-group]', '[data-documents-group]@-1');

  // 10. The door: the field's band, and Health leading with the row that
  // used to be the whole Body group.
  await settle('/more');
  await page.waitForSelector('[data-hub-index]');
  await crop(`10-door-field-${theme}`, '[data-screen-header]', '[data-hub-section="health"]@-1');

  // 11. The door's search hands a record query over.
  await page.locator('[data-hub-search]').fill('log');
  await page.waitForSelector('[data-hub-search-handoff]');
  await page.waitForTimeout(700);
  await crop(`11-door-search-handoff-${theme}`, '[data-search-hit]@-1', '[data-hub-search-handoff]');

  // 12. The forward day: its date in the title, and what is expected on it.
  const forward = await forwardDayWithAMark();
  if (forward === null) {
    errors.push('12: no forward day with a mark in the next 60 days');
  } else {
    await crop(`12-forward-day-${theme}`, '[data-screen-header]', '[data-list-row^="coming-"]@-1');
  }

  // 13. Surgery: the card's next consult, and dilation directly under the
  // cards.
  await settle('/health/surgery');
  await page.waitForSelector('[data-procedure-card]');
  await crop(`13-surgery-index-${theme}`, '[data-procedure-card]', '[data-hub-host="surgery"]@-1');
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
