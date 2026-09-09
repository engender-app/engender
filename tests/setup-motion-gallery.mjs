/* Frame-by-frame captures of setup's motion (redesign ticket 33,
   DIRECTION.md rules 10, 12 and 13, ADR-0078).

   One grammar across the flow, and every movement in it is recorded rather
   than a signature moment: a still cannot review a transition, and this
   ticket's own acceptance asks for a flipbook per movement with frame
   numbers and millisecond stamps.

   - a step forward: the field's bottom edge pulled down to the height the
     next step needs, the question printed on it leaving and arriving with
     it, the line and the answers riding it, and each answer's block
     clipping open a stagger step after the one above;
   - a step back: the same edge pulled up, which is the direction that must
     not run past its mark;
   - a flag picked: the 3px frame landing on the block that took the tap and
     the sun redrawing ring by ring over the flag it is leaving;
   - a row ticked: the box filling and the mark drawing itself in;
   - a digit typed on the pad: the dot landing and the key's own press;
   - the finish handing over to the app.

   Then the same six with reduced motion set, which is the contract's own
   box: everything substitutes and nothing is deleted.

   What is sampled beside the frames is what says whether a frame was
   honest. The edge, the riders' translate and the question's opacity are
   read on every animation frame, so "no frame shows an element in neither
   place" is a number rather than an impression - and the same read is what
   catches a single-frame teleport, which is the defect this ticket is not
   allowed to ship.

   Frames land as JPEGs plus a manifest.json in the shape
   tests/panel-motion-flipbook.mjs reads.

   Run: node tests/setup-motion-gallery.mjs [outDir] [--only a,b,c]
   Needs a demo build on disk (VITE_DEMO=1 npm run build); it serves the
   cwd's `build/`, so the same scenes can be recorded off another checkout
   by running it with that checkout as cwd. */
import { preview } from 'vite';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './browser-harness.mjs';
import { SETUP_STEPS } from './setup-flow.mjs';
import { startSampling, stopSampling } from './motion-sampling.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const argv = process.argv.slice(2);
const onlyAt = argv.indexOf('--only');
const only = onlyAt >= 0 ? new Set(argv.splice(onlyAt, 2)[1].split(',')) : null;
const outDir = resolve(argv[0] ?? resolve(root, '.claude/setup-motion'));

/** --dur-slow is 380ms and six rows of --stagger-step add 300 on top of the
    --dur-fast the run waits for the outgoing step; 1000ms shows the last
    block land and hold still. */
const SCENE_MS = 1000;
/** The sun's own entrance is --dur-authored, 700ms, and the ring stagger
    adds 660 on a seven-stripe flag. */
const SUN_MS = 1500;
const VIEWPORT = { width: 390, height: 844 };

const ORDER = SETUP_STEPS;

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

const app = await preview({ preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const browser = await launchChromium();
const scenes = [];

/** One browser context per motion setting: headless Chromium answers
    prefers-reduced-motion with `reduce` by default, which the shell reads
    into html[data-a11y-motion], and the app's own state lives in the
    context, so each one seeds its own journal. */
async function open(reducedMotion) {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    reducedMotion
  });
  await context.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style');
      /* The demo bar is review chrome, a third of the viewport at 390px,
         and not in the build being signed off. Hidden rather than removed,
         because every scene reloads and a removed bar comes straight back;
         the body class it sets makes the frame a flex column, so that goes
         with it. */
      style.textContent =
        '[data-toast]{display:none !important}' +
        '.demo-bar{display:none !important}' +
        'body.has-demo-bar{display:block !important;height:auto !important}';
      document.head.append(style);
    });
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => console.error('page error:', e.message));
  const cdp = await context.newCDPSession(page);
  return { context, page, cdp };
}

const settle = async (page, path) => {
  await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]');
  if (await page.locator('[data-leave-setup]').count()) {
    await page.locator('[data-leave-setup]').click();
    await page.waitForSelector('[data-home-hello]');
    await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-app-root][data-boot="ready"]');
  }
};

const dress = async (page, palette, theme) => {
  await settle(page, '/settings');
  await page.locator(`[data-palette-pick="${palette}"]`).click();
  await page.locator(`[data-segment="${theme}"]`).click();
  await page.waitForFunction(
    ([p, t]) =>
      document.documentElement.dataset.palette === p && document.documentElement.dataset.theme === t,
    [palette, theme]
  );
};

/** First run, walked forward to `target`, the name typed on the way.
    The jump is set on the element rather than through selectOption, which
    waits for a control this context's stylesheet has hidden: the demo bar
    is review chrome and is not in the build being signed off, so the
    handler is all this needs. */
const stepTo = async (page, target) => {
  await settle(page, '/');
  await page.locator('#demo-jump').evaluate((el) => {
    el.value = 'first-run';
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForSelector('[data-next]');
  for (const step of ORDER) {
    await page.waitForTimeout(500);
    if (step === 'name') await page.locator('#ob-name').fill('Ola');
    if (step === target) return;
    await page.locator('[data-next]').click();
  }
};

/* The edge, and everything that is supposed to be riding it, per frame.

   `edge` is where the field's paint is cut off, read off the clip the paint
   actually carries rather than off the property that feeds it, so a clip
   that failed to interpolate reads as a stuck number here. `fieldBox` is
   the box that measures the field, which jumps to its new height on the
   frame of the tap by design - the edge is what covers that jump, so the
   two disagreeing through the middle of a scene is the mechanism working.

   `askY` and `belowY` are the two riders' translate. `questions` is every
   question in the DOM with its opacity: two of them for the length of the
   change and never two at full opacity, which is what "no frame carries two
   of them" means as a number. `blocks` is each answer's arrival clip. */
const READ_STEP = `
  const paint = document.querySelector('.setup-paint');
  const ask = document.querySelector('.setup-ask');
  const below = document.querySelector('.setup-below');
  const field = document.querySelector('[data-setup-field]');
  const answers = document.querySelector('[data-setup-answers]');
  const foot = document.querySelector('.setup-foot');
  const setup = document.querySelector('.setup');
  const clip = paint ? getComputedStyle(paint).clipPath : '';
  const rowBlocks = [...document.querySelectorAll('[data-setup-answers] .kit-row-ico, [data-setup-answers] .kit-check, [data-setup-answers] .swatch-preview')];
  return {
    clip,
    /* Where the field's paint is cut off, off the registered property the
       clip reads per frame: a property that failed to interpolate reads as
       a stuck number here rather than as a smooth curve. */
    edge: Math.round(parseFloat(getComputedStyle(setup).getPropertyValue('--blind-edge')) || 0),
    fieldBox: Math.round(field ? field.getBoundingClientRect().height : 0),
    askY: ask ? getComputedStyle(ask).translate : null,
    belowY: below ? getComputedStyle(below).translate : null,
    answersTop: Math.round(answers ? answers.getBoundingClientRect().top : 0),
    footTop: Math.round(foot ? foot.getBoundingClientRect().top : 0),
    questions: [...document.querySelectorAll('[data-setup-question]')].map((q) => ({
      text: q.textContent.trim().slice(0, 18),
      opacity: Number(getComputedStyle(q).opacity).toFixed(2),
      y: Math.round(q.getBoundingClientRect().top)
    })),
    blocks: rowBlocks.slice(0, 8).map((b) => getComputedStyle(b).clipPath)
  };`;

/* A flag picked: where the frame is on its way to the block's edge, and how
   many suns are in the DOM with what their rings measure. Two suns for the
   length of the redraw, and the flag being left is the one underneath. */
const READ_FLAG = `
  const chosen = document.querySelector('.palette-swatch.is-active .swatch-preview');
  const suns = [...document.querySelectorAll('.setup-sun-draw')];
  return {
    outlineOffset: chosen ? getComputedStyle(chosen).outlineOffset : null,
    outlineColor: chosen ? getComputedStyle(chosen).outlineColor : null,
    suns: suns.length,
    ringWidths: suns.map((s) =>
      [...s.querySelectorAll('.sun i')].slice(0, 3).map((i) => Math.round(i.getBoundingClientRect().width))
    ),
    zIndex: suns.map((s) => getComputedStyle(s).zIndex)
  };`;

/* A row ticked: the box's fill and the mark's own draw, which is a dash
   offset running to nothing. */
const READ_TICK = `
  const row = document.querySelector('[data-list-row="__ROW__"]');
  const boxes = [row?.querySelector('.kit-check')].filter(Boolean);
  return {
    ticked: boxes.map((b) => b.classList.contains('is-ticked')),
    fills: boxes.map((b) => getComputedStyle(b).backgroundColor),
    marks: boxes.map((b) => {
      const m = b.querySelector('.kit-check-mark');
      return m ? getComputedStyle(m).strokeDashoffset : null;
    })
  };`;

/* The handover, which is a navigation and so has nothing in the DOM to
   read: setup's field is gone by the time it has finished moving. What
   moves is the blind's own pseudo element, and its clip is where the edge
   is on that frame - the same read ticket 28's recorder takes, and the only
   one that can say whether the field travelled as one object or was
   replaced by another (Alicja, on this ticket's own renders: "the field
   must always stay a single object that transitions to other states only by
   moving up or down"). Both sides are read: one name across the navigation
   means the old and the new pseudo carry the same clip on every frame, and
   two different numbers would mean two fields. */
const READ_HANDOVER = `
  const read = (pseudo, prop) =>
    getComputedStyle(document.documentElement, pseudo)?.getPropertyValue(prop) ?? '';
  const edgeOf = (side) => {
    const clip = read('::view-transition-' + side + '(blind)', 'clip-path');
    const cut = /inset\\(0px 0px (-?[\\d.]+)px/.exec(clip)?.[1];
    return cut === undefined ? null : Math.round(innerHeight - Number(cut));
  };
  const px = (value) => {
    const parts = String(value).split(/\\s+/);
    const found = /(-?[\\d.]+)px/.exec(parts[1] ?? '');
    return found ? Math.round(Number(found[1])) : null;
  };
  return {
    nav: document.documentElement.dataset.nav ?? null,
    edgeOld: edgeOf('old'),
    edgeNew: edgeOf('new'),
    contentRide: px(read('::view-transition-new(screen)', 'translate')),
    questionRide: px(read('::view-transition-old(fp-a-1)', 'translate')),
    questionFade: read('::view-transition-old(fp-a-1)', 'opacity')
  };`;

/* A digit typed: which dots are filled and what each is scaled to. */
const READ_PAD = `
  const dots = [...document.querySelectorAll('.pin-dot')];
  return {
    filled: dots.map((d) => d.classList.contains('is-filled')),
    scales: dots.map((d) => getComputedStyle(d).transform),
    keyPress: getComputedStyle(document.querySelector('[data-key="1"]')).transform
  };`;

/** Records everything the page paints for SCENE_MS, with `act` fired one
    frame in, so the first frame is the resting state the motion starts
    from. `read`, if given, is sampled per animation frame across the same
    window and stored beside the frames. */
async function record(page, cdp, name, note, act, read, options = {}) {
  const sceneMs = options.ms ?? SCENE_MS;
  if (only && !only.has(name)) {
    await act();
    await page.waitForTimeout(sceneMs);
    return;
  }
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
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 70, everyNthFrame: 1 });
  await page.waitForTimeout(80);
  if (read) await startSampling(page, read);
  await act();
  await page.waitForTimeout(sceneMs);
  await cdp.send('Page.stopScreencast');
  cdp.off('Page.screencastFrame', onFrame);
  let samples;
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
  scenes.push({ name, note, frames: written, samples });
  console.log(`${name}: ${written.length} frames over ${written.at(-1)?.at ?? 0}ms`);
}

/** Everything both contexts record, so the reduced-motion pass is the same
    six scenes rather than a second script's guess at them. */
async function scenesFor(page, cdp, tag, notes) {
  /* ---- a step forward. Flag to scales: the field grows 168 to 272 and
     eight rows arrive under it, which is the longest travel and the
     busiest arrival in the flow. ---- */
  await stepTo(page, 'flag');
  await page.waitForTimeout(400);
  await record(
    page,
    cdp,
    `${tag}step-forward`,
    notes.stepForward,
    () => page.locator('[data-next]').click(),
    READ_STEP
  );

  /* ---- a step back, off the same pair: the edge pulled up, which is the
     direction an overshoot would uncover page under. ---- */
  await page.waitForTimeout(300);
  await record(
    page,
    cdp,
    `${tag}step-back`,
    notes.stepBack,
    () => page.locator('[data-back]').click(),
    READ_STEP
  );

  /* ---- a flag picked. Agender, from trans: seven rings against five, so
     the redraw is the longest one a flag can ask for. ---- */
  await page.waitForTimeout(400);
  await record(
    page,
    cdp,
    `${tag}flag-picked`,
    notes.flagPicked,
    () => page.locator('[data-palette-pick="agender"]').click(),
    READ_FLAG,
    { ms: SUN_MS }
  );
  await page.locator('[data-palette-pick="trans"]').click();
  await page.waitForTimeout(SUN_MS);

  /* ---- a row ticked, on the scales step. Whichever row is not ticked
     already, since the demo's own set is what the list arrives with. ---- */
  await stepTo(page, 'scales');
  await page.waitForTimeout(500);
  const untickedRow = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('[data-setup-answers] [data-list-row]')];
    const row = rows.find((r) => !r.querySelector('.kit-check.is-ticked'));
    return row?.dataset.listRow ?? null;
  });
  await record(
    page,
    cdp,
    `${tag}row-ticked`,
    notes.rowTicked,
    () => page.locator(`[data-list-row="${untickedRow}"]`).first().click(),
    READ_TICK.replace('__ROW__', untickedRow ?? ''),
    { ms: 700 }
  );

  /* ---- the finish handing over to the app. ---- */
  await stepTo(page, 'done');
  await page.waitForTimeout(500);
  await record(
    page,
    cdp,
    `${tag}finish`,
    notes.finish,
    () => page.locator('[data-finish]').click(),
    READ_HANDOVER,
    { ms: 1400 }
  );

  /* ---- a digit on the pad. Its own address rather than setup's, because
     the demo journal already has an access mode and setup's lock step falls
     to its toggle; it is the same drawing either way (rule 13). ---- */
  await settle(page, '/settings/access-mode');
  await page.locator('[data-list-row="pin"]').click();
  await page.waitForSelector('[data-access-continue]');
  await page.locator('[data-access-continue]').click();
  await page.waitForSelector('[data-pin-pad]');
  await page.waitForTimeout(400);
  await record(
    page,
    cdp,
    `${tag}pad-digit`,
    notes.padDigit,
    () => page.locator('[data-key="1"]').click(),
    READ_PAD,
    { ms: 700 }
  );
}

try {
  {
    const { context, page, cdp } = await open('no-preference');
    await dress(page, 'trans', 'light');
    await scenesFor(page, cdp, '', {
      stepForward:
        "A step forward, flag to scales. The field's bottom edge is pulled from 168 to 272 and runs past its mark before it settles; the question printed on it fades out where it stands and the next one fades in where it stands, both riding the edge down; the line and the answers ride the same clock; each row's box clips open from its own left edge, one --stagger-step after the row above, and the whole run waits for the outgoing step to be gone. The foot does not move.",
      stepBack:
        'The same pair backwards: the edge is pulled up on --ease-out-soft with no overshoot, because an edge that ran past its mark on the way up would uncover a band of page between itself and the content rising under it.',
      flagPicked:
        "Agender picked from trans. The 3px frame closes in from 6px outside the block onto its own edge, which is the tap's answer at the size of the block that took it. The sun redraws ring by ring, outermost first, over the flag it is leaving - which is held underneath for the length of the redraw rather than removed, so no frame is drawn without a sun on it.",
      rowTicked:
        "A scale ticked: the box's colour arrives flat over --dur-fast and the mark is drawn onto it over --dur-slow, so the two read as the mark being put there rather than as one event.",
      finish:
        "The finish handing over. The field is one object the whole way: its edge is pulled from the finish step's height up to Home's, with the question printed on it fading where it stands and Home's content rising under it on the same clock. The sun holds still inside both snapshots, because it has grown one step's worth per step to exactly the scale Home draws it at.",
      padDigit:
        "A digit typed: the dot lands on --ease-press while its colour arrives flat, and the key answers the finger with the kit's own press depth."
    });
    await context.close();
  }

  {
    const { context, page, cdp } = await open('reduce');
    await dress(page, 'trans', 'light');
    await scenesFor(page, cdp, 'reduce-', {
      stepForward:
        'The same step forward with reduce-motion set: the edge cuts to its new height, the question and the answers crossfade over --dur-crossfade rather than travelling, and every block is whole in the first frame it is drawn. Substituted, not deleted.',
      stepBack: 'The same step back with reduce-motion set: the edge cuts and the two questions crossfade.',
      flagPicked:
        'The same pick with reduce-motion set: the frame is on the block in the next frame, the rings are simply there in the new flag, and there is nothing for the flag underneath to cover.',
      rowTicked: 'The same tick with reduce-motion set: the mark is simply there and the box still changes colour.',
      finish: 'The same handover with reduce-motion set: the two screens crossfade.',
      padDigit: 'The same digit with reduce-motion set: the dot is filled in the next frame.'
    });
    await context.close();
  }
} finally {
  await writeFile(
    resolve(outDir, 'manifest.json'),
    JSON.stringify({ sceneMs: SCENE_MS, scenes }, null, 2)
  );
  await browser.close();
  await app.close();
}
