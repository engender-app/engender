import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { launchChromium, previewBuild, screencast, settlePage } from './browser-harness.mjs';
import { INIT_HIDE_DEMO_SCRIPT, STUB_PERSIST_SCRIPT, FILL_EVERY_FEATURE_EXPRESSION, saveSceneCast } from './yank-sweep-core.mjs';

const baseline = process.argv.includes('--baseline');
const out = resolve(process.argv[2]?.startsWith('--') ? '.claude/procedure-collapse-motion' : process.argv[2] ?? '.claude/procedure-collapse-motion');
await mkdir(out, { recursive: true });
const app = await previewBuild(process.cwd());
const browser = await launchChromium();
const base = `http://localhost:${app.httpServer.address().port}`;
const results = [];

async function recordClose(page, id, name) {
  const button = page.locator(`[data-procedure="${id}"] .proc-face`);
  await button.press('Enter');
  const panel = page.locator(`[data-recovery-log="${id}"]`);
  await panel.waitFor();
  await page.waitForTimeout(600);
  const notes = await page.locator('#surgery-notes').inputValue();
  const content = await panel.textContent();
  await panel.evaluate((node) => {
    const scroller = node.closest('[data-app-scroll-region]');
    scroller.scrollTop += node.getBoundingClientRect().top - 140;
  });
  const cast = await screencast(page, async (frames) => {
    await page.evaluate((id) => {
      const panel = document.querySelector(`[data-recovery-log="${id}"]`);
      const children = [...panel.querySelectorAll('*')].filter((node) => !node.closest('svg') && !node.classList.contains('visually-hidden'));
      const bounds = (node) => {
        const rect = node.getBoundingClientRect();
        return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right, height: rect.height };
      };
      const painted = (node) => {
        let box = bounds(node), opacity = 1;
        for (let ancestor = node; ancestor; ancestor = ancestor.parentElement) {
          const style = getComputedStyle(ancestor);
          opacity *= Number(style.opacity);
          if (style.display === 'none' || style.visibility === 'hidden') opacity = 0;
          if (/(hidden|clip|auto|scroll)/.test(style.overflowY)) {
            const clip = bounds(ancestor);
            box.top = Math.max(box.top, clip.top);
            box.bottom = Math.min(box.bottom, clip.bottom);
          }
        }
        return { ...box, opacity, visible: node.isConnected && opacity > 0.03 && box.bottom > box.top + 0.5 };
      };
      window.__procedureFrames = [];
      window.__procedureSampling = true;
      const started = performance.now();
      const read = (now) => {
        if (!window.__procedureSampling) return;
        const root = bounds(panel);
        const blocks = children.map((node, index) => ({ index, tag: node.tagName, ...painted(node) }));
        window.__procedureFrames.push({ ms: now - started, connected: panel.isConnected, bounds: root,
          overflow: getComputedStyle(panel).overflowY, opacity: Number(getComputedStyle(panel).opacity), blocks,
          outside: blocks.filter((block) => block.visible && (block.top < root.top - 1 || block.bottom > root.bottom + 1)).map((block) => block.index) });
        requestAnimationFrame(read);
      };
      requestAnimationFrame(read);
    }, id);
    await page.waitForTimeout(60);
    await button.evaluate((node) => node.click());
    await page.waitForTimeout(700);
    await page.evaluate(() => { window.__procedureSampling = false; });
    return frames;
  });
  const samples = await page.evaluate(() => window.__procedureFrames);
  const evidence = await saveSceneCast(cast, out, 'procedure-close', name);
  const openHeight = samples[0].bounds.height;
  const intermediate = samples.filter((sample) => sample.connected && sample.bounds.height > 1 && sample.bounds.height < openHeight - 1);
  const record = { id, name, openHeight, intermediate: intermediate.length, evidence, samples };
  results.push(record);
  await writeFile(`${out}/results.json`, JSON.stringify(results, null, 2));
  if (!baseline) {
    assert.equal(samples.some((sample) => sample.outside.length), false, `${name}: child paints outside closing panel`);
    if (!name.includes('reduce')) {
      assert.ok(intermediate.length >= 3, `${name}: no shared closing travel`);
      assert.ok(intermediate.every((sample) => /hidden|clip/.test(sample.overflow)), `${name}: closing panel does not clip children`);
      const fading = intermediate.filter((sample) => sample.opacity > 0.03 && sample.opacity < 0.97);
      assert.ok(fading.length > 0, `${name}: no shared closing fade`);
      assert.ok(fading.every((sample) => sample.blocks.every((block) => block.opacity <= sample.opacity + 0.001)), `${name}: child does not share panel fade`);
      const last = samples.filter((sample) => sample.connected).at(-1);
      assert.ok(last.bounds.height < 4, `${name}: panel disappears at ${last.bounds.height}px`);
    } else {
      assert.equal(intermediate.length, 0, `${name}: reduced motion still travels`);
    }
    assert.equal(await panel.count(), 0);
    assert.equal(await button.getAttribute('aria-expanded'), 'false');
    assert.equal(await page.locator('#surgery-notes').count(), 0);
    assert.equal(await page.locator('[data-recovery-log]').count(), 0);
    assert.ok(samples.filter((sample) => !sample.connected || sample.bounds.height <= 1).every((sample) => sample.blocks.every((block) => !block.visible)), `${name}: content survives closed bounds`);
    assert.equal(await button.getAttribute('aria-controls'), `procedure-log-${id}`);
    await button.press('Enter');
    await panel.waitFor();
    await page.waitForTimeout(600);
    assert.equal(await page.locator('#surgery-notes').inputValue(), notes);
    assert.equal(await panel.textContent(), content);
    await button.press('Enter');
    await panel.waitFor({ state: 'detached' });
  }
  return { notes, content };
}

try {
  const modes = baseline ? [{ theme: 'light', reduced: 'none' }] : [
    { theme: 'light', reduced: 'none' }, { theme: 'dark', reduced: 'none' },
    { theme: 'light', reduced: 'system' }, { theme: 'dark', reduced: 'app' }
  ];
  for (const mode of modes) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: mode.reduced === 'system' ? 'reduce' : 'no-preference' });
    try {
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(String(error)));
      await page.addInitScript(INIT_HIDE_DEMO_SCRIPT);
      await page.addInitScript(STUB_PERSIST_SCRIPT);
      await settlePage(page, base, '/', mode.theme);
      await page.evaluate(FILL_EVERY_FEATURE_EXPRESSION);
      await settlePage(page, base, '/health/surgery', mode.theme);
      if (mode.reduced === 'app') await page.evaluate(() => { document.documentElement.dataset.a11yMotion = 'reduce'; });
      await page.waitForTimeout(700);
      const ids = await page.locator('[data-procedure]').evaluateAll((nodes) => nodes.map((node) => node.dataset.procedure));
      assert.equal(ids.length, 2);
      for (const id of ids) await recordClose(page, id, `${mode.theme}-${mode.reduced === 'none' ? 'motion' : `reduce-${mode.reduced}`}-${id}`);
      if (!baseline) {
        await page.evaluate(async (ids) => {
          for (const id of [ids[0], ids[0], ids[0], ids[1], ids[0], ids[1]]) {
            document.querySelector(`[data-procedure="${id}"] .proc-face`).click();
            await new Promise((resolve) => setTimeout(resolve, 35));
          }
        }, ids);
        await page.waitForTimeout(800);
        assert.deepEqual(await page.locator('[data-recovery-log]').evaluateAll((nodes) => nodes.map((node) => node.dataset.recoveryLog)), [ids[1]]);
        assert.equal(await page.locator(`[data-procedure="${ids[0]}"] .proc-face`).getAttribute('aria-expanded'), 'false');
        assert.equal(await page.locator(`[data-procedure="${ids[1]}"] .proc-face`).getAttribute('aria-expanded'), 'true');
        assert.equal(await page.locator('#surgery-notes').inputValue(), 'Double incision, drains out on day 5.');
        assert.equal(await page.locator('[data-procedure-item]').count(), 3);
        assert.equal(await page.locator('[data-recovery-log] [data-consult]').count(), 2);
        assert.match(await page.locator('[data-recovery-log]').textContent(), /Pre-op clearance/);
        await page.locator('#surgery-notes').fill('Unsaved recovery notes');
        await page.locator(`[data-procedure="${ids[0]}"] .proc-face`).press('Enter');
        await page.locator('[data-sheet]').waitFor();
        assert.equal(await page.locator(`[data-procedure="${ids[1]}"] .proc-face`).getAttribute('aria-expanded'), 'true');
        await page.locator('[data-sheet] .btn-primary').click();
        await page.locator('[data-sheet]').waitFor({ state: 'detached' });
        assert.equal(await page.locator('#surgery-notes').inputValue(), 'Unsaved recovery notes');
      }
      assert.deepEqual(errors, []);
      console.log(`PASS procedure collapse ${mode.theme} ${mode.reduced}`);
    } finally { await context.close(); }
  }
} finally {
  await writeFile(`${out}/results.json`, JSON.stringify(results, null, 2));
  await browser.close();
  await app.close();
}
