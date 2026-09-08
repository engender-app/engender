/* Frame-by-frame captures of the field as a blind (redesign ticket 28).

   The ticket's claims are all about where one edge is on a given frame -
   that it slides rather than crossfades, that the content under it travels
   with it, that it runs past its mark and comes back, that no frame holds
   two of the field's contents or a deformed corner. A still cannot show any
   of that and a description cannot be held to it, so every scene here is
   recorded twice over the same gesture: Chromium's screencast hands over
   the real composited frames, which is the flipbook, and a rAF loop reads
   the view transition's own pseudo elements every frame, which is the
   number the flipbook is read against.

   Reading the pseudos is what makes this a measurement rather than an
   opinion. `getComputedStyle(document.documentElement,
   '::view-transition-new(blind)')` answers with the clip the browser is
   painting at that instant, so the blind's bottom edge, the content's
   offset and every ring's scale come off the animation itself rather than
   off a guess about it.

   Frames land as JPEGs plus a manifest.json naming each scene, its frames,
   the millisecond each was painted at, and its trace.
   tests/panel-motion-flipbook.mjs turns that into one page.

   Run: node tests/blind-motion-gallery.mjs [outDir]
   Needs a demo build on disk (VITE_DEMO=1 npm run build); it serves
   `build/` rather than building, so the same build can be recorded twice. */
import { preview } from 'vite';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './browser-harness.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const outDir = resolve(process.argv[2] ?? resolve(root, '.claude/blind-motion'));

/** The door change is 380ms, the longest movement in the app; what is left
    of the scene is the stillness that says it landed rather than stopped. */
const SCENE_MS = 700;
const TRACE_MS = 620;

const PHONE = { width: 390, height: 844 };
/** The band the field and the first content under it occupy. Today's field
    is the tallest at 181px, and 420 reaches well past the foot that follows
    the edge down. */
const CROP = { left: 0, width: 390, top: 0, height: 420 };

/** Where each door's tab leads. The fourth is /more rather than /settings,
    and its key is 'settings' anyway (ADR-0036). */
const ROUTE = { home: '/', calendar: '/calendar', stats: '/stats', settings: '/more' };
const tab = (key) => `[data-nav-item="${key}"]`;

/* Each scene is a rest and a gesture. `sun` says the scene has Today on one
   side of it, so the trace carries every ring's scale as well as the edge. */
const SCENES = [
  {
    name: 'door-today-journal',
    note: "Today to Journal, the blind pulled up 77px. Round two: the wordmark and the foot ride up with the edge instead of standing still, the leave goes up because the blind is going up, and the whole run leaves on --ease-out-soft rather than snapping off the mark.",
    at: ROUTE.home,
    act: tab('calendar'),
    sun: true
  },
  {
    name: 'door-journal-lookback',
    note: "Journal to Look back, a 2.4px move: the two fields are almost the same height, so what changes here is the contents alone - the month strip out, the title in, one after the other.",
    at: ROUTE.calendar,
    act: tab('stats')
  },
  {
    name: 'door-lookback-transition',
    note: "Look back to Transition: the title leaves and the search box arrives, with the blind barely moving under them.",
    at: ROUTE.stats,
    act: tab('settings')
  },
  {
    name: 'door-transition-today',
    note: "Transition to Today, the blind pulled down to the sun's quarter. The search box drops as it leaves and the wordmark comes from above, which is the direction the edge is going; the rings open outermost first, riding down with it.",
    at: ROUTE.settings,
    act: tab('home'),
    sun: true
  },
  {
    name: 'settings-close',
    note: "Today to Settings, which has no field: the blind closes to nothing. Round two also fixes the sideways jump - a collapsed field has no bleed, so its blind is narrower and inset, and naming it dragged the whole blind 20px right for the length of the navigation.",
    at: ROUTE.home,
    act: '[data-home-gear]',
    sun: true
  },
  {
    name: 'settings-open',
    note: "Back out of Settings to Today: the same run backwards, the blind opening from nothing with everything printed on it riding down.",
    at: ROUTE.home,
    enter: '[data-home-gear]',
    act: 'back',
    sun: true
  },
  {
    name: 'deep-push',
    note: "A deep push, Transition into body measurements: the screens take their shared axis underneath while the blind slides, the search box leaves and the back control and title arrive on it.",
    at: ROUTE.settings,
    act: 'a[href="/body/measurements"]'
  },
  {
    name: 'deep-back',
    note: "The return, and the one that was broken. The field vanished for the whole transition because the hub it came back to had been scrolled to reach the row, so its field - and the blind hanging from it - sat above the window while the group held one box for both sides. A scrolled screen now contributes no blind at all and the other side closes to nothing, which is what that screen shows; this scene reaches its row without scrolling, so the blind slides as it should.",
    at: ROUTE.settings,
    enter: 'a[href="/body/measurements"]',
    act: 'back'
  }
];

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

const app = await preview({ preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const browser = await launchChromium();

async function open(reducedMotion) {
  const context = await browser.newContext({
    viewport: PHONE,
    deviceScaleFactor: 1,
    reducedMotion
  });
  /* The storage warning fires on every load in headless Chromium and
     animates on a clock of its own. Hidden rather than removed, because a
     toast removed from the DOM is one the app may put back mid-scene. */
  await context.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style');
      style.textContent = '[data-toast]{display:none !important}';
      document.head.append(style);
    });
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => console.error('page error:', e.message));
  return { context, page };
}

/* `reducedMotion: 'no-preference'` explicitly: headless Chromium answers
   `prefers-reduced-motion: reduce` by default, which clamps every duration
   to 1ms and records a blank flipbook. The last pass turns it back on
   deliberately, which is the reduced-motion criterion. */
const { page } = await open('no-preference');
const cdp = await page.context().newCDPSession(page);
const scenes = [];

const settle = async (p, path) => {
  await p.goto(`${base}${path}`, { waitUntil: 'networkidle' });
  await p.waitForSelector('[data-app-root][data-boot="ready"]');
  if (await p.locator('[data-leave-setup]').count()) {
    await p.locator('[data-leave-setup]').click();
    await p.waitForSelector('[data-home-hello]');
    await p.goto(`${base}${path}`, { waitUntil: 'networkidle' });
    await p.waitForSelector('[data-app-root][data-boot="ready"]');
  }
  await p.evaluate(() => {
    for (const toast of document.querySelectorAll('[data-toast]')) toast.remove();
    document.querySelector('.demo-bar')?.remove();
    document.body.classList.remove('has-demo-bar');
  });
};

/* Palette and theme come from the real controls, and a goto resets a
   hand-set data-theme, so both are set and then navigated away from. One
   palette and one theme for the whole run: what this ticket changed is
   where an edge is on a given frame, which is the same arithmetic in all
   eight palettes. */
const dress = async (p, theme) => {
  await settle(p, '/settings');
  await p.locator('[data-palette-pick="trans"]').click();
  await p.locator(`[data-segment="${theme}"]`).click();
  await p.waitForFunction((want) => document.documentElement.dataset.theme === want, theme);
};

/** Rests the page on the scene's origin. A scene that goes back has to walk
    in through the app first: a `goto` is a fresh boot, and there is no entry
    behind a fresh boot to go back to. */
async function rest(p, scene) {
  await settle(p, scene.at);
  if (scene.enter) {
    await p.waitForTimeout(400);
    await p.locator(scene.enter).first().click();
    await p.waitForTimeout(600);
  }
  await p.waitForTimeout(500);
}

/* Both gestures happen inside the page, so the trace's own clock starts at
   the gesture rather than a round trip before it, and the recorded run is
   the same call as the measured one. */
const fire = (p, scene) =>
  scene.act === 'back'
    ? p.evaluate(() => history.back())
    : p.evaluate((sel) => document.querySelector(sel).click(), scene.act);

/** Every frame of the transition, read off the pseudo elements the browser
    is painting: where the blind's bottom edge is, how far the content under
    it is still offset by, and - where Today is one side of the scene - what
    each of the sun's rings is scaled to.

    The click happens inside the page so that t=0 really is the click rather
    than the round trip before it, except on a back, which has to come from
    the harness; there the clock starts a frame earlier and the trace says
    so through `nav` going live. */
async function trace(p, scene) {
  return p.evaluate(
    async ({ act, ms, sun, restOut }) => {
      const read = (pseudo, prop) =>
        getComputedStyle(document.documentElement, pseudo)?.getPropertyValue(prop) ?? '';
      const px = (value) => {
        const found = /(-?[\d.]+)px/.exec(value ?? '');
        return found ? Math.round(Number(found[1]) * 10) / 10 : null;
      };
      /* The clip's bottom inset is how much of the blind is cut off, and
         the blind is one window tall, so the edge is the window less the
         cut - which is the field's height on that frame. */
      const edgeOf = (side) => {
        const clip = read(`::view-transition-${side}(blind)`, 'clip-path');
        const cut = /inset\(0px 0px (-?[\d.]+)px/.exec(clip)?.[1];
        return cut === undefined ? null : Math.round((innerHeight - Number(cut)) * 10) / 10;
      };
      /* The follow is written as `translate`, so what is left of it reads
         straight off the incoming screen's own image. */
      const contentOf = () => {
        const value = read('::view-transition-new(screen)', 'translate');
        const parts = value.split(/\s+/);
        return parts.length > 1 ? px(parts[1]) : 0;
      };
      /* What a mark printed on the blind is doing on this frame: the ride
         it takes with the edge (`translate`) and the travel it makes of its
         own as it leaves or arrives (the translateY inside `transform`).
         Read off the pseudo elements, so it is the animation's own number
         rather than a claim about the stylesheet. */
      const markOf = (name) => {
        const side = name.startsWith('fp-a') ? 'old' : 'new';
        const ride = px(read(`::view-transition-${side}(${name})`, 'translate').split(/\s+/)[1]);
        const matrix = read(`::view-transition-${side}(${name})`, 'transform');
        const parts = /matrix\(([^)]+)\)/.exec(matrix)?.[1].split(',').map(Number);
        return { ride: ride ?? 0, travel: parts ? Math.round(parts[5] * 10) / 10 : 0 };
      };
      const ringsOf = () => {
        const out = [];
        for (const side of ['old', 'new']) {
          for (let i = 0; i < 8; i++) {
            const scale = read(`::view-transition-${side}(sun-${side === 'old' ? 'a' : 'b'}-${i})`, 'scale');
            if (!scale || scale === 'none') continue;
            out.push({ side, ring: i, scale: Math.round(Number(scale) * 100) / 100 });
          }
        }
        return out;
      };

      const out = [];
      /* Caught while they are still published: the carry takes its own
         variables off the root the moment the transition settles. */
      let from = null;
      let to = null;
      let ease = '';
      const t0 = performance.now();
      if (act === 'back') history.back();
      else document.querySelector(act).click();
      return await new Promise((done) => {
        const tick = () => {
          const now = performance.now() - t0;
          const root = getComputedStyle(document.documentElement);
          if (root.getPropertyValue('--blind-to')) {
            from = px(root.getPropertyValue('--blind-from'));
            to = px(root.getPropertyValue('--blind-to'));
            ease = root.getPropertyValue('--blind-ease').trim();
          }
          const field = document.querySelector('[data-screen-field], [data-home-field]');
          out.push({
            at: Math.round(now),
            nav: document.documentElement.dataset.nav ?? '',
            /* The first thing painted on each field - Today's wordmark,
               Journal's month strip, a deep screen's back control. */
            markOut: markOf('fp-a-0'),
            markIn: markOf('fp-b-0'),
            /* What the page itself is resting at, which is the only thing
               left to read once the clamp has taken the transition to 1ms
               and its pseudo elements with it. */
            live: field ? Math.round(field.getBoundingClientRect().height * 10) / 10 : 0,
            edge: edgeOf('new') ?? edgeOf('old'),
            content: contentOf(),
            ...(sun ? { rings: ringsOf() } : {})
          });
          if (now < ms) requestAnimationFrame(tick);
          else done({ from, to, ease, restOut, frames: out });
        };
        requestAnimationFrame(tick);
      });
    },
    { act: scene.act, ms: TRACE_MS, sun: !!scene.sun, restOut: await restingMark(p) }
  );
}

/** Where the first thing painted on the field rests, as its bottom edge in
    window coordinates, and where the field's own bottom edge is. The two
    together are the distance a mark is printed above the edge, which is
    what riding the blind is supposed to hold constant. */
function restingMark(p) {
  return p.evaluate(() => {
    const field = document.querySelector('[data-screen-field], [data-home-field]');
    const mark = field?.querySelector('[data-field-part]');
    if (!field || !mark) return null;
    const round = (n) => Math.round(n * 10) / 10;
    return {
      mark: round(mark.getBoundingClientRect().bottom),
      edge: round(field.getBoundingClientRect().bottom)
    };
  });
}

/** Records everything the page paints for `SCENE_MS`, with `act` fired one
    frame in - so the first frame is the resting state the motion starts
    from rather than the middle of it. */
async function record(name, act, p = page, session = cdp) {
  const frames = [];
  const started = Date.now();
  const onFrame = async ({ data, sessionId }) => {
    frames.push({ at: Date.now() - started, data });
    try {
      await session.send('Page.screencastFrameAck', { sessionId });
    } catch {
      /* The screencast was stopped between this frame and its ack, which is
         the ordinary way a scene ends. */
    }
  };
  session.on('Page.screencastFrame', onFrame);
  await session.send('Page.startScreencast', { format: 'jpeg', quality: 70, everyNthFrame: 1 });
  await p.waitForTimeout(80);
  const clickAt = Date.now() - started;
  await act();
  await p.waitForTimeout(SCENE_MS);
  await session.send('Page.stopScreencast');
  session.off('Page.screencastFrame', onFrame);

  const written = [];
  for (const [i, frame] of frames.entries()) {
    const file = `${name}-${String(i).padStart(3, '0')}.jpg`;
    await writeFile(resolve(outDir, file), Buffer.from(frame.data, 'base64'));
    written.push({ file, at: frame.at });
  }
  console.log(`${name}: ${written.length} frames over ${written.at(-1)?.at ?? 0}ms, click at ${clickAt}ms`);
  return { frames: written, clickAt };
}

try {
  await dress(page, 'light');

  for (const scene of SCENES) {
    /* Measured first, because the trace's own click has to start from a
       settled screen and a screencast run leaves the page on the
       destination anyway. */
    await rest(page, scene);
    const measured = await trace(page, scene);
    /* Where the arriving screen's first mark rests, measured once it has:
       during the transition it is a photograph, and its own animation is
       what the trace above carries. */
    measured.restIn = await restingMark(page);
    const travelled = Math.abs((measured.to ?? 0) - (measured.from ?? 0));
    /* Past the mark in the direction the edge was travelling, which is the
       only direction an overshoot can be: an opening blind's furthest frame
       is its lowest, a closing one's is its highest, and every frame before
       the mark is reached is short of it rather than past it. */
    const edges = measured.frames.map((f) => f.edge).filter((e) => e !== null);
    const opens = (measured.to ?? 0) > (measured.from ?? 0);
    const past =
      measured.to === null || !edges.length
        ? 0
        : Math.max(
            opens ? Math.max(...edges) - measured.to : measured.to - Math.min(...edges),
            0
          );
    console.log(
      `${scene.name}: ${measured.from} to ${measured.to}px, ${travelled}px of travel, ` +
        `${Math.round(past * 10) / 10}px past the mark`
    );

    await rest(page, scene);
    const { frames, clickAt } = await record(scene.name, () => fire(page, scene));

    scenes.push({
      name: scene.name,
      note: scene.note,
      crop: CROP,
      trace: { ...measured, travelled, past: Math.round(past * 10) / 10 },
      clickAt,
      frames
    });
  }

  /* The reduced-motion criterion, which is a measurement rather than a
     flipbook: with the clamp on there is nothing to flip through, and what
     has to be true is that the blind is already at its new height on the
     first frame after the click, with the content on its own mark and no
     ring left half open. A context of its own, so the clamp arrives the way
     a person's own setting does. */
  const reduced = await open('reduce');
  await dress(reduced.page, 'light');
  const scene = SCENES[0];
  await rest(reduced.page, scene);
  const clamped = await trace(reduced.page, scene);
  await rest(reduced.page, scene);
  const clampedCdp = await reduced.page.context().newCDPSession(reduced.page);
  const clampedFrames = await record(
    'reduced-motion',
    () => fire(reduced.page, scene),
    reduced.page,
    clampedCdp
  );
  await reduced.context.close();
  const first = clamped.frames.find((f) => f.nav) ?? clamped.frames[0];
  console.log(
    `reduced motion: first frame at ${first.at}ms - edge ${first.edge}, ` +
      `content offset ${first.content}, target ${clamped.to}px`
  );
  scenes.push({
    name: 'reduced-motion',
    note: "The clamp on: the blind cuts to its new height, the content is already on its mark, and the sun cuts rather than closing. There is nothing to flip through, which is the point.",
    reduced: true,
    crop: CROP,
    trace: { ...clamped, travelled: 0, past: 0 },
    clickAt: clampedFrames.clickAt,
    frames: clampedFrames.frames
  });
} finally {
  await writeFile(
    resolve(outDir, 'manifest.json'),
    JSON.stringify({ sceneMs: SCENE_MS, scenes }, null, 2)
  );
  await browser.close();
  await app.close();
}

console.log(`\nframes in ${outDir}`);
