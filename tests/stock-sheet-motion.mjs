import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { launchChromium, previewBuild, screencast, settlePage, fillDate, dateValue } from './browser-harness.mjs';
import { INIT_HIDE_DEMO_SCRIPT, STUB_PERSIST_SCRIPT, JUMP_FIRST_RUN_EXPRESSION, WALK_FIRST_RUN_FINISH_EXPRESSION, FILL_EVERY_FEATURE_EXPRESSION, saveSceneCast } from './yank-sweep-core.mjs';

const out = resolve(process.argv[2] ?? '.claude/stock-sheet-motion');
const baseline = process.argv.includes('--baseline');
await mkdir(out, { recursive: true });
const app = await previewBuild(process.cwd());
const browser = await launchChromium();
const base = `http://localhost:${app.httpServer.address().port}`;
const results = [];
try {
  for (const theme of ['light', 'dark']) {
   for (const reduced of baseline ? [false] : [false, true]) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: reduced ? 'reduce' : 'no-preference' });
    try {
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(String(error)));
      await page.addInitScript(INIT_HIDE_DEMO_SCRIPT);
      await page.addInitScript(STUB_PERSIST_SCRIPT);
      await settlePage(page, base, '/', theme);
      await page.evaluate(JUMP_FIRST_RUN_EXPRESSION);
      await page.evaluate(WALK_FIRST_RUN_FINISH_EXPRESSION);
      await settlePage(page, base, '/care', theme);
      await page.locator('[data-list-row="stock"]').click();
      const action = page.locator('[data-notice="care-stock-empty"] [data-notice-action]');
      await action.waitFor();
      await page.waitForTimeout(700);
      let samples;
      const cast = await screencast(page, async (frames) => {
        await page.evaluate(() => {
          window.__stockSamples = [];
          window.__stockSampling = true;
          const started = performance.now();
          const read = (now) => {
            if (!window.__stockSampling) return;
            const sheet = document.querySelector('[data-sheet]');
            const handle = sheet?.querySelector('.sheet-handle');
            const background = document.querySelector('[data-notice="care-empty"]') ?? document.querySelector('.app-main > *');
            const style = sheet && getComputedStyle(sheet);
            window.__stockSamples.push({ ms: Math.round(now - started), y: sheet?.getBoundingClientRect().top,
              height: sheet?.getBoundingClientRect().height, handleY: handle?.getBoundingClientRect().top,
              scroll: document.querySelector('.app-main')?.scrollTop ?? window.scrollY,
              backgroundY: background?.getBoundingClientRect().top, transform: style?.transform,
              overflow: style?.overflow, form: !!document.querySelector('[data-save-stock]'),
              outgoing: !!document.querySelector('[data-notice="care-stock-empty"]') });
            requestAnimationFrame(read);
          };
          requestAnimationFrame(read);
        });
        await page.waitForTimeout(60);
        await action.press('Enter');
        await page.waitForTimeout(700);
        samples = await page.evaluate(() => { window.__stockSampling = false; return window.__stockSamples; });
        return frames;
      });
      await page.locator('[data-save-stock]').waitFor();
      const evidence = await saveSceneCast(cast, out, 'stock-add', `${theme}${reduced ? '-reduced' : ''}`);
      const maxStep = Math.max(...samples.slice(1).map((row, i) => Math.abs(row.y - samples[i].y)));
      const first = samples[0].y, last = samples.at(-1).y;
      const intermediate = samples.filter((row) => row.y < first - 1 && row.y > last + 1).length;
      assert.equal(new Set(samples.map((row) => row.scroll)).size, 1);
      assert.equal(new Set(samples.map((row) => row.backgroundY)).size, 1);
      if (!baseline && !reduced) { assert.ok(maxStep < 65, `${theme}: ${maxStep}px jump`); assert.ok(intermediate >= 12); }
      if (reduced) assert.equal(intermediate, 0);
      results.push({ theme, reduced, maxStep, intermediate, themeProof: await page.evaluate(() => window.__sweepThemeProof), evidence, samples });
      if (!baseline) {
        assert.equal(await page.locator('[data-sheet]').evaluate((node) => node === document.activeElement), true);
        await page.keyboard.press('Tab');
        assert.equal(await page.locator('#care-stock-drug').evaluate((node) => node === document.activeElement), true);
        await page.locator('#care-stock-drug').fill('Test medication');
        await page.locator('#care-stock-quantity').fill('20');
        await page.locator('#care-stock-unit').fill('tablets');
        await page.locator('#care-stock-doses-per-unit').fill('2');
        await page.locator('#care-stock-lead-time').fill('7');
        await fillDate(page, '#care-stock-opened', '2026-10-01');
        await page.locator('#care-stock-window-days').fill('30');
        await page.evaluate(() => {
          window.__stockSave = [];
          const start = performance.now();
          const read = (now) => {
            const sheet = document.querySelector('[data-sheet]');
            window.__stockSave.push({ ms: Math.round(now - start), y: sheet.getBoundingClientRect().top,
              height: sheet.getBoundingClientRect().height, scroll: sheet.scrollTop });
            if (now - start < 700) requestAnimationFrame(read);
          };
          requestAnimationFrame(read);
        });
        await page.locator('[data-save-stock]').click();
        const row = page.locator('[data-stock]');
        await row.waitFor();
        await page.waitForTimeout(500);
        assert.match(await row.textContent(), /20.*tablets/);
        await page.waitForTimeout(250);
        results.at(-1).saveSamples = await page.evaluate(() => window.__stockSave);
        const saveSamples = results.at(-1).saveSamples;
        const saveStep = Math.max(...saveSamples.slice(1).map((row,i)=>Math.abs(row.y-saveSamples[i].y)));
        if (!reduced) assert.ok(saveStep < 65, `Save stock jumps ${saveStep}px`);
        let populatedSamples;
        const populatedCast = await screencast(page, async (frames) => {
          await page.evaluate(() => {
            window.__stockPopulated = [];
            const start = performance.now();
            const read = (now) => {
              const sheet = document.querySelector('[data-sheet]');
              window.__stockPopulated.push({ ms: Math.round(now - start), y: sheet.getBoundingClientRect().top,
                height: sheet.getBoundingClientRect().height, scroll: sheet.scrollTop,
                outgoing: !!sheet.querySelector('[data-stock]'), form: !!sheet.querySelector('[data-save-stock]') });
              if (now - start < 650) requestAnimationFrame(read);
            };
            requestAnimationFrame(read);
          });
          await page.waitForTimeout(60);
          await page.locator('[data-add-stock]').press('Enter');
          await page.waitForTimeout(700);
          populatedSamples = await page.evaluate(() => window.__stockPopulated);
          return frames;
        });
        const populatedStep = Math.max(...populatedSamples.slice(1).map((row,i)=>Math.abs(row.y-populatedSamples[i].y)));
        if (!reduced) assert.ok(populatedStep < 65);
        assert.equal(await page.locator('#care-stock-drug').inputValue(), '');
        const populatedEvidence = await saveSceneCast(populatedCast, out, 'stock-add-populated', `${theme}${reduced ? '-reduced' : ''}`);
        results.at(-1).populated = { samples: populatedSamples, maxStep: populatedStep, evidence: populatedEvidence };
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => !document.querySelector('[data-sheet]'));
        await page.locator('[data-list-row="stock"]').click();
        await page.waitForTimeout(500);
        await row.press('Enter');
        await page.waitForTimeout(500);
        assert.equal(await page.locator('#care-stock-quantity').inputValue(), '20');
        assert.equal(await page.locator('#care-stock-unit').inputValue(), 'tablets');
        assert.equal(await page.locator('#care-stock-doses-per-unit').inputValue(), '2');
        assert.equal(await page.locator('#care-stock-lead-time').inputValue(), '7');
        assert.equal(await dateValue(page.locator('#care-stock-opened')), '2026-10-01');
        assert.equal(await page.locator('#care-stock-window-days').inputValue(), '30');
        await page.locator('[data-sheet] [data-segment="end"]').click();
        await fillDate(page, '#care-stock-window-end', '2026-10-31');
        await page.locator('#care-stock-quantity').fill('12');
        await page.locator('[data-save-stock]').click();
        await page.waitForTimeout(500);
        assert.match(await row.textContent(), /12.*tablets/);
        await row.click();
        await page.waitForTimeout(500);
        assert.equal(await dateValue(page.locator('#care-stock-window-end')), '2026-10-31');
        await page.locator('[data-delete-stock]').click();
        const confirm = page.locator('[data-sheet]:has([data-confirm-delete-stock])');
        await confirm.waitFor();
        await page.waitForTimeout(500);
        await confirm.locator('.btn-ghost').click();
        await confirm.waitFor({ state: 'detached' });
        assert.equal(await page.locator('#care-stock-quantity').inputValue(), '12');
        await page.locator('[data-delete-stock]').click();
        await page.locator('[data-confirm-delete-stock]').click();
        await page.waitForFunction(() => document.querySelectorAll('[data-sheet]').length === 0);
        await page.locator('[data-list-row="stock"]').click();
        await page.locator('[data-notice="care-stock-empty"]').waitFor();
        assert.equal(await row.count(), 0);
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => !document.querySelector('[data-sheet]'));
        await page.evaluate(FILL_EVERY_FEATURE_EXPRESSION);
        await settlePage(page, base, '/care', theme);
        await page.waitForTimeout(700);
        const stockLines = page.locator('[data-care-regimen-stock]');
        assert.ok(await stockLines.count() > 0);
        const projections = await stockLines.allTextContents();
        await stockLines.first().click();
        await page.waitForTimeout(500);
        const quantity = await page.locator('#care-stock-quantity').inputValue();
        const unit = await page.locator('#care-stock-unit').inputValue();
        assert.ok(quantity.length > 0 && unit.length > 0);
        assert.match(await page.locator('#care-stock-drug').getAttribute('placeholder'), /estradiol|testosterone/);
        await page.locator('[data-save-stock]').click();
        await page.waitForTimeout(500);
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => !document.querySelector('[data-sheet]'));
        assert.deepEqual(await stockLines.allTextContents(), projections);
        results.at(-1).projectionProof = { quantity, unit, lines: projections };
        assert.deepEqual(errors, []);
      }
    } finally { await context.close(); }
   }
  }
} finally { await browser.close(); await app.close(); }
await writeFile(`${out}/results.json`, JSON.stringify(results, null, 2));
console.log(results.map(({theme,reduced,maxStep,intermediate,populated})=>({theme,reduced,maxStep,intermediate,populatedStep:populated?.maxStep})));
