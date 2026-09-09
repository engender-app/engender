/* What redesign ticket 36 changed, and only that.

   Two surfaces are new and one is edited, so this renders those three and
   leaves the rest of setup out of shot (Alicja, 2026-09-07: "only showcase
   the things that actually changed in this ticket, not the whole app every
   time"):

   - the welcome's foot, which gains a second action, shot with the new
     control and again with it hidden so the pair is a before and an after
     of the same build rather than two builds;
   - the restore step, in every state it has: empty, focused, holding a
     file, refused, and running;
   - the finish, which on a restored first run says something different and
     whose button is the restore.

   Stills at 390x844, the phone the renders are read on. The palettes are
   the ones whose --accent and --danger differ most, in both themes, because
   the new drawing is a block on --surface-2 with an --outline edge, a rule
   in --text and a status line in --danger, and those are what a palette
   moves.

   Two motion scenes beside them, recorded as Chromium screencast frames the
   way tests/state-motion-gallery.mjs does, because a still cannot review a
   transition: the file block clipping open when a file is picked, and the
   3px rule drawing in when the password field takes focus. Frames land as
   JPEGs plus a manifest.json with the millisecond each was painted at and
   the per-frame samples, which tests/panel-motion-flipbook.mjs turns into a
   scrubbable flipbook.

   Run: VITE_DEMO=1 npm run build && node tests/restore-gallery.mjs */
import { preview } from 'vite';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './browser-harness.mjs';
import { startSampling, stopSampling } from './motion-sampling.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const outDir = resolve(process.argv[2] ?? resolve(root, '.claude/restore-shots'));

const VIEWPORT = { width: 390, height: 844 };
const SCENE_MS = 900;

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

const app = await preview({ preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const browser = await launchChromium();
const shots = [];
const scenes = [];

const context = await browser.newContext({
  viewport: VIEWPORT,
  deviceScaleFactor: 2,
  reducedMotion: 'no-preference'
});
const page = await context.newPage();
page.on('pageerror', (e) => console.error('page error:', e.message));
const cdp = await context.newCDPSession(page);

const settle = async (path) => {
  await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]');
  if (await page.locator('[data-leave-setup]').count()) {
    await page.locator('[data-leave-setup]').click();
    await page.waitForSelector('[data-home-hello]');
    await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-app-root][data-boot="ready"]');
  }
};

/* The demo bar is review chrome, half the viewport at 390px, and not in the
   build being signed off. Removed after the seeding clicks, never before. */
const strip = () =>
  page.evaluate(() => {
    document.querySelector('.demo-bar')?.remove();
    document.body.classList.remove('has-demo-bar');
    for (const toast of document.querySelectorAll('[data-toast]')) toast.remove();
    if (!document.getElementById('restore-shot-css')) {
      const style = document.createElement('style');
      style.id = 'restore-shot-css';
      style.textContent =
        '[data-app-scroll-region]{scrollbar-width:none}[data-app-scroll-region]::-webkit-scrollbar{display:none}';
      document.head.append(style);
    }
  });

const dress = async (palette, theme) => {
  await settle('/settings');
  await page.locator(`[data-palette-pick="${palette}"]`).click();
  await page.locator(`[data-segment="${theme}"]`).click();
  await page.waitForFunction(
    ([p, t]) =>
      document.documentElement.dataset.palette === p && document.documentElement.dataset.theme === t,
    [palette, theme]
  );
};

/** The first run, on the welcome, with the demo bar gone. */
const firstRun = async () => {
  await settle('/');
  await page.selectOption('#demo-jump', 'first-run');
  await page.waitForSelector('[data-restore-start]');
  await page.waitForTimeout(600);
  await strip();
};

/** A file into the picker. Not a real archive on purpose for most shots:
    what the block draws is a name, and every state but the last one is
    reached without decrypting anything. */
const pickFile = async (name) => {
  page.once('filechooser', (chooser) =>
    chooser.setFiles({
      name,
      mimeType: 'application/octet-stream',
      buffer: Buffer.from('this is not an archive')
    })
  );
  await page.locator('[data-restore-pick]').click();
  await page.waitForFunction(
    (want) => document.querySelector('[data-restore-file]')?.textContent.includes(want),
    name.slice(0, 12)
  );
};

const shoot = async (name, selector) => {
  await page.waitForTimeout(350);
  await page.locator(selector).screenshot({ path: `${outDir}/${name}.png` });
  shots.push(name);
};

/* ---------- the welcome's foot, before and after ---------- */
await dress('trans', 'light');
await firstRun();
await shoot('welcome-foot-after', '.setup-foot');
/* The same build with the one new control hidden, which is exactly what
   this foot was before the ticket: the primary, and one ghost under it. */
await page.addStyleTag({ content: '[data-restore-start]{display:none}' });
await shoot('welcome-foot-before', '.setup-foot');

/* ---------- the restore step, every state ---------- */
const restoreStates = async (tag) => {
  await firstRun();
  await page.locator('[data-restore-start]').click();
  await page.waitForSelector('[data-restore-pick]');
  await shoot(`${tag}-empty`, '[data-app-root]');

  await page.locator('#ob-restore-pass').focus();
  await shoot(`${tag}-focus`, '.setup-step');

  await pickFile('journal-2026-09-09.ttbackup');
  await shoot(`${tag}-picked`, '[data-app-root]');

  await page.locator('#ob-restore-pass').fill('not-the-password');
  await page.locator('[data-restore-check]').click();
  await page.waitForSelector('[data-restore-error="not-an-archive"]');
  await shoot(`${tag}-refused`, '[data-app-root]');

  /* The button mid-fill. Held rather than caught: the fill is driven from
     the run's fraction per frame, and a real refusal on a 22-byte file is
     over before a shutter opens. Same class and same custom property the
     screen writes, so what is in shot is the rule, not a mock-up. */
  await page.evaluate(() => {
    const button = document.querySelector('[data-restore-check]');
    button.classList.add('is-filling');
    button.style.setProperty('--fill', '62%');
  });
  await shoot(`${tag}-running`, '.setup-foot');
};

await restoreStates('restore-trans-light');

for (const [palette, theme] of [
  ['nonbinary', 'dark'],
  ['agender', 'light'],
  ['bisexual', 'dark']
]) {
  await dress(palette, theme);
  await firstRun();
  await page.locator('[data-restore-start]').click();
  await page.waitForSelector('[data-restore-pick]');
  await pickFile('journal-2026-09-09.ttbackup');
  await shoot(`restore-${palette}-${theme}-picked`, '[data-app-root]');
  await page.locator('#ob-restore-pass').fill('not-the-password');
  await page.locator('[data-restore-check]').click();
  await page.waitForSelector('[data-restore-error="not-an-archive"]');
  await shoot(`restore-${palette}-${theme}-refused`, '[data-app-root]');
}

/* ---------- the finish, on a restored first run ----------

   Reached with a real archive, because the finish is only shown once the
   file has been proved to open, and proving it is what the step does. */
await dress('trans', 'light');
await settle('/settings/export');
await page.locator('#exp-pass').fill('gallery');
await page.locator('[data-export]').click();
const [archive] = await Promise.all([
  page.waitForEvent('download', { timeout: 120000 }),
  page.locator('[data-confirm-export]').click()
]);
const archivePath = await archive.path();
await firstRun();
await page.locator('[data-restore-start]').click();
await page.waitForSelector('[data-restore-pick]');
page.once('filechooser', (chooser) => chooser.setFiles(archivePath));
await page.locator('[data-restore-pick]').click();
await page.waitForFunction(() => document.querySelector('[data-restore-file]'));
await page.locator('#ob-restore-pass').fill('gallery');
await page.locator('[data-restore-check]').click();
await page.waitForSelector('[data-next]', { timeout: 120000 });
await strip();
await shoot('access-mode-step', '[data-app-root]');
await page.locator('[data-next]').click();
await page.waitForSelector('[data-finish]');
await strip();
await shoot('finish-restore', '[data-app-root]');

/* ---------- motion ---------- */
async function record(name, note, act, read, cropOf) {
  const bandOf = () =>
    page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return undefined;
      const box = el.getBoundingClientRect();
      return { top: Math.max(0, Math.floor(box.top) - 24), bottom: Math.ceil(box.bottom) + 24 };
    }, cropOf);
  const before = await bandOf();
  const frames = [];
  const started = Date.now();
  const onFrame = async ({ data, sessionId }) => {
    frames.push({ at: Date.now() - started, data });
    try {
      await cdp.send('Page.screencastFrameAck', { sessionId });
    } catch {
      /* Stopped between frame and ack: the ordinary end of a scene. */
    }
  };
  cdp.on('Page.screencastFrame', onFrame);
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 60, everyNthFrame: 1 });
  await page.waitForTimeout(80);
  if (read) await startSampling(page, read);
  await act();
  await page.waitForTimeout(SCENE_MS);
  await cdp.send('Page.stopScreencast');
  cdp.off('Page.screencastFrame', onFrame);
  const after = await bandOf();
  const bands = [before, after].filter(Boolean);
  const crop = bands.length
    ? {
        top: Math.min(...bands.map((b) => b.top)),
        height: Math.max(...bands.map((b) => b.bottom)) - Math.min(...bands.map((b) => b.top))
      }
    : undefined;
  let samples = [];
  if (read) {
    try {
      samples = await stopSampling(page);
    } catch {
      samples = [];
    }
  }
  const written = [];
  for (const [i, frame] of frames.entries()) {
    const file = `${name}-${String(i).padStart(3, '0')}.jpg`;
    await writeFile(resolve(outDir, file), Buffer.from(frame.data, 'base64'));
    written.push({ file, at: frame.at });
  }
  scenes.push({ name, note, frames: written, samples, ...(crop ? { crop } : {}) });
  console.log(`${name}: ${written.length} frames over ${written.at(-1)?.at ?? 0}ms`);
}

await firstRun();
await page.locator('[data-restore-start]').click();
await page.waitForSelector('[data-restore-pick]');

await record(
  'file-arrives',
  'A file is picked: the block goes from an outline to a surface and the name clips in from its own left edge.',
  () => pickFile('journal-2026-09-09.ttbackup'),
  `const el = document.querySelector('[data-restore-file]');
   const box = document.querySelector('.setup-file');
   return {
     clip: el ? getComputedStyle(el).clipPath : 'none',
     dashed: box ? getComputedStyle(box).borderTopStyle : 'none',
     shown: Math.round(el ? el.getBoundingClientRect().width : 0)
   };`,
  '.setup-file'
);

await page.locator('#ob-restore-pass').blur();
await page.waitForTimeout(400);
await record(
  'rule-draws',
  'The password field takes focus: the 3px rule in --text draws in from the left over the resting one.',
  () => page.locator('#ob-restore-pass').focus(),
  `const el = document.querySelector('.setup-typed');
   return { rule: el ? getComputedStyle(el, '::after').transform : 'none' };`,
  '.setup-typed'
);

await writeFile(
  `${outDir}/manifest.json`,
  JSON.stringify({ viewport: VIEWPORT, shots, scenes }, null, 2)
);
await page.close();
await context.close();
await app.close();
await browser.close();
console.log(`${shots.length} stills and ${scenes.length} motion scenes in ${outDir}`);
