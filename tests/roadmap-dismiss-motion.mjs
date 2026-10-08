/* A dismissed track must keep its rows while its height withdraws. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { launchChromium, previewBuild } from './browser-harness.mjs';
import { INIT_HIDE_DEMO_SCRIPT } from './yank-sweep-core.mjs';

const out = resolve(process.env.ROADMAP_MOTION_OUT ?? '.claude/roadmap-dismiss-motion');
await mkdir(out, { recursive: true });
const app = await previewBuild(process.cwd());
const browser = await launchChromium();
const failures = [];
const results = [];
try {
  for (const theme of ['light', 'dark']) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'no-preference' });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(INIT_HIDE_DEMO_SCRIPT);
    await page.goto(`http://localhost:${app.httpServer.address().port}/transition/roadmap`, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-app-root][data-boot="ready"]', { timeout: 60000 });
    if (await page.locator('[data-leave-setup]').count()) {
      await page.locator('[data-leave-setup]').click();
      await page.goto(`http://localhost:${app.httpServer.address().port}/transition/roadmap`, { waitUntil: 'networkidle' });
    }
    await page.evaluate((theme) => {
      document.documentElement.dataset.theme = theme;
    }, theme);
    await page.locator('[data-segment="social"]').click();
    const toggle = page.locator('[data-track-toggle="social"]');
    await page.waitForTimeout(600);
    const rows = await page.locator('[data-track-panel="social"] [data-goal]').count();
    const states = await page.locator('[data-track-panel="social"] [data-goal]').evaluateAll((nodes) => nodes.map((node) => [node.dataset.goal, node.dataset.status]));
    const count = await page.locator('[data-roadmap-track-steps="social"]').innerText();
    async function travel(action) {
      await toggle.focus();
      const samples = page.evaluate(() => new Promise((done) => {
        const start = performance.now();
        const frames = [];
        function frame() {
          const panel = document.querySelector('[data-track-panel="social"]');
          frames.push({ frame: frames.length, ms: performance.now() - start,
            rows: panel.querySelectorAll('[data-goal]').length,
            dismissed: panel.querySelector('[data-track-toggle]').dataset.dismissed,
            sources: document.querySelector('[data-roadmap-sources]').getBoundingClientRect().top,
            scroll: window.scrollY });
          if (performance.now() - start < 650) requestAnimationFrame(frame);
          else done(frames);
        }
        frame();
      }));
      await page.keyboard.press('Enter');
      const frames = await samples;
      await page.screenshot({ path: `${out}/${theme}-${action}-rest.png` });
      results.push({ theme, action, frames });
      await writeFile(`${out}/frames.json`, JSON.stringify({ results, failures }, null, 2));
      const from = frames[0].sources;
      const to = frames.at(-1).sources;
      const middle = frames.filter((f) => f.sources > Math.min(from, to) + 1 && f.sources < Math.max(from, to) - 1);
      if (middle.length < 3) failures.push(`${theme} ${action}: following content cut (${middle.length} intermediate frames)`);
      const switched = frames.findIndex((f) => f.dismissed === (action === 'dismiss' ? 'true' : 'false'));
      if (action === 'dismiss' && switched >= 0 && frames[switched].rows !== rows) failures.push(`${theme}: rows removed on first dismissed frame`);
      assert(frames.every((f) => f.scroll === frames[0].scroll), 'scroll must stay still');
      assert.equal(await toggle.evaluate((node) => node === document.activeElement), true, 'toggle keeps keyboard focus');
    }
    await travel('dismiss');
    assert.equal(await toggle.getAttribute('data-dismissed'), 'true');
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('[data-track-toggle="social"][data-dismissed="true"]', { state: 'attached' });
    await page.locator('[data-segment="social"]').click();
    await page.evaluate((theme) => { document.documentElement.dataset.theme = theme; }, theme);
    await page.waitForTimeout(600);
    await travel('restore');
    assert.equal(await page.locator('[data-track-panel="social"] [data-goal]').count(), rows);
    assert.deepEqual(await page.locator('[data-track-panel="social"] [data-goal]').evaluateAll((nodes) => nodes.map((node) => [node.dataset.goal, node.dataset.status])), states);
    assert.equal(await page.locator('[data-roadmap-track-steps="social"]').innerText(), count);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${out}/${theme}-desktop-restored.png` });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'desktop must not overflow');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await toggle.focus();
    await page.keyboard.press('Enter');
    await page.waitForSelector('[data-track-toggle="social"][data-dismissed="true"]');
    await page.waitForTimeout(80);
    assert.equal(await page.locator('[data-track-panel="social"] [data-goal]').count(), 0, 'reduced motion settles immediately');
    assert.deepEqual(errors, []);
    await page.close();
  }
  await writeFile(`${out}/frames.json`, JSON.stringify({ results, failures }, null, 2));
  assert.deepEqual(failures, [], 'roadmap dismissal and restoration must travel');
} finally {
  await browser.close();
  await app.close();
}
