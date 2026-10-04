import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { preview } from 'vite';
import { launchChromium } from './browser-harness.mjs';
import { startSampling, stopSampling } from './motion-sampling.mjs';

// Run against a demo build. Each browser context owns its disposable journal.
const stage = process.argv[2] ?? 'after';
const output = resolve(process.argv[3] ?? '.claude/review-17');
const source = resolve(process.argv[4] ?? '.');
process.chdir(source);
await mkdir(`${output}/${stage}`, { recursive: true });
const app = await preview({ root: source, preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const browser = await launchChromium();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, timezoneId: 'Europe/Warsaw' });
page.setDefaultTimeout(600_000);
await page.clock.setFixedTime(new Date('2026-10-04T12:00:00Z'));
let seeded = false;
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
const sourceFiles = Object.fromEntries(['src/routes/care/+page.svelte', 'src/routes/care/doses/+page.svelte', 'src/routes/care/changes/+page.svelte', 'src/routes/health/surgery/+page.svelte', 'src/lib/components/NoticedAxis.svelte'].map((file) => [file, createHash('sha256').update(readFileSync(resolve(source, file))).digest('hex')]));
const buildSource = JSON.parse(readFileSync(resolve(source, 'build/release.json'), 'utf8'));
const report = { stage, sourceFiles, buildSource, source: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: source, encoding: 'utf8' }).trim(), shots: [], scenes: [], checks: [] };
const check = (name, passed, details = null) => {
  report.checks.push({ name, passed, details });
  console.log(`${passed ? 'PASS' : 'FAIL'} ${name}`);
};

async function go(path) {
  await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]');
  await page.waitForTimeout(700);
  if (seeded) await page.evaluate(() => {
    document.querySelector('.demo-bar')?.remove();
    document.body.classList.remove('has-demo-bar');
  });
}

async function crop(name, selector, height = 430) {
  await page.setViewportSize({ width: 390, height: 1200 });
  const item = page.locator(selector).first();
  await item.evaluate((node) => node.scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(600);
  const box = await item.boundingBox();
  const y = Math.max(0, Math.min(box.y, 1200 - height));
  const file = `${stage}/${name}.png`;
  await page.screenshot({ path: `${output}/${file}`, clip: { x: 0, y, width: 390, height },
    style: '[data-toast], [data-app-nav] { visibility: hidden !important; }' });
  report.shots.push({ name, file, viewport: { width: 390, height: 1200 }, crop: { x: 0, y, width: 390, height } });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(600);
}

const readMotion = `
  const rows = [...document.querySelectorAll('[data-dose-row], [data-procedure-card]')];
  return { scroll: document.querySelector('[data-app-scroll-region]')?.scrollTop,
    rows: rows.map((node) => {
      if (!node.__ticket17Stamp) { window.__ticket17StampCounter = (window.__ticket17StampCounter ?? 0) + 1; node.__ticket17Stamp = window.__ticket17StampCounter; }
      const box = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return { id: node.dataset.doseRow ?? node.dataset.procedureCard, stamp: node.__ticket17Stamp,
        x: box.x, y: box.y, h: box.height, opacity: Number(style.opacity),
        transform: style.transform, clip: style.clipPath, wrapper: (() => { const wrap = node.closest('[data-procedure-group]') ?? node; const box = wrap.getBoundingClientRect(); const style = getComputedStyle(wrap); return { y: box.y, h: box.height, transform: style.transform, clip: style.clipPath }; })() };
    }),
    headings: [...document.querySelectorAll('[data-procedure-group] h2, [data-dose-day]')].map((node) => {
      const box = node.getBoundingClientRect();
      return { text: node.textContent, y: box.y, h: box.height };
    }) };
`;

async function scene(name, action) {
  const directory = `${stage}/${name}`;
  await mkdir(`${output}/${directory}`, { recursive: true });
  const cdp = await page.context().newCDPSession(page);
  const frames = [];
  const pending = [];
  const t0 = performance.now();
  cdp.on('Page.screencastFrame', (event) => {
    const file = `${directory}/${String(frames.length).padStart(3, '0')}.png`;
    frames.push({ file, t: Math.round(performance.now() - t0) });
    pending.push(writeFile(`${output}/${file}`, Buffer.from(event.data, 'base64')));
    void cdp.send('Page.screencastFrameAck', { sessionId: event.sessionId });
  });
  await page.evaluate(() => document.querySelectorAll('[data-toast]').forEach((node) => node.remove()));
  await startSampling(page, readMotion);
  await cdp.send('Page.startScreencast', { format: 'png', everyNthFrame: 1 });
  await page.waitForTimeout(100);
  await action();
  await page.waitForTimeout(800);
  await cdp.send('Page.stopScreencast');
  const samples = await stopSampling(page);
  await Promise.all(pending);
  await cdp.detach();
  for (const frame of frames) execFileSync('magick', [`${output}/${frame.file}`, '-crop', '390x650+0+100', '+repage', `${output}/${frame.file}`]);
  report.scenes.push({ name, frames, samples });
}

function proveMotion(scene) {
  const initialIds = new Set(scene.samples[0]?.rows.map((row) => row.id) ?? []);
  const ids = new Set(scene.samples.flatMap((frame) => frame.rows.map((row) => row.id)));
  const metrics = [];
  for (const id of ids) {
    const sequence = scene.samples.flatMap((frame) => frame.rows.filter((row) => row.id === id)
      .map((row) => ({ ...row, t: frame.t, y: row.y + (frame.scroll ?? 0) })));
    const first = sequence[0];
    const last = sequence.at(-1);
    const identity = new Set(sequence.map((row) => row.stamp)).size === 1;
    if (scene.name.startsWith('surgery')) {
      const distance = Math.abs(last.y - first.y);
      const middles = sequence.filter((row) => Math.abs(row.y - first.y) > 1 && Math.abs(row.y - last.y) > 1).length;
      const step = Math.max(...sequence.slice(1).map((row, index) => Math.abs(row.y - sequence[index].y)));
      metrics.push({ id, identity, presentEveryFrame: sequence.length === scene.samples.length, distance, middles, maxStep: step });
    } else if (!initialIds.has(id)) {
      const middles = sequence.filter((row) => row.h > 1 && row.h < last.h - 1).length;
      metrics.push({ id, identity, firstHeight: first.h, finalHeight: last.h, middles });
    }
  }
  scene.metrics = metrics;
  if (scene.name.startsWith('surgery')) {
    check(`${scene.name}: record identity persists every frame`, metrics.every((row) => row.identity && row.presentEveryFrame), metrics);
    const moving = metrics.filter((row) => row.distance > 20);
    check(`${scene.name}: regroup travels through intermediate positions`, moving.length > 0 && moving.every((row) => row.middles >= 3 && row.maxStep / row.distance < 0.6), moving);
  } else {
    check(`${scene.name}: new rows disclose through intermediate heights`, metrics.length > 0 && metrics.every((row) => row.identity && row.middles >= 3 && row.firstHeight < row.finalHeight * 0.8), metrics);
  }
}

try {
  await go('/');
  if (await page.locator('[data-leave-setup]').count()) {
    await page.locator('[data-leave-setup]').click();
    await page.waitForSelector('[data-home-hello]');
  }
  await page.locator('[data-fill-every-feature]').click();
  await page.waitForURL('**/more');
  await page.waitForSelector('[data-app-root][data-boot="ready"]');
  seeded = true;
  for (const theme of ['light', 'dark']) {
    await go('/settings');
    await page.locator('[data-palette-pick="trans"]').click();
    await page.locator(`[data-segment="${theme}"]`).first().click();
    await page.waitForFunction((wanted) => document.documentElement.dataset.theme === wanted, theme);

    await go('/health/surgery');
    await crop(`surgery-${theme}`, '[data-section-heading]', 620);
    if (stage === 'after') check(`no Archived procedure under Ongoing (${theme})`, await page.locator('[data-procedure-group="ongoing"] [data-phase="archived"]').count() === 0);
    const procedure = page.locator('[data-procedure-card]').filter({ hasText: 'facial feminization surgery' }).first();
    const procedureId = await procedure.getAttribute('data-procedure-card');
    await page.locator(`[data-edit-procedure="${procedureId}"]`).click();
    await page.getByRole('switch', { name: 'Keep in archive' }).click();
    await scene(`surgery-regroup-${theme}`, () => page.locator('[data-save-procedure]').click());
    await page.locator(`[data-edit-procedure="${procedureId}"]`).click();
    await page.getByRole('switch', { name: 'Keep in archive' }).click();
    await page.locator('[data-save-procedure]').click();
    await page.waitForSelector('[data-sheet]', { state: 'detached' });

    await go('/care/doses');
    await crop(`doses-${theme}`, '[data-batched-list="doses"]', 580);
    const count = await page.locator('[data-dose]').count();
    if (stage === 'after') {
      check(`initial dose batch contains 30 (${theme})`, count === 30, count);
      check(`local-day headings present (${theme})`, await page.locator('[data-dose-day]').count() > 0);
      const titles = await page.locator('[data-dose] .kit-row-title').evaluateAll((nodes) => nodes.map((node) => ({ text: node.textContent, h: node.getBoundingClientRect().height, line: parseFloat(getComputedStyle(node).lineHeight) })));
      check(`dose titles fit one line at 390px (${theme})`, titles.every((title) => title.h <= title.line + 1), titles.filter((title) => title.h > title.line + 1));
      check(`dose rows do not repeat same-drug attribution (${theme})`, !(await page.locator('[data-dose]').allTextContents()).some((text) => /under (Estradiol|Sertraline|Progesterone)/i.test(text)));
    }
    await scene(`dose-more-${theme}`, () => page.locator('[data-batched-more="doses"]').evaluate((button) => {
      button.scrollIntoView({ block: 'center' });
      button.click();
    }));
    if (stage === 'after') check(`Show more adds one batch (${theme})`, await page.locator('[data-dose]').count() === count + 30);

    await go('/care/changes');
    await crop(`changes-${theme}`, '[data-noticed-axis]', 440);
    if (stage === 'after') {
      check(`collapsed chart has no bands sentence (${theme})`, await page.locator('[data-bands-context]').count() === 0);
      const styles = await page.locator('.na-legend-swatch[data-kind="side-effect"]').evaluateAll((nodes) => nodes.map((node) => ({ background: getComputedStyle(node).backgroundColor, shadow: getComputedStyle(node).boxShadow })));
      check(`side-effect legend uses rings (${theme})`, styles.length > 0 && styles.every((style) => style.shadow !== 'none'), styles);
    }
    const bandGroup = page.locator('[data-effect-group]').first();
    await bandGroup.locator('button[aria-expanded]').first().click();
    await page.waitForTimeout(700);
    await crop(`changes-bands-${theme}`, '[data-effect-group]', 440);

    await go('/care');
    await crop(`care-charts-${theme}`, '[data-chart-card="interval-mood"]', 800);
    if (stage === 'after') {
      check(`both Care charts captioned (${theme})`, await page.locator('[data-care-fold] figcaption').count() === 2);
      const gap = await page.locator('[data-care-fold]').evaluateAll((nodes) => nodes[1].getBoundingClientRect().top - nodes[0].getBoundingClientRect().bottom);
      check(`Care charts separated (${theme})`, gap >= 23, gap);
    }
  }
  if (stage === 'after') {
    await go('/care/doses');
    while (await page.locator('[data-batched-more="doses"]').count()) {
      await page.locator('[data-batched-more="doses"]').evaluate((button) => button.click());
      await page.waitForTimeout(350);
    }
    const linkedId = await page.locator('[data-dose]').last().getAttribute('data-dose');
    await go(`/care/doses#${linkedId}`);
    check('old dose deep link remains mounted after hash clears', await page.locator(`[data-dose="${linkedId}"]`).count() === 1);
  }
  if (stage === 'after') {
    for (const [route, selector] of [['/care/doses', '[data-dose-log]'], ['/care', '[data-chart-card="interval-mood"]']]) {
      await go(route);
      await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
      await page.waitForTimeout(500);
      const layout = await page.locator(selector).evaluate((node) => ({ width: node.clientWidth, content: node.scrollWidth }));
      check(`${route}: changed surface fits at 200% text`, layout.content <= layout.width + 1, layout);
      await page.evaluate(() => { document.documentElement.style.removeProperty('font-size'); });
    }
  }
  if (stage === 'after') report.scenes.forEach(proveMotion);
  check('no uncaught page errors', errors.length === 0, errors);
} finally {
  await writeFile(`${output}/${stage}/report.json`, JSON.stringify(report, null, 2));
  await browser.close();
  await new Promise((done) => app.httpServer.close(done));
}
if (report.checks.some((result) => !result.passed)) process.exitCode = 1;
