import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { launchChromium, previewBuild, settlePage, screencast } from './browser-harness.mjs';
import { INIT_HIDE_DEMO_SCRIPT, RESET_PERSONA_EXPRESSION, DEMO_THEME_EXPRESSION } from './yank-sweep-core.mjs';

const output = resolve(process.argv[2] ?? '.claude/today-editor-opening');
const browser = await launchChromium();
const app = await previewBuild(resolve(process.argv[3] ?? process.cwd()));
let failed = false;
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.addInitScript(INIT_HIDE_DEMO_SCRIPT);
  const base = `http://localhost:${app.httpServer.address().port}`;
  await settlePage(page, base, '/', 'light');
  await page.evaluate(RESET_PERSONA_EXPRESSION);
  for (const theme of ['light', 'dark']) {
    await page.evaluate(DEMO_THEME_EXPRESSION(theme));
    await page.waitForTimeout(1200);
    await page.locator('[data-edit-today]').scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    const dir = resolve(output, theme);
    await mkdir(dir, { recursive: true });
    await screencast(page, async (frames) => {
      await page.evaluate(() => {
        window.__openingSamples = [];
        window.__openingStart = Date.now();
        const start = performance.now();
        const tick = () => {
          const at = performance.now() - start;
          let scroll = window.scrollY;
          for (let el = document.querySelector('[data-home-pinned]'); el; el = el.parentElement) scroll += el.scrollTop;
          const row = { at, scroll };
          for (const [key, selector] of Object.entries({ wrapper: '[data-home-editing]', editor: '[data-today-editor]', heading: '[data-today-editor] h2', backup: '[data-backup-notice]' })) {
            const el = document.querySelector(selector);
            if (!el) continue;
            const box = el.getBoundingClientRect();
            const css = getComputedStyle(el);
            row[key] = { y: box.y, height: box.height, marginTop: css.marginTop, overflow: css.overflow, display: css.display };
          }
          window.__openingSamples.push(row);
          if (at < 900) requestAnimationFrame(() => setTimeout(tick, 0));
        };
        document.querySelector('[data-edit-today]').click();
        requestAnimationFrame(() => setTimeout(tick, 0));
      });
      await page.waitForTimeout(1100);
      const { samples, start } = await page.evaluate(() => ({ samples: window.__openingSamples, start: window.__openingStart }));
      assert(samples.filter((s) => s.heading && s.at > 300).length >= 10, 'opening probe needs ten final heading samples');
      await writeFile(resolve(dir, 'styles.json'), JSON.stringify(samples, null, 2));
      await writeFile(resolve(dir, 'frames.json'), JSON.stringify(frames.map((f, i) => ({ frame: i, at: f.at - start })), null, 2));
      for (const [i, frame] of frames.entries()) await writeFile(resolve(dir, `${String(i).padStart(3, '0')}-${Math.round(frame.at - start)}ms.png`), Buffer.from(frame.data, 'base64'));
      const jumps = samples.flatMap((s, i) => {
        const previous = samples[i - 1];
        if (!s.heading || !previous?.heading || s.at < 300) return [];
        const delta = s.heading.y - previous.heading.y;
        return Math.abs(delta) > 4 && s.scroll === previous.scroll ? [{ at: s.at, delta, scroll: s.scroll }] : [];
      });
      console.log(`${jumps.length ? 'FAIL' : 'PASS'} ${theme} final opening continuity`, JSON.stringify(jumps));
      failed ||= jumps.length > 0;
    });
    await page.locator('[data-edit-done]').click();
    await page.waitForTimeout(1000);
  }
  await page.locator('[data-edit-today]').click();
  await page.waitForTimeout(1000);
  const keys = () => page.locator('[data-edit-pinned-row]').evaluateAll((els) => els.map((el) => el.dataset.editPinnedRow));
  const before = await keys();
  assert(before.length >= 2, 'persona needs two keyboard-reorder rows');
  const handle = page.locator(`[data-edit-grip="${before[0]}"]`);
  await handle.focus();
  await handle.press('ArrowDown');
  await page.waitForTimeout(500);
  assert.equal((await keys())[1], before[0]);
  assert(await handle.evaluate((el) => el === document.activeElement), 'keyboard handle retains focus');
  await handle.press('ArrowUp');
  await page.waitForTimeout(500);
  assert.deepEqual(await keys(), before);
  for (const selector of ['[data-edit-tile] [role="switch"]', '[data-edit-kind] [role="switch"]']) {
    const control = page.locator(selector).first();
    const checked = await control.getAttribute('aria-checked');
    await control.click();
    assert.notEqual(await control.getAttribute('aria-checked'), checked);
    await control.click();
    assert.equal(await control.getAttribute('aria-checked'), checked);
  }
  await page.locator('[data-edit-reset]').click();
  await page.waitForSelector('[data-confirm-edit-reset]');
  assert.deepEqual(await keys(), before, 'reset waits for confirmation');
  await page.locator('[data-confirm-edit-reset]').click();
  await page.waitForTimeout(700);
  for (const key of await keys()) {
    await page.locator(`[data-edit-unpin="${key}"]`).click();
    await page.waitForTimeout(300);
  }
  assert(await page.locator('[data-edit-none]').count(), 'empty arrangement has explanation');
  await page.locator('[data-edit-done]').click();
  await page.waitForTimeout(1000);
  assert(await page.locator('[data-edit-today]').count(), 'empty arrangement retains entry point');
  await page.locator('[data-edit-today]').click();
  await page.waitForTimeout(1000);
  await page.locator('[data-edit-add]').first().click();
  await page.waitForTimeout(400);
  assert.equal((await keys()).length, 1);
  console.log('PASS keyboard reorder/focus, tile/agenda choices, reset confirmation, empty access/add');
  await page.locator('[data-edit-done]').click();
  await page.waitForTimeout(1000);
} finally {
  await browser.close();
  await new Promise((resolveClose) => app.httpServer.close(resolveClose));
}
if (failed) process.exitCode = 1;
