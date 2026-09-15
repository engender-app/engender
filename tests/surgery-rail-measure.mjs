/* What the surgery cards measure at rest (phase 10 redesign ticket 52):
   every touch target on a card, the contrast of every piece of type on it,
   and whether anything overflows the column a 320px phone leaves.

   Colours are painted into a 1x1 canvas and read back rather than parsed
   out of `getComputedStyle`, which hands a `color-mix()` back unresolved as
   `oklab(...)` - and every tinted surface in this app computes to one, so a
   regex parser silently skips exactly the grounds worth checking.

   Run: VITE_DEMO=1 npm run build, then node tests/surgery-rail-measure.mjs */
import { preview } from 'vite';
import { launchChromium, fillDate } from './browser-harness.mjs';
import { tinyPhoto } from './photo-fixture.mjs';

const app = await preview({ preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const browser = await launchChromium();
const iso = (d) => { const x = new Date(); x.setDate(x.getDate() + d); return x.toISOString().slice(0, 10); };
const rows = [];
let failures = 0;

const MEASURE = () => {
  const paint = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 1;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    return (css) => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, 1, 1);
      ctx.fillStyle = css;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
      return [r, g, b];
    };
  })();
  const lum = ([r, g, b]) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  /* The ground an element is really painted on: the nearest ancestor whose
     own background is not transparent, resolved through the canvas. */
  const groundOf = (el) => {
    for (let n = el; n; n = n.parentElement) {
      const bg = getComputedStyle(n).backgroundColor;
      if (bg && bg !== 'transparent' && !bg.startsWith('rgba(0, 0, 0, 0)')) return paint(bg);
    }
    return paint(getComputedStyle(document.body).backgroundColor);
  };

  const out = { type: [], targets: [], overflow: {} };
  for (const card of document.querySelectorAll('[data-procedure-card]')) {
    const phase = card.dataset.phase;
    for (const [what, sel] of [
      ['name', '.proc-name'],
      ['pill', '.proc-phase-pill'],
      ['number', '.proc-n'],
      ['unit', '.proc-unit'],
      ['date', '.proc-when'],
      ['photo day', '.proc-shot-day'],
      ['badge', '.proc-badge-tag span']
    ]) {
      const el = card.querySelector(sel);
      if (!el) continue;
      const cs = getComputedStyle(el);
      out.type.push({
        phase,
        what,
        px: Math.round(parseFloat(cs.fontSize) * 10) / 10,
        weight: cs.fontWeight,
        ratio: Math.round(ratio(paint(cs.color), groundOf(el)) * 100) / 100
      });
    }
    for (const [what, sel] of [['face', '.proc-face'], ['pencil', '.proc-act']]) {
      const el = card.querySelector(sel);
      if (!el) continue;
      /* The face's hit area is a pseudo-element stretched over the card, so
         the card's own box is what a finger gets. */
      const box = (what === 'face' ? card : el).getBoundingClientRect();
      out.targets.push({ phase, what, w: Math.round(box.width), h: Math.round(box.height) });
    }
    out.overflow[phase] = Math.round(card.scrollWidth - card.clientWidth);
  }
  const de = document.scrollingElement ?? document.documentElement;
  const region = document.querySelector('[data-app-scroll-region]');
  out.page = Math.round(de.scrollWidth - de.clientWidth);
  out.region = region ? Math.round(region.scrollWidth - region.clientWidth) : null;
  return out;
};

for (const width of [390, 320]) {
  for (const theme of ['light', 'dark']) {
    const page = await browser.newPage({ viewport: { width, height: 1400 } });
    await page.goto(`${base}/`, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-app-root][data-boot="ready"]');
    if (await page.locator('[data-leave-setup]').count()) {
      await page.locator('[data-leave-setup]').click();
      await page.waitForSelector('[data-home-hello]');
    }
    const goto = async (p) => {
      await page.goto(base + p, { waitUntil: 'networkidle' });
      await page.waitForSelector('[data-app-root][data-boot="ready"]');
    };
    await goto('/settings');
    await page.locator('[data-segment="' + theme + '"]').first().click();
    await page.waitForFunction((w) => document.documentElement.dataset.theme === w, theme);

    for (const [name, off] of [['facial surgery', -18], ['top surgery', -400]]) {
      await goto('/health/surgery');
      await page.locator('[data-add]').click();
      await page.waitForSelector('#surgery-name');
      await page.fill('#surgery-name', name);
      await fillDate(page, '#surgery-date', iso(off));
      await page.locator('[data-save-procedure]').click();
      await page.waitForSelector('[data-save-procedure]', { state: 'detached' });
      await page.waitForTimeout(400);
    }
    // One consult on each, so the badge and two rail marks are measured too.
    for (const name of ['facial surgery', 'top surgery']) {
      await goto('/health/surgery');
      await page.locator('[data-procedure-card]', { hasText: name }).first().locator('button').first().click();
      await page.waitForSelector('[data-recovery-log]');
      if (!(await page.locator('[data-add-consult]').count())) continue;
      await page.locator('[data-add-consult]').click();
      await page.waitForSelector('#surgery-consult-date');
      await fillDate(page, '#surgery-consult-date', iso(off_for(name)));
      await page.locator('[data-save-consult]').click();
      await page.waitForTimeout(400);
    }
    // One photo on the running one, for the strip's captions.
    await goto('/health/surgery');
    await page.locator('[data-procedure-card]', { hasText: 'facial surgery' }).first().locator('button').first().click();
    await page.waitForSelector('[data-recovery-log]');
    await page.locator('[data-add-photo]').click();
    await page.waitForSelector('#surgery-photo-date');
    await fillDate(page, '#surgery-photo-date', iso(-16));
    const bytes = await tinyPhoto(page, '#c94f7c');
    page.once('filechooser', (c) => c.setFiles({ name: 'h.png', mimeType: 'image/png', buffer: bytes }));
    await page.locator('[data-pick-procedure-photo]').click();
    await page.waitForFunction(() => document.querySelectorAll('[data-procedure-photo]').length >= 1, null, { timeout: 90000 });

    await goto('/health/surgery');
    await page.waitForTimeout(700);
    const m = await page.evaluate(MEASURE);
    rows.push({ width, theme, ...m });
    await page.close();
  }
}

function off_for(name) { return name === 'facial surgery' ? -52 : -460; }

const FLOOR = (px, weight) => (px >= 24 || (px >= 18.66 && Number(weight) >= 700) ? 3 : 4.5);
for (const r of rows) {
  process.stdout.write(`\n${r.width}px, ${r.theme}\n`);
  for (const t of r.type) {
    const floor = FLOOR(t.px, t.weight);
    const ok = t.ratio >= floor;
    if (!ok) failures++;
    process.stdout.write(`  ${ok ? 'PASS' : 'FAIL'}  ${t.phase.padEnd(9)} ${t.what.padEnd(10)} ${String(t.px).padStart(5)}px/${t.weight}  ${String(t.ratio).padStart(6)}:1  (floor ${floor})\n`);
  }
  for (const t of r.targets) {
    const ok = t.w >= 48 && t.h >= 48;
    if (!ok) failures++;
    process.stdout.write(`  ${ok ? 'PASS' : 'FAIL'}  ${t.phase.padEnd(9)} ${t.what.padEnd(10)} ${t.w}x${t.h}\n`);
  }
  const over = [...Object.entries(r.overflow), ['page', r.page], ['region', r.region]].filter(([, v]) => v > 0);
  if (over.length) failures++;
  process.stdout.write(`  ${over.length ? 'FAIL' : 'PASS'}  overflow ${over.length ? JSON.stringify(over) : 'none, on either card or the region'}\n`);
}

process.stdout.write(`\n${failures} FAILURE(S)\n`);
await browser.close();
await app.httpServer.close();
process.exit(failures ? 1 : 0);
