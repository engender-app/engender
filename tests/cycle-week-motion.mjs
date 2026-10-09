import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { launchChromium, previewBuild, screencast, settlePage } from './browser-harness.mjs';
import { FILL_EVERY_FEATURE_EXPRESSION, INIT_HIDE_DEMO_SCRIPT, saveSceneCast } from './yank-sweep-core.mjs';

const args = process.argv.slice(2);
const reportIndex = args.indexOf('--report');
if (reportIndex >= 0) {
  const report = JSON.parse(await readFile(args[reportIndex + 1], 'utf8'));
  assert.equal(report.complete, true);
  assert.equal(report.report.length, 4);
  const owned = report.report.flatMap((run) => {
    assert.ok(run.scene.startsWith('cycle-week-'));
    assert.ok(!run.error && run.cast > 0);
    return run.yanks.filter((finding) => !(finding.kind === 'colour' && finding.mark.includes('kit-strip-cell')) && !(finding.kind === 'arrival' && finding.mark.startsWith('.day-strip-week.')));
  });
  assert.deepEqual(owned, [], 'Cycle weekly rows or history still yank in the original sweep');
  console.log('Original sweep: no Cycle weekly-row or history yanks');
  process.exit(0);
}
const outIndex = args.indexOf('--out');
const out = resolve(outIndex >= 0 ? args[outIndex + 1] : '.claude/cycle-week-motion');
await mkdir(out, { recursive: true });
const app = await previewBuild(process.cwd());
const browser = await launchChromium();
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.addInitScript(INIT_HIDE_DEMO_SCRIPT);
  const base = `http://localhost:${app.httpServer.address().port}`;
  await settlePage(page, base, '/', 'light');
  await page.evaluate(FILL_EVERY_FEATURE_EXPRESSION);
  await page.waitForTimeout(1500);
  for (const theme of ['light', 'dark']) {
    await settlePage(page, base, '/health/cycle-events', theme);
    await page.locator('[data-strip-earlier]').waitFor();
    await page.waitForTimeout(1000);
    const range = await page.locator('[data-cycle-event-history-range]').textContent();
    const events = await page.locator('[data-cycle-event]').count();
    assert.ok(events > 0);
    for (const direction of ['earlier', 'later']) {
      const { samples, cast } = await screencast(page, async (cast) => {
        const samples = await page.evaluate(async (direction) => {
          const old = document.querySelector('.cycle-week-content') ?? document.querySelector('[data-strip-week-empty]') ?? document.querySelector('[data-cycle-event]').parentElement;
          const heading = [...document.querySelectorAll('h2')].find((node) => node.textContent === 'Cycle history');
          const read = (node) => ({ y: node.getBoundingClientRect().y, opacity: Number(getComputedStyle(node).opacity) });
          const start = performance.now();
          const samples = [{ frame: 0, ms: 0, history: read(heading), old: read(old) }];
          document.querySelector(`[data-strip-${direction}]`).click();
          await new Promise((resolve) => {
            const tick = () => {
              const incoming = [...document.querySelectorAll('.cycle-week-content')].find((node) => node !== old && !node.hasAttribute('data-leaving'));
              samples.push({ frame: samples.length, ms: performance.now() - start, history: read(heading), old: old.isConnected ? { ...read(old), inert: old.inert } : null, incoming: incoming ? read(incoming) : null });
              if (performance.now() - start < 450) requestAnimationFrame(tick);
              else resolve();
            };
            requestAnimationFrame(tick);
          });
          return samples;
        }, direction);
        return { samples, cast };
      });
      await saveSceneCast(cast, out, `cycle-week-${direction}`, `persona-${theme}-p1`);
      await writeFile(`${out}/${theme}-${direction}.json`, JSON.stringify(samples, null, 2));
      assert.ok(samples.some((s) => s.frame > 0 && s.old?.opacity > 0.05 && s.old.opacity < 0.99), `${theme}/${direction}: outgoing rows did not withdraw`);
      assert.ok(samples.some((s) => s.incoming?.opacity > 0.05 && s.incoming.opacity < 0.99), `${theme}/${direction}: incoming rows did not reveal`);
      const travel = Math.abs(samples.at(-1).history.y - samples[0].history.y);
      assert.ok(travel > 10, `${theme}/${direction}: history never changed position`);
      const steps = samples.slice(1).map((s, i) => Math.abs(s.history.y - samples[i].history.y));
      assert.ok(Math.max(...steps) < travel * 0.6, `${theme}/${direction}: history jumped ${Math.max(...steps)}px of ${travel}px`);
      assert.ok(samples.filter((s) => s.frame > 0 && s.old).every((s) => s.old.inert), `${theme}/${direction}: outgoing content remains interactive`);
      assert.equal(samples.at(-1).old, null);
      assert.equal(await page.locator('[data-cycle-event-history-range]').textContent(), range);
      console.log(`${theme}/${direction}: ${samples.length} frames, ${travel}px travel, ${Math.max(...steps).toFixed(2)}px largest step`);
    }
    assert.equal(await page.locator('[data-cycle-event]').count(), events);
    await page.locator('[data-strip-earlier]').click();
    await page.waitForTimeout(60);
    await page.locator('[data-strip-later]').click();
    await page.waitForTimeout(550);
    assert.equal(await page.locator('.cycle-week-content').count(), 1);
    assert.equal(await page.locator('[data-cycle-event]').count(), events);
    assert.equal(await page.locator('.cycle-week').evaluate((node) => node.style.height), '');
    const editorLauncher = await page.locator('[data-cycle-event]').first().elementHandle();
    await page.locator('[data-cycle-event]').first().click();
    await page.locator('#cycle-event-date').waitFor();
    await page.keyboard.press('Escape');
    await page.locator('#cycle-event-date').waitFor({ state: 'detached' });
    assert.equal(await editorLauncher.evaluate((node) => node.isConnected && node === document.activeElement), true);
    await page.evaluate(() => { document.documentElement.dataset.a11yMotion = 'reduce'; });
    await page.locator('[data-strip-earlier]').click();
    await page.waitForTimeout(50);
    assert.equal(await page.locator('.cycle-week-content').count(), 1);
    assert.equal(await page.locator('[data-strip-week-empty]').count(), 1);
    assert.equal(await page.locator('.cycle-week').evaluate((node) => node.getAnimations().length), 0);
    await page.locator('[data-strip-later]').click();
    await page.waitForTimeout(50);
    assert.equal(await page.locator('[data-cycle-event]').count(), events);
    await page.evaluate(() => { delete document.documentElement.dataset.a11yMotion; });
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  app.httpServer.close();
}
