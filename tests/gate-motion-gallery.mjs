/* Frame-by-frame captures of the gates' motion (redesign ticket 34,
   DIRECTION.md rules 10 and 15, ADR-0078).

   The ticket's own acceptance asks for a flipbook per movement with frame
   numbers and millisecond stamps, and for one of them - the unlock - to show
   that the app opens rather than that this screen is replaced. A still
   cannot review any of that.

   - the unlock: the secret accepted, the field opening from the gate's title
     onto the height the screen behind it draws, everything printed on the
     field riding the edge down and the page following it. Recorded on both
     shapes that have a control to type into, because the passphrase's field
     and the PIN's pad leave the screen differently;
   - a digit on the pad at a gate: the dot landing, the key answering the
     finger;
   - a refusal: the row shaking once and giving the digits back;
   - the throttle: the wait draining while the line counts it down;
   - a mode switch inside the access-mode module, in the gate that mounts it:
     the field's own edge travelling from the list of modes to the screen the
     chosen mode needs. Off the gate fixture rather than the app, because
     that gate is a boot state with no URL (see modeSwitchScene).

   Then the same five with reduced motion set, which is the contract's own
   box: everything substitutes and nothing is deleted (ADR-0078).

   What is sampled beside the frames is what says whether a frame was honest.
   The unlock is a view transition, so the live DOM is not what is painted -
   the blind's own pseudo elements are, and both sides of them are read, since
   one name across the change means the old and the new clip carry the same
   number on every frame and two numbers would mean two fields. The four
   state changes inside a settled gate run no transition, so there the tree is
   what is painted and the dots, the keys and the rail are read directly.

   Frames land as JPEGs plus a manifest.json in the shape
   tests/panel-motion-flipbook.mjs reads.

   Run: node tests/gate-motion-gallery.mjs [outDir] [--only a,b,c]
   Needs a demo build on disk (VITE_DEMO=1 npm run build); it serves the
   cwd's `build/`, so the same scenes can be recorded off another checkout by
   running it with that checkout as cwd. */
import { createServer, preview } from 'vite';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './browser-harness.mjs';
import { startSampling, stopSampling } from './motion-sampling.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const argv = process.argv.slice(2);
const onlyAt = argv.indexOf('--only');
const only = onlyAt >= 0 ? new Set(argv.splice(onlyAt, 2)[1].split(',')) : null;
const outDir = resolve(argv[0] ?? resolve(root, '.claude/gate-motion'));

/** --dur-slow is 380ms and the settle runs past its mark before it comes
    back; 1200ms shows the edge arrive and hold still. */
const SCENE_MS = 1200;
/** The first penalty is 1000ms (lock/throttle.ts), and the line has to be
    seen to reach zero and let go of the pad. */
const THROTTLE_MS = 1800;
const VIEWPORT = { width: 390, height: 844 };

/** The four digits the PIN scenes set and then type. */
const PIN = '1234';
const WRONG = '9999';

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

const app = await preview({ preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
/* The gate fixture's own dev server, for the one scene the app has no
   address for (see modeSwitchScene). */
const fixture = await createServer({
  configFile: `${here}/browser-tier/browser-tier.vite.config.ts`,
  server: { port: 0 }
});
await fixture.listen();
const fixtureUrl = `http://localhost:${fixture.config.server.port}/gates.html`;
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
      /* The demo bar is review chrome, a third of the viewport at 390px, and
         not in the build being signed off. Hidden rather than removed,
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

/** Lock-on-leave, once, so every scene below can lock by dispatching the
    event the listener waits for. A dispatched blur rather than a real one for
    the reason walkthrough flow 18 gives: headless Chromium has no second
    window to hand the focus to, and what is wanted is the lock, not the
    focus. */
const armLock = async (page) => {
  await settle(page, '/settings/security');
  const toggle = page.getByRole('switch', { name: 'Lock on leave' });
  if ((await toggle.getAttribute('aria-checked')) !== 'true') await toggle.click();
  await page.waitForTimeout(200);
};

/** The app locked, on whichever screen `path` is - which is the screen the
    unlock opens back onto, since nothing in the lock path navigates. Home,
    for these scenes: it is the field the app opens onto for anybody who
    locked while looking at it, and the only one with the sun on it. */
const lockOn = async (page, path) => {
  await settle(page, path);
  await page.waitForTimeout(300);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.waitForSelector('[data-applock]');
  await page.waitForTimeout(400);
};

/** Moves the journal onto a PIN, through the module's own screen: the demo
    journal is on a passphrase, and the pad has no other address in a demo
    build (the cold-start gates are boot states). */
const setPin = async (page) => {
  await settle(page, '/settings/access-mode');
  await page.locator('[data-list-row="pin"]').click();
  await page.waitForSelector('[data-access-chosen="pin"]');
  await page.locator('[data-access-continue]').click();
  await page.waitForSelector('[data-access-secret="pin"]');
  await typePin(page, PIN);
  await typePin(page, PIN);
  await page.waitForSelector('[data-security-list]', { timeout: 20000 });
};

/** The cold-start PIN gate, which is the gate most people meet most often:
    a reload once the journal is on a PIN is all it takes, because the gate
    is a boot state rather than a screen the app navigates to. Not
    `settle`, which waits for a boot that deliberately does not reach `ready`
    until the four digits are right. */
const coldPinGate = async (page) => {
  await page.goto(`${base}/`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-pin-pad]');
  await page.waitForTimeout(400);
};

const typePin = async (page, digits) => {
  for (const digit of digits) {
    await page.locator(`[data-key="${digit}"]`).click();
    await page.waitForTimeout(90);
  }
};

/* The unlock, which is a view transition and so has nothing in the DOM to
   read: the gate is gone by the time the field has finished moving. What
   moves is the blind's own pseudo element, and its clip is where the edge is
   on that frame - the same read ticket 28's recorder takes, and the only one
   that can say whether the field travelled as one object or was replaced by
   another (Alicja, on ticket 33's renders: "the field must always stay a
   single object that transitions to other states only by moving up or
   down"). Both sides are read, and the two numbers agreeing on every frame
   is what "one object" means as a number.

   `titleRide` and `titleFade` are the gate's own title, printed on the field:
   it rides the edge down on the blind's clock while it fades over
   --dur-fast, and the incoming screen's own title comes in the same way, so
   what a person sees on the wordmark shape is one word travelling. */
const READ_UNLOCK = `
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
    titleRide: px(read('::view-transition-old(fp-a-0)', 'translate')),
    titleFade: read('::view-transition-old(fp-a-0)', 'opacity'),
    arrivingRide: px(read('::view-transition-new(fp-b-0)', 'translate')),
    arrivingFade: read('::view-transition-new(fp-b-0)', 'opacity'),
    gates: document.querySelectorAll('[data-gate-field]').length,
    /* The first thing the app draws that the gate could not have known
       about: a notice whose read answers after the journal opens. Its own
       height per frame, because a panel that arrives by opening its height
       is the app's grammar for a change and one that arrives whole is the
       yank Alicja named between frames 24 and 25 of this scene's first
       recording. */
    notice: Math.round(
      document.querySelector('[data-backup-notice]')?.getBoundingClientRect().height ?? 0
    )
  };`;

/* A digit typed at a gate: which dots are filled, what each is scaled to,
   and the key's own press depth. */
const READ_PAD = `
  const dots = [...document.querySelectorAll('.pin-dot')];
  const key = document.querySelector('[data-key="1"]');
  return {
    filled: dots.map((d) => d.classList.contains('is-filled')),
    scales: dots.map((d) => getComputedStyle(d).transform),
    fills: dots.map((d) => getComputedStyle(d).backgroundColor),
    keyPress: key ? getComputedStyle(key).transform : null
  };`;

/* A refusal: where the row of dots is on its shake, whether the digits came
   back, and what the status line says. The row's own translate per frame is
   the shake as a number - a refusal that cut would read as one frame at an
   offset and nothing either side of it. */
const READ_REFUSAL = `
  const dots = document.querySelector('.pin-dots');
  const status = document.querySelector('[data-pin-status]');
  return {
    rowShift: dots ? getComputedStyle(dots).transform : null,
    refused: dots ? dots.classList.contains('is-refused') : null,
    filled: [...document.querySelectorAll('.pin-dot')].map((d) => d.classList.contains('is-filled')),
    says: status ? status.textContent.trim().slice(0, 40) : null,
    state: status ? status.dataset.pinStatus : null
  };`;

/* The throttle: the rail's own scale per frame, which is the wait as a
   length, beside the seconds the line is counting down and whether the pad
   is still taking presses. */
const READ_THROTTLE = `
  const rail = document.querySelector('.pin-wait i');
  const status = document.querySelector('[data-pin-status]');
  const key = document.querySelector('[data-key="1"]');
  return {
    drain: rail ? getComputedStyle(rail).transform : null,
    railThere: Boolean(document.querySelector('.pin-wait')),
    says: status ? status.textContent.trim().slice(0, 40) : null,
    state: status ? status.dataset.pinStatus : null,
    padDisabled: key ? key.disabled : null
  };`;

/* A mode switch inside the access-mode module: the field's bottom edge
   travelling from the list of modes to the mode's own screen, with the
   heading printed on it. Read off the registered property the clip reads per
   frame - a property that failed to interpolate reads as a stuck number
   here rather than as a curve - and off the two riders' translate. */
const READ_MODE = `
  const host = document.querySelector('.step-field-host');
  const ask = document.querySelector('.step-field-ask');
  const below = document.querySelector('.step-field-below');
  const paint = document.querySelector('.step-field-paint');
  return {
    edge: Math.round(parseFloat(getComputedStyle(host ?? document.body).getPropertyValue('--blind-edge')) || 0),
    clip: paint ? getComputedStyle(paint).clipPath : null,
    askY: ask ? getComputedStyle(ask).translate : null,
    belowY: below ? getComputedStyle(below).translate : null,
    headings: [...document.querySelectorAll('.screen-title, [data-gate-title]')].map((h) => ({
      text: h.textContent.trim().slice(0, 18),
      opacity: Number(getComputedStyle(h).opacity).toFixed(2),
      y: Math.round(h.getBoundingClientRect().top)
    }))
  };`;

/** Records everything the page paints for SCENE_MS, with `act` fired one
    frame in, so the first frame is the resting state the motion starts from.
    `read`, if given, is sampled per animation frame across the same window
    and stored beside the frames. */
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
    five scenes rather than a second script's guess at them. */
async function scenesFor(page, cdp, tag, notes) {
  await armLock(page);

  /* ---- the unlock, passphrase shape. Locked on Home, which is the field
     the app opens onto and the only one with the sun on it. ---- */
  await lockOn(page, '/');
  await page.locator('#session-passphrase').fill('demo');
  await record(
    page,
    cdp,
    `${tag}unlock-passphrase`,
    notes.unlockPassphrase,
    () => page.locator('[data-session-submit]').click(),
    READ_UNLOCK,
    { ms: 1600 }
  );

  /* ---- the same moment on the PIN shape, and on the gate a cold start
     lands on rather than the mid-session lock: the two are wired
     differently, one through the boot machine and one through the lock
     store, and both have to open the app. The secret's last digit is also
     its submit here, so the app opens under the finger that was on the
     pad. ---- */
  await setPin(page);
  await coldPinGate(page);

  /* A digit first, on the gate's own pad rather than the module's: the
     drawing is the same one (rule 13) and this is the address a person
     actually meets it at. */
  await record(
    page,
    cdp,
    `${tag}pad-digit`,
    notes.padDigit,
    /* Held, not clicked. A synthetic click puts the press down and lets it
       go inside one frame, so the key's own depth - which is the half of
       this movement that answers the finger - is never painted and never
       sampled. 220ms is a short tap. */
    async () => {
      const box = await page.locator('[data-key="1"]').boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.waitForTimeout(220);
      await page.mouse.up();
    },
    READ_PAD,
    { ms: 900 }
  );
  await page.locator('[data-backspace]').click();
  await page.waitForTimeout(300);

  /* A refusal: three digits in, and the fourth is what asks. */
  await typePin(page, WRONG.slice(0, 3));
  await page.waitForTimeout(200);
  await record(
    page,
    cdp,
    `${tag}refusal`,
    notes.refusal,
    () => page.locator(`[data-key="${WRONG[3]}"]`).click(),
    READ_REFUSAL,
    { ms: 1400 }
  );

  /* The throttle, which the second wrong PIN earns (lock/throttle.ts: the
     first two are free, and the first penalty is a second). */
  await page.waitForTimeout(400);
  await typePin(page, WRONG.slice(0, 3));
  await page.waitForTimeout(200);
  await record(
    page,
    cdp,
    `${tag}throttle`,
    notes.throttle,
    () => page.locator(`[data-key="${WRONG[3]}"]`).click(),
    READ_THROTTLE,
    { ms: THROTTLE_MS }
  );

  /* The unlock on the PIN shape, once the wait it just earned has run out. */
  await page.waitForFunction(
    () => document.querySelector('[data-pin-status]')?.dataset.pinStatus !== 'throttled',
    null,
    { timeout: 15000 }
  );
  await typePin(page, PIN.slice(0, 3));
  await page.waitForTimeout(200);
  await record(
    page,
    cdp,
    `${tag}unlock-pin`,
    notes.unlockPin,
    () => page.locator(`[data-key="${PIN[3]}"]`).click(),
    READ_UNLOCK,
    { ms: 1600 }
  );

}

/** The mode switch, recorded against the gate fixture rather than the app.

    The access-mode module has two addresses and only one of them is a step:
    inside a gate it is the gate's own question, so picking a mode changes the
    title on the field and the edge travels to the height the mode's screen
    needs. Inside `/settings/access-mode` it is content on a settings screen
    with a fixed header, which does not move and is not supposed to - rule 15
    is about gates. The gate that mounts it is the first-run passphrase gate,
    which is a boot state with no URL, so the fixture is the only address it
    has (tests/browser-tier/gates.html; the components there are the real
    ones and the stylesheets are the app's own). */
async function modeSwitchScene(page, cdp, fixtureUrl, tag, note) {
  await page.goto(fixtureUrl, { waitUntil: 'networkidle' });
  await page.waitForSelector('body[data-gates-ready]', { state: 'attached' });
  await page.selectOption('select[aria-label="Scene"]', 'access-choice');
  await page.selectOption('select[aria-label="Theme"]', 'light');
  await page.waitForSelector('[data-access-modes]');
  await page.waitForTimeout(400);
  await record(
    page,
    cdp,
    `${tag}mode-switch`,
    note,
    () => page.locator('[data-list-row="passphrase"]').click(),
    READ_MODE,
    { ms: 900 }
  );
}

try {
  {
    const { context, page, cdp } = await open('no-preference');
    await dress(page, 'trans', 'light');
    await scenesFor(page, cdp, '', {
      unlockPassphrase:
        "The passphrase accepted. The field's bottom edge opens from the gate's own height to the height the screen behind it draws, on the settle that runs past its mark and comes back; the title printed on it rides down with the edge while it fades, the arriving screen's own title comes in on the same ride, and the page follows the edge down rather than appearing under it. The blind's two sides carry the same clip on every frame, which is what makes it one field opening rather than two fields swapping.",
      padDigit:
        "A digit typed at the gate: the dot lands on --ease-press while its colour arrives flat, which is the difference between a dot appearing and a dot being put there, and the key answers the finger with the kit's own press depth.",
      refusal:
        'A wrong PIN. The row shakes once and the digits are given back, and the line under it says so in words a beat later - which is what carries the refusal under reduced motion, where the shake is clamped to nothing.',
      throttle:
        'The second wrong PIN, which earns the first second of wait. The rail under the status line drains itself down over the whole remaining wait rather than being handed a width per tick, so a quarter-second countdown does not read as four steps a second, and the pad stops taking presses until it is over.',
      unlockPin:
        'The same opening on the PIN shape, where the fourth digit is the submit: the pad is still under the finger when the field starts to open.',
      modeSwitch:
        "A mode picked in the access-mode module, inside the gate that mounts it: the field's own edge travels to the height the mode's screen needs, with the title printed on it changing to that mode's name and the page riding the same clock. No transition and no navigation - one gate changing what it is asking."
    });
    await modeSwitchScene(
      page,
      cdp,
      fixtureUrl,
      '',
      "A mode picked in the access-mode module, inside the gate that mounts it: the field's own edge travels to the height the mode's screen needs, with the title printed on it changing to that mode's name and the page riding the same clock. No transition and no navigation - one gate changing what it is asking."
    );
    await context.close();
  }

  {
    const { context, page, cdp } = await open('reduce');
    await dress(page, 'trans', 'light');
    await scenesFor(page, cdp, 'reduce-', {
      unlockPassphrase:
        'The same unlock with reduce-motion set: the edge cuts to its new height and the two screens crossfade over --dur-crossfade, which sits outside the 1ms clamp on purpose. Substituted, not deleted.',
      padDigit: 'The same digit with reduce-motion set: the dot is filled in the next frame, and its colour still arrives.',
      refusal: 'The same refusal with reduce-motion set: nothing shakes, the digits are given back, and the sentence is the whole of the answer.',
      throttle:
        'The same wait with reduce-motion set: the rail is not drawn at all, because at 1ms it would empty instantly and then sit empty for the rest of a wait it is supposed to be describing. The seconds on the line are the information either way.',
      unlockPin: 'The same PIN unlock with reduce-motion set: the edge cuts and the screens crossfade.',
      modeSwitch: 'The same mode switch with reduce-motion set: the edge cuts to the new height and the two titles crossfade where they stand.'
    });
    await modeSwitchScene(
      page,
      cdp,
      fixtureUrl,
      'reduce-',
      'The same mode switch with reduce-motion set: the edge cuts to the new height and the two titles crossfade where they stand.'
    );
    await context.close();
  }
} finally {
  await writeFile(
    resolve(outDir, 'manifest.json'),
    JSON.stringify({ sceneMs: SCENE_MS, scenes }, null, 2)
  );
  await browser.close();
  await app.close();
  await fixture.close();
}
