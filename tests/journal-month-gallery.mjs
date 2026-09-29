/* Sign-off render for ux-carpet ticket 280: the Journal's open month. Crops
   of the grid only (the header, the controls and the day cards are not what
   changed), trans palette, light and dark.

   Run against a demo build (VITE_DEMO=1 npm run build):
     node tests/journal-month-gallery.mjs --tag after --out /abs/dir
     node tests/journal-month-gallery.mjs --motion --out /abs/dir
   `vite preview` serves SvelteKit's output under the working directory, so
   the before shots come from running this file with a checkout of main as
   the cwd, built there (photo-grid-batching-gallery.mjs's own note).

   `--motion` records each scene the ticket names - month change forward and
   back, metric switch both ways, strip to grid and back, and the month
   change and metric switch under reduced motion - as every frame Chromium's screencast paints
   (tests/panel-motion-flipbook.mjs turns the directory into a flipbook).
   Beside the frames, a rAF loop samples every cell's box, opacity and face,
   and the scene's `yanks` list is what that sampling found: something
   appearing or vanishing within one frame, or jumping across the grid in
   one. A recording shows that something moved; the samples say by how much
   and on which frame, which is what to look at the pixels of. */
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
const tag = flag('tag', 'after');
const outDir = resolve(flag('out', '/tmp/journal-month-shots'));
const motion = args.includes('--motion');
const THEMES = ['light', 'dark'];
/** Long enough for the slowest scene (the strip's travel, --dur-slow, and
    the faces' beat after it) to have finished and sat still. */
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
const shots = [];
const scenes = [];

const strip = () =>
  page.evaluate(() => {
    for (const toast of document.querySelectorAll('[data-toast]')) toast.remove();
    for (const bar of document.querySelectorAll('.demo-bar')) bar.remove();
    document.body.classList.remove('has-demo-bar');
  });

const settle = async (path) => {
  await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]', { timeout: 30000 });
  if (await page.locator('[data-leave-setup]').count()) {
    await page.locator('[data-leave-setup]').click();
    await page.waitForSelector('[data-home-hello]');
    await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-app-root][data-boot="ready"]');
  }
  await strip();
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

const gridSettled = () =>
  page.waitForFunction(() => {
    const grids = document.querySelectorAll('[data-cal-grid]');
    return grids.length === 1 && grids[0].getAttribute('aria-busy') === 'false';
  });

const openMonth = async ({ open = true } = {}) => {
  await settle('/calendar');
  await page.waitForSelector('[data-cal-open]');
  if (open) {
    await page.locator('[data-cal-open]').click();
    await page.waitForSelector('[data-cal-month-state="grid"]');
  }
  await gridSettled();
  await page.waitForTimeout(1200);
  await page.mouse.move(4, 4);
  await strip();
};

/* The demo persona logs at most two readings a day, so two of the shapes
   the ticket is about - a dip, and a split of more than two readings -
   never occur in it; the persona's own two-reading same-step days cover
   the third. They are written here through the real editor, on the
   month's first empty past days, oldest reading first (the spread is
   ordered by timestamp, then id). The last empty day stays empty. */
const SEEDED = [
  { name: 'dip', moods: [5, 1, 5] },
  { name: 'split-of-four', moods: [2, 3, 4, 5] }
];

const seed = async () => {
  await openMonth();
  const empty = await page.$$eval('[data-hm-cell-empty] [data-cal-date]', (nums) =>
    nums.map((n) => Number(n.getAttribute('data-cal-date')))
  );
  if (empty.length < SEEDED.length + 1) throw new Error(`only ${empty.length} empty past days to seed into`);
  for (const [i, day] of SEEDED.entries()) {
    for (const mood of day.moods) {
      await page.goto(`${base}/entry/new/${empty[i]}`, { waitUntil: 'networkidle' });
      await page.waitForSelector('#ed-note');
      await page.locator(`[data-mood="${mood}"]`).first().click();
      await page.locator('[data-save]').click();
      await page.waitForURL((url) => !url.pathname.startsWith('/entry/new'), { timeout: 15000 });
    }
    console.log(`seeded ${day.name} on epoch day ${empty[i]}`);
  }
};

/** The day-of-week row, the grid and the key under it, in CSS px. */
const gridBox = () =>
  page.evaluate(() => {
    const frame = document.querySelector('[data-app-root]').getBoundingClientRect();
    const body = document.querySelector('[data-cal-month-body]').getBoundingClientRect();
    const chips = document.querySelector('[data-presentation-highlight-row]')?.getBoundingClientRect();
    const bottom = chips && chips.top > body.top ? chips.top : body.bottom;
    return { x: frame.x, y: body.top - 12, width: frame.width, height: bottom - body.top + 12 };
  });

const cropGrid = async (name) => {
  await page.locator('[data-cal-month-body]').scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  const box = await page.evaluate(() => {
    const frame = document.querySelector('[data-app-root]').getBoundingClientRect();
    const body = document.querySelector('[data-cal-month-body]').getBoundingClientRect();
    return { x: frame.x, y: body.top - 12, width: frame.width, height: body.height + 24 };
  });
  await page.screenshot({ path: `${outDir}/${name}-${tag}.png`, clip: box });
  shots.push(`${name}-${tag}.png`);
};

/* ---------- Motion ---------- */

/* Every cell on every frame: which block it is in (a month change has two),
   its surface's box, its date's box, and the opacity each is actually
   painted at - the cell's own times its block's, since the reduced-motion
   crossfade animates the block and the wave animates the cells. */
const SAMPLE = `
  const round = (n) => Math.round(n * 10) / 10;
  const op = (el) => { let o = 1; for (let n = el; n && n !== document.body; n = n.parentElement) o *= +getComputedStyle(n).opacity; return round(o); };
  const cells = [];
  document.querySelectorAll('[data-cal-grid]').forEach((grid, b) => {
    grid.querySelectorAll('[data-cal-cell]').forEach((cell) => {
      const r = cell.getBoundingClientRect();
      const date = cell.parentElement.querySelector('[data-cal-date]');
      const d = date.getBoundingClientRect();
      const faces = [...cell.querySelectorAll('.cal-face')].map((f) => op(f));
      // .cal-swatch is the anatomy before ticket 280, so the same sampler
      // can be pointed at main's build and seen to fail there.
      const fill = cell.querySelector('.cal-fill, .cal-swatch');
      cells.push({
        k: cell.dataset.calCell, b, out: grid.style.position === 'absolute',
        x: round(r.left), y: round(r.top), w: round(r.width), h: round(r.height),
        o: op(cell), dx: round(d.left), dy: round(d.top), dop: op(date),
        face: round(Math.max(...faces)), bg: getComputedStyle(fill).backgroundColor,
        r: getComputedStyle(fill).borderTopLeftRadius
      });
    });
  });
  const body = document.querySelector('[data-cal-month-body]')?.getBoundingClientRect();
  /* What sits under the grid, and how many px of it are inside the month
     body's box - the body is clipped to its animated height while it
     changes, so something below that edge is present and not seen, and a
     disclosed legend is clipped to its own animated height. */
  const under = {};
  for (const [name, sel] of [['key', '[data-cal-key]'], ['legend', '[data-cal-legend]'], ['chips', '[data-presentation-highlight-row]']]) {
    const el = document.querySelector(sel);
    if (!el || !body) continue;
    const r = el.getBoundingClientRect();
    under[name] = { o: op(el), top: round(r.top), vis: round(Math.max(0, Math.min(r.bottom, body.bottom) - r.top)) };
  }
  return { h: body ? round(body.height) : null, cells, under };
`;

/** The alpha a computed colour is painted at: 1 for rgb(), the fourth
    channel for rgba() and color() - a fill fading to transparent passes
    through every alpha on the way, and reading it as "filled" would call a
    240ms fade a one-frame cut. */
const alphaOf = (colour) => {
  const slash = /\/\s*([\d.]+)\)$/.exec(colour);
  if (slash) return Number(slash[1]);
  const rgba = /^rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)$/.exec(colour);
  return rgba ? Number(rgba[1]) : colour === 'transparent' ? 0 : 1;
};

/** What the samples say went wrong, frame by frame. `seenOf` is what is
    actually seen of a surface: its opacity times its fill's alpha, or its
    face where the face is the stronger - an empty past day's surface is
    nothing whatever its opacity is. */
function findYanks(samples) {
  const yanks = [];
  const seenOf = (c) => Math.round(c.o * Math.max(alphaOf(c.bg), c.face) * 100) / 100;
  /* A move is a teleport when one frame carries most of it. How far a
     frame may go is not a fixed number: the strip's travel is --dur-slow on
     an ease-out, whose first 16ms covers about a fifth of a 300px trip, and
     that is a curve, not a jump. So each element's step is weighed against
     the whole path it takes over the scene. */
  const path = new Map();
  const heights = samples.map((s) => s.h ?? 0);
  const heightPath = heights.slice(1).reduce((sum, h, i) => sum + Math.abs(h - heights[i]), 0);
  for (let i = 1; i < samples.length; i++) {
    const prev = new Map(samples[i - 1].cells.map((c) => [`${c.b}:${c.k}`, c]));
    for (const c of samples[i].cells) {
      const was = prev.get(`${c.b}:${c.k}`);
      if (!was) continue;
      const p = path.get(c.k) ?? { cell: 0, date: 0 };
      p.cell += Math.hypot(c.x - was.x, c.y - was.y);
      p.date += Math.hypot(c.dx - was.dx, c.dy - was.dy);
      path.set(c.k, p);
    }
  }
  const teleport = (step, whole) => step > 8 && step > whole / 2;
  for (let i = 1; i < samples.length; i++) {
    const prev = new Map(samples[i - 1].cells.map((c) => [`${c.b}:${c.k}`, c]));
    const prevByKey = new Map(samples[i - 1].cells.map((c) => [c.k, c]));
    const now = new Set();
    for (const c of samples[i].cells) {
      const was = prev.get(`${c.b}:${c.k}`) ?? prevByKey.get(c.k);
      now.add(c.k);
      const t = samples[i].t;
      if (!was) {
        if (seenOf(c) > 0.15) yanks.push({ t, k: c.k, what: `appears at ${seenOf(c)}` });
        if (c.dop > 0.15) yanks.push({ t, k: c.k, what: `date appears at ${c.dop}` });
        continue;
      }
      const whole = path.get(c.k) ?? { cell: 0, date: 0 };
      const jump = Math.hypot(c.x - was.x, c.y - was.y);
      if (teleport(jump, whole.cell) && Math.max(seenOf(c), seenOf(was)) > 0.15) {
        yanks.push({ t, k: c.k, what: `surface jumps ${Math.round(jump)}px of ${Math.round(whole.cell)}` });
      }
      const djump = Math.hypot(c.dx - was.dx, c.dy - was.dy);
      if (teleport(djump, whole.date) && Math.max(c.dop, was.dop) > 0.15) {
        yanks.push({ t, k: c.k, what: `date jumps ${Math.round(djump)}px of ${Math.round(whole.date)}` });
      }
      if (Math.abs(seenOf(c) - seenOf(was)) > 0.45) yanks.push({ t, k: c.k, what: `surface ${seenOf(was)} to ${seenOf(c)} in one frame` });
      if (Math.abs(c.face - was.face) > 0.45) yanks.push({ t, k: c.k, what: `face ${was.face} to ${c.face} in one frame` });
      if (Math.abs(c.dop - was.dop) > 0.45) yanks.push({ t, k: c.k, what: `date ${was.dop} to ${c.dop} in one frame` });
    }
    for (const was of samples[i - 1].cells) {
      if (!now.has(was.k) && (seenOf(was) > 0.15 || was.dop > 0.15)) {
        yanks.push({ t: samples[i].t, k: was.k, what: `gone from ${Math.max(seenOf(was), was.dop)}` });
      }
    }
    for (const name of new Set([...Object.keys(samples[i - 1].under ?? {}), ...Object.keys(samples[i].under ?? {})])) {
      const most = Math.max(1, ...samples.map((s) => s.under?.[name]?.vis ?? 0));
      const seen = (u) => (u ? Math.round(u.o * (u.vis / most) * 100) / 100 : 0);
      const was = seen(samples[i - 1].under?.[name]);
      const is = seen(samples[i].under?.[name]);
      /* Uncovered by the body's own edge moving, which is a wipe at the
         speed of the mask rather than a pop: the px that came into view fit
         inside the px the body grew by in the same frame. */
      const dvis = Math.abs((samples[i].under?.[name]?.vis ?? 0) - (samples[i - 1].under?.[name]?.vis ?? 0));
      const wiped = dvis <= Math.abs(heights[i] - heights[i - 1]) + 2;
      if (Math.abs(is - was) > 0.45 && !wiped) yanks.push({ t: samples[i].t, k: name, what: `${name} ${was} to ${is} in one frame` });
      const a = samples[i - 1].under?.[name];
      const b = samples[i].under?.[name];
      if (a && b && a.vis > 1 && b.vis > 1 && Math.abs(a.top - b.top) > 8 && Math.max(a.o, b.o) > 0.15) {
        const whole = samples.slice(1).reduce((sum, s, j) => sum + Math.abs((s.under?.[name]?.top ?? 0) - (samples[j].under?.[name]?.top ?? 0)), 0);
        if (teleport(Math.abs(a.top - b.top), whole)) yanks.push({ t: samples[i].t, k: name, what: `${name} jumps ${Math.round(Math.abs(a.top - b.top))}px` });
      }
    }
    const dh = Math.abs(heights[i] - heights[i - 1]);
    if (teleport(dh, heightPath)) yanks.push({ t: samples[i].t, what: `month height jumps ${Math.round(dh)}px of ${Math.round(heightPath)}` });
  }
  return yanks;
}

/** Records everything the page paints for SCENE_MS with `act` fired one
    frame in, so the first frame is the resting state the motion starts
    from, and samples every cell alongside. */
async function record(name, act) {
  const box = await gridBox();
  const frames = [];
  const started = Date.now();
  const onFrame = async ({ data, sessionId }) => {
    frames.push({ at: Date.now() - started, data });
    try {
      await cdp.send('Page.screencastFrameAck', { sessionId });
    } catch {
      /* Stopped between this frame and its ack: the ordinary end. */
    }
  };
  cdp.on('Page.screencastFrame', onFrame);
  /* At the device's own pixels: left alone the screencast hands back CSS
     px, and a face at 44px is too soft to review frame by frame. The crop
     below is in the same 2x. */
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 80, everyNthFrame: 1, maxWidth: 780, maxHeight: 1800 });
  await page.waitForTimeout(80);
  await startSampling(page, SAMPLE);
  const actAt = Date.now() - started;
  await act();
  await page.waitForTimeout(SCENE_MS);
  const samples = await stopSampling(page);
  await cdp.send('Page.stopScreencast');
  cdp.off('Page.screencastFrame', onFrame);
  const end = await gridBox();
  const written = [];
  for (const [i, frame] of frames.entries()) {
    const file = `${name}-${String(i).padStart(3, '0')}.jpg`;
    await writeFile(resolve(outDir, file), Buffer.from(frame.data, 'base64'));
    written.push({ file, at: frame.at - actAt });
  }
  const yanks = findYanks(samples);
  const height = Math.max(box.height, end.height);
  scenes.push({
    name,
    frames: written,
    crop: { left: 0, top: Math.round(box.y * 2), width: null, height: Math.round(height * 2) },
    yanks,
    samples: samples.map((s) => ({ t: s.t, h: s.h, n: s.cells.length }))
  });
  console.log(`${name}: ${written.length} frames, ${samples.length} samples, ${yanks.length} yank(s)`);
  for (const y of yanks.slice(0, 12)) console.log(`   ${y.t}ms ${y.k ?? ''} ${y.what}`);
}

const pickMetric = async (value) => {
  await page.selectOption('[data-chart-picker="calendar-metric"]', value);
};

try {
  await settle('/');
  await seed();
  for (const theme of THEMES) {
    await dress(theme);
    if (!motion) {
      await openMonth();
      await cropGrid(`month-${theme}`);
      continue;
    }
    await openMonth();
    await record(`month-back-${theme}`, () => page.locator('[data-cal-step="prev"]').click());
    await gridSettled();
    await record(`month-forward-${theme}`, () => page.locator('[data-cal-step="next"]').click());
    await gridSettled();
    const dimension = await page.$eval('[data-chart-picker="calendar-metric"]', (select) =>
      [...select.options].map((o) => o.value).find((v) => v !== 'mood')
    );
    await record(`metric-to-scale-${theme}`, () => pickMetric(dimension));
    await record(`metric-to-mood-${theme}`, () => pickMetric('mood'));
    await openMonth({ open: false });
    await record(`strip-to-grid-${theme}`, () => page.locator('[data-cal-open]').click());
    await record(`grid-to-strip-${theme}`, () => page.locator('[data-cal-open]').click());
  }
  if (motion) {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await dress('light');
    await openMonth();
    await record('month-back-reduced-light', () => page.locator('[data-cal-step="prev"]').click());
    await gridSettled();
    const scale = await page.$eval('[data-chart-picker="calendar-metric"]', (select) =>
      [...select.options].map((o) => o.value).find((v) => v !== 'mood')
    );
    await record('metric-to-scale-reduced-light', () => pickMetric(scale));
    await record('metric-to-mood-reduced-light', () => pickMetric('mood'));
    await page.emulateMedia({ reducedMotion: 'no-preference' });
  }
} finally {
  if (motion) {
    await writeFile(`${outDir}/manifest.json`, JSON.stringify({ scenes }, null, 1));
  } else {
    await writeFile(`${outDir}/shots-${tag}.json`, JSON.stringify(shots, null, 2));
  }
  await browser.close();
  await app.close();
}
