import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { launchChromium, previewBuild, screencast, settlePage } from './browser-harness.mjs';
import { FILL_EVERY_FEATURE_EXPRESSION, INIT_HIDE_DEMO_SCRIPT, STUB_PERSIST_SCRIPT, TELEPORT_PX, saveSceneCast } from './yank-sweep-core.mjs';

// Run against a demo build. Each theme starts with its own automatic preference.
const out = resolve(process.argv[2] ?? '.claude/settings-cycle-motion');
await mkdir(out, { recursive: true });
const app = await previewBuild(process.cwd());
const browser = await launchChromium();
const base = `http://localhost:${app.httpServer.address().port}`;
const results = [];
const failures = [];
try {
  for (const theme of ['light', 'dark']) {
    for (const reduced of [false, true]) {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: reduced ? 'reduce' : 'no-preference' });
      try {
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', (error) => errors.push(String(error)));
        await page.addInitScript(INIT_HIDE_DEMO_SCRIPT);
        await page.addInitScript(STUB_PERSIST_SCRIPT);
        await settlePage(page, base, '/', theme);
        await page.evaluate(FILL_EVERY_FEATURE_EXPRESSION);
        await settlePage(page, base, '/settings', theme);
        const button = page.locator('[data-cycle-tracking-toggle] button.switch');
        const explanation = page.locator('[data-cycle-tracking-toggle] .kit-row-sub');
        await explanation.waitFor();
        await button.scrollIntoViewIfNeeded();
        await button.focus();
        await page.waitForTimeout(700);
        assert.equal(await button.getAttribute('role'), 'switch');
        assert.equal(await button.getAttribute('aria-label'), await page.locator('[data-cycle-tracking-toggle] .kit-row-title').textContent());
        const checked = await button.getAttribute('aria-checked');
        let samples;
        const cast = await screencast(page, async (frames) => {
          await page.evaluate(() => {
            window.__cycleSamples = [];
            window.__cycleSampling = true;
            const started = performance.now();
            const read = (now) => {
              if (!window.__cycleSampling) return;
              const sub = document.querySelector('[data-cycle-tracking-toggle] .kit-row-sub');
              const unit = document.querySelector('[data-measurement-unit]');
              const reminders = document.querySelector('[data-list-row="reminders"]');
              window.__cycleSamples.push({ ms: Math.round(now - started), height: sub?.getBoundingClientRect().height ?? 0,
                unitY: unit?.getBoundingClientRect().top, remindersY: reminders?.getBoundingClientRect().top,
                scroll: document.querySelector('.app-main')?.scrollTop ?? window.scrollY });
              requestAnimationFrame(read);
            };
            requestAnimationFrame(read);
          });
          await page.waitForTimeout(70);
          await button.press('Enter');
          await page.waitForTimeout(650);
          samples = await page.evaluate(() => { window.__cycleSampling = false; return window.__cycleSamples; });
          return frames;
        });
        const label = `${theme}${reduced ? '-reduced' : ''}`;
        const evidence = await saveSceneCast(cast, out, 'cycle-explanation', label);
        const maxStep = Math.max(...samples.slice(1).map((sample, index) => Math.abs(sample.unitY - samples[index].unitY)));
        const remindersStep = Math.max(...samples.slice(1).map((sample, index) => Math.abs(sample.remindersY - samples[index].remindersY)));
        const intermediate = samples.filter((sample) => sample.height > 0.5 && sample.height < samples[0].height - 0.5).length;
        assert.ok(Number.isFinite(maxStep) && Number.isFinite(remindersStep), 'both downstream rows must be measured');
        const result = { theme, reduced, maxStep, remindersStep, intermediate, evidence, samples };
        results.push(result);
        if (!reduced && (intermediate < 3 || maxStep > TELEPORT_PX || remindersStep > TELEPORT_PX)) failures.push(`${label}: explanation cut or downstream jump (${maxStep}px, ${intermediate} intermediate frames)`);
        assert.equal(await explanation.count(), 0);
        if (reduced) assert.equal(intermediate, 0);
        assert.equal(await button.getAttribute('aria-checked'), checked === 'true' ? 'false' : 'true');
        assert.equal(await button.evaluate((node) => node === document.activeElement), true);
        await page.reload({ waitUntil: 'networkidle' });
        await page.waitForSelector('[data-app-root][data-boot="ready"]');
        assert.equal(await explanation.count(), 0);
        assert.equal(await button.getAttribute('aria-checked'), checked === 'true' ? 'false' : 'true');
        await button.press('Space');
        assert.equal(await button.getAttribute('aria-checked'), checked);
        assert.equal(await explanation.count(), 0);
        if (!reduced) {
          result.layouts = [];
          for (const width of [390, 780, 195]) {
            await page.setViewportSize({ width, height: 844 });
            await button.scrollIntoViewIfNeeded();
            await page.waitForTimeout(450);
            const layout = await button.evaluate((node) => {
              const rect = node.getBoundingClientRect();
              const main = document.querySelector('.app-main');
              const unit = document.querySelector('[data-measurement-unit]');
              return { width: rect.width, height: rect.height, focused: node === document.activeElement,
                horizontalOverflow: main.scrollWidth > main.clientWidth,
                mainWidth: main.clientWidth, mainScrollWidth: main.scrollWidth,
                units: [unit, ...unit.children].map((element) => ({ selector: element.className,
                  width: element.getBoundingClientRect().width, minWidth: getComputedStyle(element).minWidth,
                  left: element.getBoundingClientRect().left, right: element.getBoundingClientRect().right })) };
            });
            result.layouts.push({ viewport: width, ...layout });
            await page.screenshot({ path: `${out}/${label}-${width}px.png` });
          }
        }
        assert.deepEqual(errors, []);
        console.log(`${label}: max downstream step ${maxStep.toFixed(2)}px, ${intermediate} intermediate frames; keyboard and persistence pass`);
      } finally {
        await context.close();
      }
    }
  }
} finally {
  await writeFile(`${out}/report.json`, JSON.stringify({ results, failures }, null, 2));
  await browser.close();
  await new Promise((resolve) => app.httpServer.close(resolve));
}
assert.deepEqual(failures, []);
