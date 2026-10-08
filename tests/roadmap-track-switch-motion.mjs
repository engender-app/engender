import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { launchChromium, previewBuild } from './browser-harness.mjs';
import { INIT_HIDE_DEMO_SCRIPT } from './yank-sweep-core.mjs';

const out = resolve(process.env.ROADMAP_SWITCH_OUT ?? '.claude/roadmap-track-switch-motion');
await mkdir(out, { recursive: true });
const app = await previewBuild(process.cwd());
const browser = await launchChromium();
const results = [];
const failures = [];
try {
  for (const theme of ['light', 'dark']) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.addInitScript(INIT_HIDE_DEMO_SCRIPT);
    await page.goto(`http://localhost:${app.httpServer.address().port}/transition/roadmap`, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-app-root][data-boot="ready"]', { timeout: 60000 });
    if (await page.locator('[data-leave-setup]').count()) {
      await page.locator('[data-leave-setup]').click();
      await page.goto(`http://localhost:${app.httpServer.address().port}/transition/roadmap`, { waitUntil: 'networkidle' });
    }
    await page.evaluate((theme) => { document.documentElement.dataset.theme = theme; }, theme);
    await page.locator('[data-segment="social"]').click();
    await page.waitForTimeout(600);
    const states = await page.locator('[data-goal]').evaluateAll((nodes) => nodes.map((node) => [node.dataset.goal, node.dataset.status]));
    await page.locator('[data-segment="legal"]').focus();
    const frames = await page.evaluate(() => new Promise((done) => {
      const start = performance.now();
      const frames = [];
      const sample = () => {
        const read = (track) => {
          const node = document.querySelector(`[data-track-panel="${track}"]`);
          return { hidden: node.hidden, inert: node.inert, opacity: Number(getComputedStyle(node).opacity) };
        };
        frames.push({ frame: frames.length, ms: performance.now() - start, social: read('social'), legal: read('legal'), sources: document.querySelector('[data-roadmap-sources]').getBoundingClientRect().top });
        if (performance.now() - start < 650) requestAnimationFrame(sample);
        else done(frames);
      };
      sample();
      document.querySelector('[data-segment="legal"]').click();
    }));
    results.push({ theme, frames });
    for (const track of ['social', 'legal']) {
      if (frames.filter((frame) => !frame[track].hidden && frame[track].opacity > 0.01 && frame[track].opacity < 0.99).length < 2) failures.push(`${theme}: ${track} has no withdrawal or arrival`);
    }
    assert.equal(await page.locator('[data-segment="legal"]').evaluate((node) => node === document.activeElement), true);
    assert.deepEqual(await page.locator('[data-goal]').evaluateAll((nodes) => nodes.map((node) => [node.dataset.goal, node.dataset.status])), states);
    assert.equal(await page.locator('[data-track-panel="social"]').evaluate((node) => node.hidden), true);
    await page.locator('[data-segment="social"]').click();
    await page.locator('[data-segment="legal"]').click();
    await page.locator('[data-segment="social"]').click();
    await page.waitForTimeout(600);
    assert.equal(await page.locator('[data-track-panel="social"]').evaluate((node) => node.hidden || node.inert), false);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForTimeout(80);
    await page.locator('[data-segment="legal"]').click();
    await page.waitForTimeout(80);
    assert.equal(await page.locator('[data-track-panel="social"]').evaluate((node) => node.hidden), true);
    assert.equal(await page.locator('[data-track-panel="legal"]').evaluate((node) => node.hidden || node.inert), false);
    await page.close();
  }
  await writeFile(`${out}/frames.json`, JSON.stringify({ results, failures }, null, 2));
  assert.deepEqual(failures, []);
} finally {
  await browser.close();
  await app.close();
}
