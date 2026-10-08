import { createServer } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { decodePng } from './png-decode.mjs';
import { launchChromium } from './browser-harness.mjs';
const matrix = process.argv.includes('--matrix');
const painted = process.argv.includes('--paint');
const out = resolve(process.argv[2] ?? '.claude/transition-summary-probe');
await mkdir(out, { recursive: true });
const server = await createServer({ configFile: resolve('tests/browser-tier/browser-tier.vite.config.ts'), server: { port: 0 } });
await server.listen();
const browser = await launchChromium();
let failed = false;
try {
  for (const width of matrix ? [230, 430, 1024] : [430]) for (const grow of matrix ? [false, true] : [false]) for (const theme of ['light', 'dark']) for (const reducedMotion of ['no-preference', 'reduce']) {
    const prefix = `${width}-${grow ? 'grow' : 'shrink'}-${theme}-${reducedMotion}`;
    const page = await browser.newPage({ viewport: { width, height: 700 }, reducedMotion });
    await page.goto(`http://localhost:${server.config.server.port}/transition-summary.html?motion=${reducedMotion === 'reduce' ? 'reduce' : 'full'}${grow ? '&grow' : ''}`);
    await page.waitForSelector('[data-list-row="care"]');
    await page.evaluate((theme) => document.documentElement.dataset.theme = theme, theme);
    if (painted) await page.addStyleTag({ content: '[data-list-row="care"] [data-leaving] { color: rgb(255,0,0) !important; } [data-list-row="surgery"] [data-row-title] { color: rgb(0,0,255) !important; }' });
    await page.waitForTimeout(200);
    await page.locator('[data-list-row="care"]').focus();
    const keyboard = await page.locator('[data-list-row="care"]').evaluate(n => document.activeElement === n && n.getAttribute('href') === '/care');
    await page.evaluate(() => {
      window.samples = [];
      const start = performance.now();
      const sample = () => {
        const care = document.querySelector('[data-list-row="care"]');
        const next = document.querySelector('[data-list-row="surgery"]');
        const bounds = care.getBoundingClientRect();
        const title = next.querySelector('[data-row-title]').getBoundingClientRect();
        const lines = [...care.querySelectorAll('.kit-row-sub')].map(n => {
          const b = n.getBoundingClientRect();
          const text = document.createRange(); text.selectNodeContents(n);
          const ink = text.getBoundingClientRect();
          const clip = n.closest('.kit-row-text');
          const clipped = getComputedStyle(clip).overflow !== 'visible' && clip.contains(n.offsetParent);
          const visibleBottom = clipped ? Math.min(ink.bottom, clip.getBoundingClientRect().bottom) : ink.bottom;
          return { text: n.textContent, top: b.top, bottom: b.bottom, visibleBottom, opacity: getComputedStyle(n).opacity, overlap: Number(getComputedStyle(n).opacity) > .05 && visibleBottom > title.top && ink.top < title.bottom };
        });
        window.samples.push({ frame: window.samples.length, ms: performance.now() - start, rowBottom: bounds.bottom, nextTop: title.top, lines, heightAnimations: document.getAnimations().filter(a => a.effect?.getKeyframes().some(f => 'height' in f)).length });
        if (performance.now() - start < 600) requestAnimationFrame(sample);
      }; requestAnimationFrame(sample);
    });
    await page.click('[data-load]');
    const paintedFrames = [];
    for (let frame = 0; frame < 14; frame++) {
      const ms = await page.evaluate(() => window.samples.at(-1)?.ms ?? 0);
      const png = await page.screenshot({ path: `${out}/${prefix}-${String(frame).padStart(3, '0')}-${Math.round(ms)}ms.png` });
      if (painted) {
        const decoded = decodePng(png);
        let blueTop = decoded.height, blueBottom = -1;
        for (let y = 0; y < decoded.height; y++) for (let x = 0; x < decoded.width; x++) {
          const at = (y * decoded.width + x) * decoded.channels;
          const [r, g, b] = decoded.pixels.subarray(at, at + 3);
          if (b > r + 80 && b > g + 80) { blueTop = Math.min(blueTop, y); blueBottom = Math.max(blueBottom, y); }
        }
        if (blueBottom < 0) throw new Error('Painted Surgery title missing');
        let redPixels = 0;
        for (let y = blueTop; y <= blueBottom; y++) for (let x = 0; x < decoded.width; x++) {
          const at = (y * decoded.width + x) * decoded.channels;
          const [r, g, b] = decoded.pixels.subarray(at, at + 3);
          if (r > g + 15 && r > b + 15) redPixels++;
        }
        paintedFrames.push({ frame, ms, redPixels });
      }
    }
    await page.waitForTimeout(650);
    const samples = await page.evaluate(() => window.samples);
    const overlaps = samples.filter(s => s.lines.some(l => l.overlap));
    const appMotion = await page.evaluate(() => document.documentElement.dataset.a11yMotion);
    const reducedPath = reducedMotion !== 'reduce' || (appMotion === 'reduce' && samples.every(s => s.heightAnimations === 0));
    const result = { appMotion, reducedPath, theme, reducedMotion, keyboard, overlaps, paintedFrames, samples };
    await writeFile(`${out}/${prefix}.json`, JSON.stringify(result, null, 2));
    console.log(`${prefix}: ${overlaps.length} geometry collisions; ${paintedFrames.filter(f => f.redPixels > 0).length} painted collisions; keyboard=${keyboard}; motion=${appMotion}; reducedPath=${reducedPath}`);
    failed ||= overlaps.length > 0 || paintedFrames.some(f => f.redPixels > 0) || !keyboard || !reducedPath;
    await page.close();
  }
} finally { await browser.close(); await server.close(); }
process.exitCode = failed ? 1 : 0;
