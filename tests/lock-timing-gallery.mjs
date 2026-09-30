/* Sign-off render for lock-timing ticket 01: crops of the parts that
   changed - the access-mode screen's second question (and the note in its
   place under a mode with no secret), the Security row, setup's lock step,
   and the unlock gate's note - in trans, light and dark.

   Run against a demo build (VITE_DEMO=1 npm run build):
     node tests/lock-timing-gallery.mjs --out /abs/dir
     node tests/lock-timing-gallery.mjs --motion --out /abs/dir
   `--motion` records the second question folding away as a mode row opens
   and coming back as it closes, as every frame the screencast paints, with
   a rAF loop sampling the block's box and opacity beside it. */
import { preview } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { launchChromium } from './browser-harness.mjs';
import { startSampling, stopSampling } from './motion-sampling.mjs';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1] : fallback;
};
const outDir = resolve(flag('out', '/tmp/lock-timing-shots'));
const motion = args.includes('--motion');
/** Only the scenes whose name contains this, for a quicker rerun. */
const only = flag('only', '');
const tag = flag('tag', 'web');
const THEMES = ['light', 'dark'];
const SCENE_MS = 900;

await mkdir(outDir, { recursive: true });
const app = await preview({ preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const browser = await launchChromium();
const context = await browser.newContext({
  viewport: { width: 390, height: 900 },
  deviceScaleFactor: 2,
  reducedMotion: 'no-preference'
});
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
const shots = [];
const scenes = [];

/** Hides the demo bar and toasts for a shot and hands back the undo, so
    the bar's own jump menu is still there for the in-app navigation the
    no-secret scenes need (a reload there lands on the demo's passphrase
    gate, since the demo only knows how to reopen a passphrase journal). */
const strip = () =>
  page.evaluate(() => {
    for (const toast of document.querySelectorAll('[data-toast]')) toast.remove();
    for (const bar of document.querySelectorAll('.demo-bar')) bar.style.display = 'none';
    document.body.classList.remove('has-demo-bar');
  });
const unstrip = () =>
  page.evaluate(() => {
    for (const bar of document.querySelectorAll('.demo-bar')) bar.style.display = '';
    document.body.classList.add('has-demo-bar');
  });

/** Client-side navigation through the demo bar, no reload. */
const nav = async (path) => {
  await page.selectOption('#demo-jump', path);
};

const settle = async (path) => {
  await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]', { timeout: 30000 });
  if (await page.locator('[data-leave-setup]').count()) {
    await page.locator('[data-leave-setup]').click();
    await page.waitForSelector('[data-home-hello]');
    await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-app-root][data-boot="ready"]');
  }
};

const dress = async (theme) => {
  await settle('/settings');
  await page.locator('[data-palette-pick="trans"]').click();
  await page.locator(`[data-segment="${theme}"]`).click();
  await page.waitForFunction(
    (t) => document.documentElement.dataset.palette === 'trans' && document.documentElement.dataset.theme === t,
    theme
  );
};

/** A crop from the top of one element to the bottom of another, full app
    width, with a little page around it. */
async function crop(name, fromSel, toSel = fromSel, pad = 16) {
  if (only && !name.includes(only)) return;
  await page.mouse.move(2, 2);
  await page.waitForTimeout(500);
  await strip();
  const box = await page.evaluate(
    ([a, b]) => {
      const frame = document.querySelector('[data-app-root]').getBoundingClientRect();
      const top = document.querySelector(a).getBoundingClientRect();
      const bottom = document.querySelector(b).getBoundingClientRect();
      return { x: frame.x, y: top.top, width: frame.width, height: bottom.bottom - top.top };
    },
    [fromSel, toSel]
  );
  const file = `${name}.png`;
  await page.screenshot({
    path: resolve(outDir, file),
    clip: { x: box.x, y: Math.max(0, box.y - pad), width: box.width, height: box.height + 2 * pad }
  });
  shots.push({ name, file });
  await unstrip();
  console.log('shot', name);
}

const openAccessMode = async () => {
  await page.locator('a[href="/settings/security"]').click();
  await page.waitForSelector('[data-security-list]');
  await page.locator('a[href="/settings/access-mode"]').click();
  await page.waitForSelector('[data-access-modes]');
};

/** Locks the running app the way leaving it does under Immediately. */
const leave = () =>
  page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    delete document.visibilityState;
  });

const SAMPLE = `
  const block = document.querySelector('[data-lock-after-block]');
  const below = document.querySelector('[data-list-row="change-passphrase"]');
  if (!block) return { present: false, belowTop: below ? below.getBoundingClientRect().top : null };
  const r = block.getBoundingClientRect();
  return { present: true, top: r.top, h: r.height, opacity: Number(getComputedStyle(block).opacity),
    belowTop: below ? below.getBoundingClientRect().top : null };
`;

/** One frame's worth of anything: a presence flip with no travel either
    side, or the row under the block jumping a large share of its path. */
function findYanks(samples) {
  const yanks = [];
  const path = Math.max(...samples.map((s) => s.belowTop ?? 0)) - Math.min(...samples.map((s) => s.belowTop ?? 1e9));
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1];
    const b = samples[i];
    if (a.present !== b.present) {
      const h = a.present ? a.h : b.h;
      if (h > 2) yanks.push({ t: b.t, what: `block ${a.present ? 'vanishes' : 'appears'} at ${Math.round(h)}px` });
    }
    if (a.belowTop != null && b.belowTop != null && path > 0) {
      const d = Math.abs(b.belowTop - a.belowTop);
      if (d > Math.max(24, path * 0.4)) yanks.push({ t: b.t, what: `row below jumps ${Math.round(d)}px of ${Math.round(path)}` });
    }
  }
  return yanks;
}

async function record(name, act, target) {
  if (only && !name.includes(only)) return;
  /* Nothing between the pointer and the row, and the row already in view,
     so the act lands on the frame it is fired rather than after a scroll
     and a wait for a toast to go. */
  await page.evaluate(() => document.querySelectorAll('[data-toast]').forEach((t) => t.remove()));
  await page.locator(target).scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  const frames = [];
  const started = Date.now();
  const onFrame = async ({ data, sessionId }) => {
    frames.push({ at: Date.now() - started, data });
    try {
      await cdp.send('Page.screencastFrameAck', { sessionId });
    } catch {
      /* Stopped between this frame and its ack. */
    }
  };
  cdp.on('Page.screencastFrame', onFrame);
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 80, everyNthFrame: 1 });
  await page.waitForTimeout(80);
  await startSampling(page, SAMPLE);
  const actAt = Date.now() - started;
  await act();
  await page.waitForTimeout(SCENE_MS);
  const samples = await stopSampling(page);
  await cdp.send('Page.stopScreencast');
  cdp.off('Page.screencastFrame', onFrame);
  const written = [];
  for (const [i, frame] of frames.entries()) {
    const file = `${name}-${String(i).padStart(3, '0')}.jpg`;
    await writeFile(resolve(outDir, file), Buffer.from(frame.data, 'base64'));
    written.push({ file, at: frame.at - actAt });
  }
  const yanks = findYanks(samples);
  scenes.push({ name, frames: written, crop: { left: 0, top: 120, width: null, height: 780 }, yanks, samples });
  console.log(`${name}: ${written.length} frames, ${samples.length} samples, ${yanks.length} yank(s)`);
  for (const y of yanks.slice(0, 12)) console.log(`   ${y.t}ms ${y.what}`);
}

try {
  for (const theme of THEMES) {
    await dress(theme);
    await openAccessMode();
    if (motion) {
      /* A passphrase journal, so PIN is a row to open. */
      const pin = '[data-access-modes] [data-list-row="pin"]';
      await record(`fold-${tag}-${theme}`, () => page.locator(pin).click(), pin);
      await page.waitForTimeout(300);
      await record(`unfold-${tag}-${theme}`, () => page.locator('[data-access-back]').click(), '[data-access-back]');
      continue;
    }
    await crop(`access-mode-timing-${tag}-${theme}`, '[data-access-current]', '[data-lock-after-block]');
    if (tag !== 'web') continue;
    await page.locator('[data-screen-back]').click();
    await page.waitForSelector('[data-security-list]');
    await crop(`security-row-${theme}`, '[data-list-row="access-mode"]');

    /* The gate note, under Immediately so it has a timing to state. */
    await page.locator('a[href="/settings/access-mode"]').click();
    await page.locator('[data-lock-after-choice="immediately"]').click();
    await page.locator('[data-screen-back]').click();
    await page.waitForSelector('[data-security-list]');
    await leave();
    await page.waitForSelector('[data-applock]');
    await crop(`gate-note-${theme}`, '[data-applock] .gate-foot');

    /* Setup's lock step, from the demo's own first run: the journal is
       already on a passphrase, so the step is the timing question. */
    await settle('/');
    await page.selectOption('#demo-jump', 'first-run');
    await page.waitForSelector('[data-next]');
    for (let i = 0; i < 12 && !(await page.locator('[data-lock-after]').count()); i++) {
      await page.locator('[data-next]').click();
      await page.waitForTimeout(700);
    }
    await crop(`setup-lock-${theme}`, '[data-setup-question]', '[data-lock-after]', 24);
  }

  if (tag === 'web' && !motion) {
    /* A mode with no secret: move the demo journal to this browser only,
       then shoot where the question would have been. All of it in-app from
       here on, for the reason strip() gives. */
    await dress('light');
    await openAccessMode();
    await page.locator('[data-access-modes] [data-list-row="device-bound"]').click();
    await page.locator('[data-access-submit]').click();
    /* No recovery key in the demo, so the change ends on the offer. */
    await page.locator('[data-skip-recovery-offer]').click({ timeout: 20000 });
    await page.waitForSelector('[data-security-list]');
    for (const theme of THEMES) {
      await nav('/settings');
      await page.locator(`[data-segment="${theme}"]`).click();
      await page.waitForFunction((t) => document.documentElement.dataset.theme === t, theme);
      await openAccessMode();
      await crop(`access-mode-no-secret-${theme}`, '[data-access-current]', '[data-lock-after-block]');
      await page.locator('[data-screen-back]').click();
      await page.waitForSelector('[data-security-list]');
      await crop(`security-row-no-secret-${theme}`, '[data-list-row="access-mode"]');
      await nav('first-run');
      await page.waitForSelector('[data-next]');
      for (let i = 0; i < 12 && !(await page.locator('.setup-line', { hasText: 'opens without asking' }).count()); i++) {
        await page.locator('[data-next]').click();
        await page.waitForTimeout(700);
      }
      await crop(`setup-lock-no-secret-${theme}`, '[data-setup-question]', '.setup-line', 24);
      await page.locator('[data-leave-setup]').click();
      await page.waitForSelector('[data-home-hello]');
    }
  }
} catch (error) {
  await page.screenshot({ path: resolve(outDir, 'failure.png') }).catch(() => {});
  console.log('boot:', await page.evaluate(() => document.querySelector('[data-app-root]')?.dataset.boot).catch(() => '?'));
  throw error;
} finally {
  await writeFile(
    `${outDir}/${motion ? 'manifest' : 'shots'}-${tag}.json`,
    JSON.stringify(motion ? { scenes } : { shots }, null, 1)
  );
  if (errors.length) console.log('page errors:', errors);
  await browser.close();
  app.httpServer.close();
}
