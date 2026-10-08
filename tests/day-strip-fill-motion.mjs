import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { launchChromium, previewBuild, screencast, settlePage } from './browser-harness.mjs';
import { FILL_EVERY_FEATURE_EXPRESSION, INIT_HIDE_DEMO_SCRIPT, saveSceneCast } from './yank-sweep-core.mjs';
import { PALETTES } from './palettes.mjs';

const args = process.argv.slice(2);
const outIndex = args.indexOf('--out');
const out = resolve(outIndex >= 0 ? args[outIndex + 1] : '.claude/day-strip-fill-motion');
await mkdir(out, { recursive: true });
const app = await previewBuild(process.cwd());
const browser = await launchChromium();
const failures = [];
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on('pageerror', error => errors.push(String(error)));
  await page.addInitScript(INIT_HIDE_DEMO_SCRIPT);
  const base = `http://localhost:${app.httpServer.address().port}`;
  await settlePage(page, base, '/', 'light');
  await page.evaluate(FILL_EVERY_FEATURE_EXPRESSION);
  await page.waitForTimeout(1500);
  for (const theme of ['light', 'dark']) {
    for (const route of ['/body/wear', '/health/cycle-events', '/body/hair-removal', '/health/dilation']) {
      await settlePage(page, base, route, theme);
      await page.locator('[data-strip-earlier]').waitFor();
      await page.waitForTimeout(1400);
      for (const direction of ['earlier', 'later']) {
        const { samples, cast } = await screencast(page, async cast => {
          const samples = await page.evaluate(async direction => {
            const nodes = [...document.querySelectorAll('.day-strip .kit-strip-cell')];
            const read = () => nodes.map(node => {
              const style = getComputedStyle(node);
              const rect = node.getBoundingClientRect();
              return { key: node.dataset.weekCell, blank: node.hasAttribute('data-blank'), color: style.backgroundColor,
                background: style.background, x: rect.x, y: rect.y, width: rect.width, height: rect.height,
                connected: node.isConnected, label: node.parentElement.getAttribute('aria-label') };
            });
            const start = performance.now();
            const samples = [{ frame: 0, ms: 0, cells: read() }];
            document.querySelector(`[data-strip-${direction}]`).click();
            await new Promise(resolve => {
              const tick = () => {
                samples.push({ frame: samples.length, ms: performance.now() - start, cells: read() });
                if (performance.now() - start < 350) requestAnimationFrame(tick);
                else resolve();
              };
              requestAnimationFrame(tick);
            });
            return samples;
          }, direction);
          return { samples, cast };
        });
        const surface = route.split('/').pop();
        await saveSceneCast(cast, out, `${surface}-week-${direction}`, `persona-${theme}-p1`);
        await writeFile(`${out}/${surface}-${theme}-${direction}.json`, JSON.stringify(samples, null, 2));
        const initial = samples[0].cells;
        const final = samples.at(-1).cells;
        assert.equal(initial.length, 7);
        assert.deepEqual(final.map(cell => Number(cell.key)), initial.map(cell => Number(cell.key) + (direction === 'earlier' ? -7 : 7)));
        assert.ok(samples.every(sample => sample.cells.every((cell, index) => cell.connected && cell.label && cell.x === initial[index].x && cell.y === initial[index].y && cell.width === initial[index].width && cell.height === initial[index].height)));
        const changed = initial.map((cell, index) => ({ cell, index })).filter(({ cell, index }) => cell.color !== final[index].color);
        if (surface === 'wear' || surface === 'cycle-events') assert.ok(changed.length > 0, `${surface}/${theme}: fixture has no fill change`);
        const cuts = changed.filter(({ cell, index }) => !samples.slice(1, -1).some(sample => sample.cells[index].color !== cell.color && sample.cells[index].color !== final[index].color));
        console.log(surface, theme, direction, JSON.stringify({ frames: samples.length, changed: changed.length, cuts: cuts.map(cell => cell.index) }));
        if (cuts.length) failures.push(`${surface}/${theme}/${direction}: cell fills cut in columns ${cuts.map(cell => cell.index).join(',')}`);
      }
    }
  }
  const endpoints = [];
  for (const theme of ['light', 'dark']) {
    await settlePage(page, base, '/body/wear', theme);
    await page.locator('[data-strip-earlier]').waitFor();
    for (const palette of PALETTES) {
      await page.evaluate(palette => { document.documentElement.dataset.palette = palette; }, palette);
      await page.waitForTimeout(350);
      const result = await page.evaluate(async () => {
        const read = () => [...document.querySelectorAll('.day-strip .kit-strip-cell')].map(node => getComputedStyle(node).background);
        document.querySelector('[data-strip-earlier]').click();
        await new Promise(resolve => setTimeout(resolve, 350));
        const animated = read();
        document.documentElement.dataset.a11yMotion = 'reduce';
        document.querySelector('[data-strip-later]').click();
        await new Promise(resolve => setTimeout(resolve, 30));
        document.querySelector('[data-strip-earlier]').click();
        await new Promise(resolve => setTimeout(resolve, 30));
        const reduced = read();
        document.querySelector('[data-strip-later]').click();
        await new Promise(resolve => setTimeout(resolve, 30));
        delete document.documentElement.dataset.a11yMotion;
        return { animated, reduced };
      });
      assert.deepEqual(result.animated, result.reduced, `${palette}/${theme}: reduced-motion endpoint differs`);
      endpoints.push({ palette, theme, ...result });
      await page.locator('.day-strip').screenshot({ path: `${out}/wear-${palette}-${theme}.png` });
    }
  }
  await writeFile(`${out}/palette-endpoints.json`, JSON.stringify(endpoints, null, 2));
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  app.httpServer.close();
}
if (failures.length) throw new Error(failures.join('\n'));
