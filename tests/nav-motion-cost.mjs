/* What the tab highlight costs to travel, because redesign ticket 26 animates
   four layout insets and motion/materials.css's contract says only transform
   and opacity animate - the target being a Capacitor WebView on a mid-range
   Android phone rather than a desktop browser.

   The claim being measured. That contract has been amended once before, by
   phase 5 ticket 28, and the shape of that amendment is what this follows: a
   material may reach past transform and opacity if it arrives with a cap a
   test can check and a number from a benchmark, so that measurement can only
   tighten it. The cap here is structural rather than a threshold. The pill is
   one absolutely positioned, empty box per navigation - no children, no text,
   no siblings whose position depends on it - so a change to its insets
   invalidates the layout of exactly that box, and there is nothing for a
   reflow to cascade into. Two edges on two schedules cannot be said with a
   transform at all (indicator.ts says why), so the choice was this or the
   symmetric stretch the ticket replaced.

   What this samples: requestAnimationFrame deltas through one tab switch at
   the phone floor, unthrottled and at 4x CPU throttling, over the whole 456ms
   the two edges and the icon's swing take. A dropped frame is a delta over
   20ms. The route change that the same tap causes renders a new screen and is
   the expensive part of the interaction; it shows up as one long frame near
   the start, and it is not the travel.

   It also prints where the pill came to rest against its tab, which is the
   ticket's own acceptance criterion in the one form it can be measured:
   an animation that ends anywhere but at rest strands the shape when the
   reduced-motion clamp collapses every duration to 1ms.

   Say which machine produced the number when quoting it: this is a desktop
   Chromium under CPU throttling, not the device tier. Both Android emulators
   run with the GPU disabled, so no rendering answer can come from one either;
   the phone itself is the only place a real one lives.

   Run: VITE_DEMO=1 npm run build first, then
        node tests/nav-motion-cost.mjs */
import { preview } from 'vite';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './browser-harness.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

const PHONE = { width: 390, height: 844 };
const DESK = { width: 1180, height: 900 };
/* The whole sequence plus a beat: the leading edge spends --dur-med, the
   trailing edge waits --stagger-step then spends --dur-slow. */
const WINDOW_MS = 500;
const DROPPED = 20;

const app = await preview({ root, preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const browser = await launchChromium();

/** A page resting on Home with the demo chrome gone. `reducedMotion` has to
    be said out loud: headless Chromium answers `prefers-reduced-motion:
    reduce` by default, and the shell reads that into html[data-a11y-motion],
    which would measure the app correctly refusing to animate. */
async function open(size) {
  const context = await browser.newContext({
    viewport: size,
    deviceScaleFactor: 1,
    reducedMotion: 'no-preference'
  });
  const page = await context.newPage();
  const settle = async (path) => {
    await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-app-root][data-boot="ready"]');
  };
  await settle('/');
  if (await page.locator('[data-leave-setup]').count()) {
    await page.locator('[data-leave-setup]').click();
    await page.waitForSelector('[data-home-hello]');
    await settle('/');
  }
  await page.evaluate(() => {
    for (const toast of document.querySelectorAll('[data-toast]')) toast.remove();
    document.querySelector('.demo-bar')?.remove();
    document.body.classList.remove('has-demo-bar');
  });
  await page.waitForTimeout(400);
  return { context, page };
}

/* Frame cadence, at the width the bar lives at. */
const phone = await open(PHONE);
const cdp = await phone.context.newCDPSession(phone.page);
for (const rate of [1, 4]) {
  await cdp.send('Emulation.setCPUThrottlingRate', { rate });
  const frames = await phone.page.evaluate(async (ms) => {
    const onHome = document.location.pathname === '/';
    const target = document.querySelector(`[data-nav-item="${onHome ? 'settings' : 'home'}"]`);
    const out = [];
    const t0 = performance.now();
    let last = t0;
    target.click();
    return await new Promise((done) => {
      const tick = () => {
        const now = performance.now();
        out.push({ at: Math.round(now - t0), gap: Math.round((now - last) * 10) / 10 });
        last = now;
        if (now - t0 < ms) requestAnimationFrame(tick);
        else done(out);
      };
      requestAnimationFrame(tick);
    });
  }, WINDOW_MS);

  /* The first delta is measured from the click rather than from a previous
     frame, so it is not a frame interval at all. */
  const body = frames.slice(1);
  const gaps = body.map((f) => f.gap).sort((a, b) => a - b);
  const dropped = body.filter((f) => f.gap > DROPPED);
  console.log(
    `cpu ${rate}x: ${body.length} frames over ${WINDOW_MS}ms, ` +
      `median ${gaps[Math.floor(gaps.length / 2)]}ms, worst ${gaps.at(-1)}ms, ` +
      `over ${DROPPED}ms: ${dropped.map((f) => `${f.gap}ms at +${f.at}`).join(', ') || 'none'}`
  );
  await phone.page.waitForTimeout(700);
}
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
await phone.context.close();

/* And where it lands, on both shapes. Both edges arriving means the pill's
   own box is the tab's box; anything else is a stranded stretch waiting for
   the reduced-motion clamp to expose it. */
for (const [form, size, attr] of [
  ['bar', PHONE, 'data-nav-item'],
  ['rail', DESK, 'data-rail-item']
]) {
  const { context, page } = await open(size);
  await page.waitForSelector(`[data-nav-pill="${form}"].is-shown`);
  await page.locator(`[${attr}="settings"]`).click();
  await page.waitForTimeout(900);
  const off = await page.evaluate(
    ({ form, attr }) => {
      const pill = document.querySelector(`[data-nav-pill="${form}"]`).getBoundingClientRect();
      const tab = document.querySelector(`[${attr}="settings"]`).getBoundingClientRect();
      return ['x', 'y', 'width', 'height'].map((k) => Math.round(Math.abs(pill[k] - tab[k]) * 10) / 10);
    },
    { form, attr }
  );
  console.log(`${form}: landed off its tab by [${off.join(', ')}]px`, off.every((n) => n < 0.6) ? 'at rest' : 'STRANDED');
  await context.close();
}

await browser.close();
await app.close();
