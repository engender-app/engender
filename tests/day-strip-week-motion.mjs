import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { launchChromium, previewBuild, screencast, settlePage } from './browser-harness.mjs';
import { FILL_EVERY_FEATURE_EXPRESSION, INIT_HIDE_DEMO_SCRIPT, saveSceneCast } from './yank-sweep-core.mjs';

const args = process.argv.slice(2);
const outIndex = args.indexOf('--out');
const out = resolve(outIndex >= 0 ? args[outIndex + 1] : '.claude/day-strip-week-motion');
const surfaces = [
  ['cycle', '/health/cycle-events', '#cycle-event-date'],
  ['dilation', '/health/dilation', '#dilation-session-date'],
  ['wear', '/body/wear', '#wear-day'],
  ['hair-removal', '/body/hair-removal', '#hair-removal-date']
];
await mkdir(out, { recursive: true });
const app = await previewBuild(process.cwd());
const browser = await launchChromium();
const failures = [];
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.addInitScript(INIT_HIDE_DEMO_SCRIPT);
  const base = `http://localhost:${app.httpServer.address().port}`;
  await settlePage(page, base, '/', 'light');
  await page.evaluate(FILL_EVERY_FEATURE_EXPRESSION);
  await page.waitForTimeout(1500);
  for (const [surface, route, dateField] of surfaces) {
    for (const theme of ['light', 'dark']) {
      await settlePage(page, base, route, theme);
      await page.locator('[data-strip-earlier]').waitFor();
      await page.waitForTimeout(1400);
      const initialCells = await page.locator('[data-week-cell]').evaluateAll((nodes) => nodes.map((node) => Number(node.dataset.weekCell)));
      const { samples, cast } = await screencast(page, async (cast) => {
        const samples = await page.evaluate(async () => {
          const old = document.querySelector('[data-strip-week]');
          const read = (node) => {
            const rect = node.getBoundingClientRect();
            return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, opacity: Number(getComputedStyle(node).opacity), text: node.textContent };
          };
          const original = read(old);
          const start = performance.now();
          const samples = [{ frame: 0, ms: 0, original, old: read(old) }];
          document.querySelector('[data-strip-earlier]').click();
          await new Promise((resolve) => {
            const tick = () => {
              samples.push({ frame: samples.length, ms: performance.now() - start, original,
                old: old.isConnected ? read(old) : null,
                labels: [...document.querySelectorAll('[data-strip-week]')].map(read) });
              if (performance.now() - start < 350) requestAnimationFrame(tick);
              else resolve();
            };
            requestAnimationFrame(tick);
          });
          return samples;
        });
        return { samples, cast };
      });
      await saveSceneCast(cast, out, `${surface}-week-earlier`, `persona-${theme}-p1`);
      await writeFile(`${out}/${surface}-${theme}.json`, JSON.stringify(samples, null, 2));
      assert.ok(samples.some((sample) => sample.frame > 0 && sample.old && sample.old.opacity > 0.05), `${surface}/${theme}: no visible outgoing frame captured`);
      assert.equal(samples.at(-1).old, null, `${surface}/${theme}: outgoing label remains after the fade`);
      const shifted = samples.filter((s) => s.old && s.old.opacity > 0.05 &&
        (Math.abs(s.old.x - s.original.x) > 0.5 || Math.abs(s.old.y - s.original.y) > 0.5 || Math.abs(s.old.width - s.original.width) > 0.5));
      try { assert.equal(shifted.length, 0, `${surface}/${theme}: outgoing week label moves while visible`); }
      catch (error) { failures.push(error.message); }
      const cells = () => page.locator('[data-week-cell]').evaluateAll((nodes) => nodes.map((node) => Number(node.dataset.weekCell)));
      assert.deepEqual(await cells(), initialCells.map((day) => day - 7));
      await page.locator('[data-strip-later]').focus();
      await page.keyboard.press('Enter');
      await page.waitForTimeout(350);
      assert.deepEqual(await cells(), initialCells);
      assert.equal(await page.locator('[data-strip-later]').isDisabled(), true);
      assert.equal(await page.locator('[data-strip-earlier]').evaluate((node) => node === document.activeElement), true);
      await page.locator('[data-strip-earlier]').click();
      await page.waitForTimeout(350);
      const pickedDay = (await cells())[0];
      await page.locator('.day-strip .kit-strip-day').first().click();
      await page.locator(dateField).waitFor();
      assert.equal(await page.locator(dateField).getAttribute('data-date-value'), new Date(pickedDay * 86400000).toISOString().slice(0, 10));
      await page.keyboard.press('Escape');
      await page.locator(dateField).waitFor({ state: 'detached' });
      const reduced = await page.evaluate(async () => {
        document.documentElement.dataset.a11yMotion = 'reduce';
        const old = document.querySelector('[data-strip-week]');
        document.querySelector('[data-strip-later]').click();
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        return { oldPresent: old.isConnected, labels: document.querySelectorAll('[data-strip-week]').length };
      });
      assert.deepEqual(reduced, { oldPresent: false, labels: 1 });
      assert.deepEqual(await cells(), initialCells);
      await page.evaluate(() => { delete document.documentElement.dataset.a11yMotion; });
      console.log(`${surface}/${theme}`, JSON.stringify({ frames: samples.length, shifted: shifted.slice(0, 3), navigation: true, selectedDate: true, focus: true, reducedMotion: true }));
    }
  }
  for (const width of [195, 760]) {
    await page.setViewportSize({ width, height: 844 });
    for (const theme of ['light', 'dark']) {
      await settlePage(page, base, '/health/cycle-events', theme);
      await page.locator('[data-strip-earlier]').waitFor();
      await page.waitForTimeout(350);
      const head = page.locator('.day-strip-head');
      const controls = await head.locator('button').evaluateAll((nodes) => nodes.map((node) => {
        const rect = node.getBoundingClientRect();
        return { width: rect.width, height: rect.height, label: node.getAttribute('aria-label') };
      }));
      assert.ok(controls.every((control) => control.width >= 48 && control.height >= 48 && control.label));
      await head.screenshot({ path: `${out}/cycle-${width}-${theme}.png` });
      console.log(`cycle/${width}/${theme}`, JSON.stringify({ controls }));
    }
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  app.httpServer.close();
}
if (failures.length) throw new Error(failures.join('\n'));
