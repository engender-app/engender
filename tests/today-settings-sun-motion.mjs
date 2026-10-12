/* Painted Today/Settings handovers, including interruption and replacement by
   the lock gate. Run against a demo build; --baseline records without assertions. */
import { preview } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { launchChromium, settlePage } from './browser-harness.mjs';
import { startSampling, stopSampling } from './motion-sampling.mjs';
import { PALETTES } from './palettes.mjs';

const out = resolve(process.argv[2] ?? '.claude/today-settings-sun');
const baseline = process.argv.includes('--baseline');
const gateOnly = process.argv.includes('--gate-only');
await mkdir(out, { recursive: true });
const server = await preview({ preview: { port: 0 } });
const base = `http://localhost:${server.httpServer.address().port}`;
const browser = await launchChromium();
const report = { baseline, scenes: [], palettes: [], errors: [] };
const navigate = (page, path) => page.evaluate((href) => {
  const link = document.createElement('a');
  link.href = href;
  document.body.append(link);
  link.click();
  link.remove();
}, path);
const read = `
  const sun = document.querySelector('[data-flag-sun]');
  const field = document.querySelector('[data-home-field], [data-screen-field]');
  const box = field?.getBoundingClientRect();
  const rings = [...(sun?.children ?? [])];
  const animations = document.getAnimations().map(a => a.effect?.pseudoElement).filter(Boolean);
  return {
    route: location.pathname, nav: document.documentElement.dataset.nav ?? null,
    suns: document.querySelectorAll('[data-flag-sun]').length,
    field: box ? { x: box.x, y: box.y, right: box.right, bottom: box.bottom, height: box.height } : null,
    rings: rings.map(r => { const b = r.getBoundingClientRect(); return {
      name: r.style.viewTransitionName, group: r.style.getPropertyValue('view-transition-group'),
      clip: getComputedStyle(r).clipPath, x: b.x, y: b.y, right: b.right, bottom: b.bottom
    }; }),
    animations,
    staleNames: [...document.querySelectorAll('[style]')].filter(n => n.style.viewTransitionName).length,
    gate: !!document.querySelector('[data-applock]'),
    journal: !!document.querySelector('[data-home-hello], [data-home-field], [data-list-row="security"]')
  };`;

async function record(page, name, act) {
  const frames = [];
  const cdp = await page.context().newCDPSession(page);
  cdp.on('Page.screencastFrame', e => {
    frames.push({ data: e.data, at: e.metadata.timestamp * 1000 });
    void cdp.send('Page.screencastFrameAck', { sessionId: e.sessionId });
  });
  await cdp.send('Page.enable');
  await cdp.send('Page.startScreencast', { format: 'png', everyNthFrame: 1 });
  await startSampling(page, read);
  await page.waitForTimeout(50);
  await act();
  await page.waitForTimeout(1400);
  await cdp.send('Page.stopScreencast');
  const samples = await stopSampling(page);
  await cdp.detach();
  const dir = resolve(out, name);
  await mkdir(dir, { recursive: true });
  const painted = !name.includes('disguise') && !name.includes('gate') && !name.includes('away')
    ? await page.evaluate(async ({ images, corner, scale }) => {
      let initial;
      let worst = 0;
      for (const png of images) {
        const image = new Image();
        image.src = `data:image/png;base64,${png}`;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(image, 0, 0);
        const pixels = ctx.getImageData(0, 0, image.width, image.height).data;
        const ray = [];
        for (let angle = 20; angle <= 70; angle += 5) {
          for (const radius of [17.5, 52.5, 87.5, 122.5, 157.5]) {
            const radians = angle * Math.PI / 180;
            const x = Math.round(corner.right - Math.cos(radians) * radius * scale);
            const y = Math.round(corner.y + Math.sin(radians) * radius * scale);
            const offset = (y * image.width + x) * 4;
            ray.push([pixels[offset], pixels[offset + 1], pixels[offset + 2]]);
          }
        }
        initial ??= ray;
        const changed = ray.filter((rgb, i) => rgb.some((channel, c) => Math.abs(channel - initial[i][c]) > 35)).length;
        worst = Math.max(worst, changed / ray.length);
      }
      return { maximumChangedFraction: worst };
    }, {
      images: frames.map(f => f.data),
      corner: samples[0].field,
      scale: page.viewportSize().width < 240 ? 0.6 : page.viewportSize().width < 360 ? 0.82 : 1
    }) : null;
  const first = frames[0]?.at ?? 0;
  for (let i = 0; i < frames.length; i++) {
    const file = `${String(i).padStart(3, '0')}.png`;
    await writeFile(resolve(dir, file), Buffer.from(frames[i].data, 'base64'));
    frames[i] = { file, t: Math.round(frames[i].at - first) };
  }
  const scene = { name, frames, samples, painted };
  report.scenes.push(scene);
  await writeFile(resolve(dir, 'frames.json'), JSON.stringify(scene, null, 2));
  assert.ok(frames.length > 3, `${name}: too few painted frames`);
  if (!baseline) {
    const settled = samples.at(-1);
    if (painted) assert.ok(painted.maximumChangedFraction < 0.05, `${name}: sun changes ${painted.maximumChangedFraction} of painted rays`);
    assert.equal(settled.staleNames, 0, `${name}: stale snapshot names`);
    assert.equal(settled.nav, null, `${name}: stale navigation state`);
    if (!name.includes('disguise') && !name.includes('gate') && !name.includes('away')) {
      assert.equal(settled.suns, 1, `${name}: settled sun count`);
      assert.ok(settled.rings[0].bottom <= settled.field.bottom + 1, `${name}: resting curtain clips sun`);
      const shared = samples.filter(s => s.rings.some(r => r.name.startsWith('sun-shared-')));
      if (!name.includes('reduced') && !name.includes('interrupted')) {
        assert.ok(shared.length > 2, `${name}: shared handover never painted`);
        assert.ok(shared.every(s => s.rings.every(r => r.group === 'normal')), `${name}: curtain owns shared sun`);
      }
    }
    if (name.includes('disguise') || name.includes('gate') || name.includes('away')) assert.equal(settled.suns, 0, `${name}: stale decoration survives`);
    if (name.includes('gate')) assert.equal(settled.journal, false, `${name}: journal survives gate replacement`);
  }
  console.log(`${name}: ${frames.length} painted frames`);
}

try {
  for (const width of gateOnly ? [] : [195, 390, 1280]) {
    for (const theme of ['light', 'dark']) {
      const context = await browser.newContext({ viewport: { width, height: 844 }, reducedMotion: 'no-preference' });
      const page = await context.newPage();
      page.on('pageerror', e => report.errors.push(e.message));
      await settlePage(page, base, '/', theme);
      await page.waitForTimeout(1500);
      await record(page, `${width}-${theme}-today-settings`, () => navigate(page, '/settings'));
      await record(page, `${width}-${theme}-settings-today`, () => navigate(page, '/'));
      if (width === 390 && !baseline) {
        await record(page, `${width}-${theme}-interrupted`, async () => {
          await navigate(page, '/settings');
          await page.waitForTimeout(90);
          await navigate(page, '/');
          await page.waitForTimeout(90);
          await navigate(page, '/settings');
        });
      }
      if (width === 390 && !baseline) {
        await record(page, `${width}-${theme}-interrupted-away`, async () => {
          await navigate(page, '/');
          await page.waitForTimeout(90);
          await navigate(page, '/calendar');
        });
        await navigate(page, '/settings');
        await page.waitForTimeout(700);
        for (const palette of PALETTES) {
          await page.locator(`[data-palette-pick="${palette}"]`).click();
          await page.waitForTimeout(450);
          await page.evaluate(() => document.querySelector('[data-app-scroll-region]').scrollTo(0, 0));
          const geometry = await page.evaluate(new Function(read));
          assert.equal(geometry.suns, 1, `${palette}-${theme}: sun count`);
          assert.ok(geometry.rings[0].bottom <= geometry.field.bottom + 1, `${palette}-${theme}: clipped sun`);
          report.palettes.push({ palette, theme, geometry });
          await page.screenshot({ path: resolve(out, `${palette}-${theme}.png`) });
        }
      }
      if (!baseline) {
        await navigate(page, '/settings');
        await page.waitForTimeout(700);
        await page.locator('[data-list-row="disguise"]').click();
        await page.getByRole('dialog').getByRole('switch').click();
        await page.keyboard.press('Escape');
        await page.waitForTimeout(500);
        await record(page, `${width}-${theme}-disguise-settings-today`, () => navigate(page, '/'));
        await record(page, `${width}-${theme}-disguise-today-settings`, () => navigate(page, '/settings'));
      }
      await context.close();
    }
  }
  if (!baseline && !gateOnly) {
    for (const width of [195, 390, 1280]) for (const theme of ['light', 'dark']) {
      const context = await browser.newContext({ viewport: { width, height: 844 }, reducedMotion: 'reduce' });
      const page = await context.newPage();
      page.on('pageerror', e => report.errors.push(e.message));
      await settlePage(page, base, '/', theme);
      await record(page, `${width}-${theme}-reduced-today-settings`, () => navigate(page, '/settings'));
      await record(page, `${width}-${theme}-reduced-settings-today`, () => navigate(page, '/'));
      await navigate(page, '/settings');
      await page.waitForTimeout(800);
      await page.locator('[data-list-row="disguise"]').click();
      await page.getByRole('dialog').getByRole('switch').click();
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
      await record(page, `${width}-${theme}-reduced-disguise-settings-today`, () => navigate(page, '/'));
      await record(page, `${width}-${theme}-reduced-disguise-today-settings`, () => navigate(page, '/settings'));
      await context.close();
    }
  }
  for (const theme of ['light', 'dark']) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'no-preference' });
    const page = await context.newPage();
    page.on('pageerror', e => report.errors.push(e.message));
    await settlePage(page, base, '/settings/access-mode', theme);
    await page.locator('[data-lock-after-choice="immediately"]').click();
    await navigate(page, '/');
    await page.waitForTimeout(1500);
    await record(page, `390-${theme}-gate`, async () => {
      await navigate(page, '/settings');
      await page.waitForTimeout(100);
      await page.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
        document.dispatchEvent(new Event('visibilitychange'));
        delete document.visibilityState;
      });
      await page.waitForSelector('[data-applock]');
    });
    await context.close();
  }
  assert.deepEqual(report.errors, [], 'uncaught page errors');
} finally {
  await writeFile(resolve(out, 'report.json'), JSON.stringify(report, null, 2));
  await browser.close();
  await server.close();
}
