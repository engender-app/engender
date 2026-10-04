import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { preview } from 'vite';
import { launchChromium } from './browser-harness.mjs';

const tag = process.argv.includes('--before') ? 'before' : 'after';
const out = resolve('.claude/review-31');
await mkdir(out, { recursive: true });
const original = execFileSync('unzip', ['-p', 'docs/accessibility-audit-2026-09-30/audit-evidence.zip', 'scripts/run.mjs'], { encoding: 'utf8' });
const auditFunctions = original.slice(original.indexOf('async function load('), original.indexOf('\ntry {'));
const axe = await readFile(process.env.AXE_PATH ?? `${out}/axe-4.10.3.min.js`, 'utf8');
const server = await preview({ preview: { port: 0 } });
const browser = await launchChromium();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
const base = `http://localhost:${server.httpServer.address().port}`;
const report = { platform: 'web', tag, source: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), axe: '4.10.3', scans: [], keyboard: [], screenshots: [], motion: [], errors: [] };
page.on('pageerror', e => report.errors.push(e.message));
const save = () => writeFile(`${out}/${tag}.json`, JSON.stringify(report, null, 2));
// Use the audit's load and scan functions unchanged; only their route roster is bounded to this ticket.
const { load, scan } = new Function('page', 'axe', 'base', 'android', 'report', 'save', 'out', `${auditFunctions}; return {load, scan};`)(page, axe, base, false, report, save, out);
let failures = 0;
function check(pass, message) {
  console.log(`${pass ? 'PASS' : 'FAIL'} ${message}`);
  if (!pass) failures++;
}
async function shot(selector, name) {
  const file = `${tag}-${name}.png`;
  await page.locator(selector).screenshot({ path: `${out}/${file}` });
  report.screenshots.push(file);
}
try {
  await load('/');
  if (!(await page.locator('.demo-bar').count())) throw new Error('Isolated demo build required');
  await page.evaluate(() => document.querySelector('[data-fill-every-feature]').click());
  await page.waitForURL('**/more', { timeout: 240000 });
  await page.waitForSelector('[data-demo-busy]', { state: 'detached', timeout: 240000 });
  for (const width of [320, 390]) for (const theme of ['light', 'dark']) {
    await page.setViewportSize({ width, height: 844 });
    await load('/health/clinician-summary', theme);
    await page.waitForSelector('[data-clinician-dossier]');
    await scan(`clinician summary ${width}px ${theme}`);
    const violations = report.scans.at(-1).violations.filter(v => v.id === 'scrollable-region-focusable');
    check(violations.length === 0, `${width}px ${theme}: no scrollable-region-focusable`);
    await shot('.settings-row-wrap', `${width}-${theme}-settings`);
    await shot('[data-app-savebar]', `${width}-${theme}-print`);
    const tables = page.locator('.dossier-table-wrap');
    check(await tables.count() >= 6, `${width}px ${theme}: table fixture covers audit`);
    for (let i = 0; i < await tables.count(); i++) {
      const table = tables.nth(i);
      await table.scrollIntoViewIfNeeded();
      await shot(`.dossier-table-wrap >> nth=${i}`, `${width}-${theme}-table-${i}`);
      const geometry = await table.evaluate(e => ({ width: e.clientWidth, total: e.scrollWidth }));
      if (geometry.total <= geometry.width + 1) continue;
      const reachable = await table.evaluate(e => e.tabIndex === 0 && e.getAttribute('role') === 'region' && !!e.getAttribute('aria-label'));
      const result = { width, theme, table: i, reachable, geometry };
      if (reachable) {
        await page.locator('[data-summary-print]').focus();
        let tabbed = false;
        for (let t = 0; t < 100; t++) {
          await page.keyboard.press('Tab');
          if (await table.evaluate(e => e === document.activeElement)) { tabbed = true; break; }
        }
        result.tabbed = tabbed;
        for (let n = 0; tabbed && n < 100; n++) {
          await page.keyboard.press('ArrowRight');
          await page.waitForTimeout(12);
          if (await table.evaluate(e => e.scrollLeft >= e.scrollWidth - e.clientWidth - 1)) break;
        }
        result.lastColumn = await table.evaluate(e => e.scrollLeft >= e.scrollWidth - e.clientWidth - 1);
        await shot(`.dossier-table-wrap >> nth=${i}`, `${width}-${theme}-table-${i}-end`);
        await table.evaluate(e => e.scrollLeft = 0);
      }
      report.keyboard.push(result);
      check(reachable && result.tabbed && result.lastColumn, `${width}px ${theme}: table ${i} reaches last column by keyboard`);
    }
    // Sample the native table scroll each frame. Only horizontal movement is intended.
    const first = tables.first();
    await first.scrollIntoViewIfNeeded();
    await first.evaluate(e => e.scrollLeft = 0);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await first.evaluate(e => {
      window.__dossierFrames = [];
      const started = performance.now();
      function frame(now) {
        const r = e.getBoundingClientRect();
        window.__dossierFrames.push({ ms: now - started, left: r.left, top: r.top, width: r.width, height: r.height, scrollLeft: e.scrollLeft });
        if (now - started < 400) requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
      e.scrollTo({ left: 120, behavior: 'smooth' });
    });
    const frames = [];
    for (let f = 0; f < 8; f++) {
      const file = `${tag}-${width}-${theme}-motion-${f}.png`;
      await first.screenshot({ path: `${out}/${file}` });
      frames.push({ file, samples: await page.evaluate(() => window.__dossierFrames.slice(-1)[0]) });
      await page.waitForTimeout(40);
    }
    const measurements = await page.evaluate(() => window.__dossierFrames);
    const noYank = ['top', 'left', 'width', 'height'].every(key => measurements.every(f => Math.abs(f[key] - measurements[0][key]) < 1));
    report.motion.push({ width, theme, frames, measurements, noYank });
    check(noYank, `${width}px ${theme}: table bounds stay fixed during scroll`);
    await page.emulateMedia({ reducedMotion: 'reduce' });
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await load('/health/clinician-summary');
  await page.waitForSelector('[data-clinician-dossier]');
  await page.pdf({ path: `${out}/${tag}-print.pdf`, format: 'A4', printBackground: true });
  report.printText = await page.locator('[data-clinician-dossier]').innerText();
  check(report.errors.length === 0, 'no page errors');
} finally {
  await save();
  await browser.close();
  await new Promise(r => server.httpServer.close(r));
}
process.exitCode = failures ? 1 : 0;
