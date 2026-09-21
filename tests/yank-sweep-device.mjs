// @ts-nocheck
/* The yank sweep, device half (ticket 100): the same scene table and the
   same style arithmetic as `tests/yank-sweep.mjs`, driven through a real
   Android phone's WebView over its devtools socket - plus a camera the
   desktop sweep has no need for.

   Why the camera. Ticket 99 round 2 found a yank whose trace was correct
   while its render was not: the styles and the pseudo elements all said
   "clipped, in place", and the phone still painted the blind a window
   tall for a frame or two. A detector that only reads styles cannot see
   that class of bug - which is the class this ticket exists to stop
   missing. So every scene here is also screencast frame by frame through
   `Page.startScreencast`, the compositor's own frames pushed from the
   renderer (FLAG_SECURE does not reach them), and a second detector reads
   the renders: a frame whose content differs from both its neighbours,
   while the neighbours agree with each other, is a transient - something
   painted that was never meant to be on screen, whatever the styles
   claimed. The style trace runs alongside and annotates rather than
   decides.

   Each scene runs under both themes and several passes (`--passes`, default
   3): a one-frame defect at 60Hz has a real chance of falling between two
   composited frames, and a transient that shows in any pass counts.

   Driven over the WebView devtools socket rather than by input taps, for
   the reason the disguise probe already wrote down: the live page is the
   authority, and the sampler's own rAF loop starts the gesture on its
   second frame so nothing has to race a tap.

   Run against a real phone with USB debugging on, by serial, after
   building and installing the demo APK (a debug build: Capacitor leaves
   its WebView debuggable there, and ticket 99 round 2 also stopped the
   debug build from setting FLAG_SECURE, so screen recordings work too):

     VITE_DEMO=1 npm run build
     npx cap sync android
     JAVA_HOME=~/.sdkman/candidates/java/21.0.12-tem \
       android/gradlew -p android :app:assembleDebug
     node tests/yank-sweep-device.mjs <serial> [path/to/app-debug.apk]

    `--scenes a,b` narrows the run, `--passes N` sets the repeats,
    `--themes light,dark` (both, by default), `--out <dir>` names the report
    directory, `--compare <report.json>` reads a desktop sweep report and
    prints the two side by side, `--prove` injects the three wrong marks and
    fails unless the style arithmetic and the camera both catch them, and
    `--dump` writes every scene's style frames as JSON alongside the report.

    `--hydration` (ticket 108) swaps the gesture scene table for the full
    screen inventory and walks it cold in both database profiles: the
    camera rolls from the navigation itself and the DOM sampler starts
    the moment boot reports ready, each for three seconds, because the
    cold-mount pops live inside the settle this script's gesture half
    deliberately waits out. `--profiles persona,empty` (both, by default)
    picks the journal states; one pass per scene by default here, three
    being a gesture-scene cost the inventory does not need. The scene
    table, thresholds and profile expressions are the shared core's, so
    the phone and the desktop cannot drift.

    The frames of any pixel finding are written as PNGs next to the report,
    named <scene>-<theme>-p<pass>-<index>{a,b,c}.png - the frame before, the
    finding, and the frame after. That triple is the evidence a person
    actually looks at; the detector exists to say which triples exist. */
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SETUP_STEPS } from './setup-flow.mjs';
import {
  DEMO_THEME_EXPRESSION,
  DIFF_EPS,
  EVIDENCE_CAP,
  EXEMPT,
  FILL_EVERY_FEATURE_EXPRESSION,
  HYDRATION_MS,
  HYDRATION_NEEDS,
  HYDRATION_PX,
  HYDRATION_SETTLE_MS,
  INIT_HIDE_DEMO_SCRIPT,
  INJECT_PROOF_EXPRESSION,
  JUMP_FIRST_RUN_EXPRESSION,
  LOCK_SETUP_EXPRESSION,
  OUTLIER_MIN,
  PROOF,
  RESET_PERSONA_EXPRESSION,
  SCENE_MS,
  SETTLE_PAGE_EXPRESSION,
  TRANSIENT_MIN,
  GAP_RATIO,
  UNLOCK_PIN_EXPRESSION,
  VT_NAMES,
  WALK_FIRST_RUN_FINISH_EXPRESSION,
  fillTokens,
  findPixelYanks,
  findYanks,
  hydrationScreensFor,
  missingProofYanks,
  pushHydrationRun,
  replySlices,
  scenesFor,
  samplerExpression,
  scrapeHrefExpression,
  yesterdayEpochDay
} from './yank-sweep-core.mjs';
import { decodePng, grayFrame } from './png-decode.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1] : fallback;
};
const serial = args.find((a) => !a.startsWith('--') && !args[args.indexOf(a) - 1]?.startsWith('--'));
if (!serial) {
  console.error('pass the device serial, e.g. node tests/yank-sweep-device.mjs 64101JEA325797 [apk]');
  process.exit(1);
}
const APK = args.find((a) => a.endsWith('.apk'));
const PKG = 'dev.engender.app';
const outDir = resolve(flag('out', resolve(here, '../.claude/yank-sweep-device')));
const only = flag('scenes', '')
  .split(',')
  .filter(Boolean);
const themes = flag('themes', 'light,dark')
  .split(',')
  .filter(Boolean);
/** The hydration mode (ticket 108): the full screen inventory walked cold
 *  in both database profiles, rather than the gesture scenes. */
const hydration = args.includes('--hydration');
/** Trust the journal as it stands instead of re-running the demo jumps.
    For a persona that means the reset and the fill are skipped, which on
    a physical phone saves most of an hour of seeding; the operator answers
    for the journal actually holding the state (ticket 139 rerun). */
const skipSeed = args.includes('--skip-seed');
const profiles = flag('profiles', 'persona,empty')
  .split(',')
  .filter(Boolean);
const passes = Number(flag('passes', hydration ? '1' : '3'));
const comparePath = flag(
  'compare',
  resolve(outDir, '../', hydration ? 'hydration-sweep' : 'yank-sweep', 'report.json')
);
const prove = args.includes('--prove');
const dump = args.includes('--dump');
const SCENES = hydration ? hydrationScreensFor({ prove, only }) : scenesFor({ prove, only });

const adb = (...a) => execFileSync('adb', ['-s', serial, ...a], { encoding: 'utf8' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await mkdir(outDir, { recursive: true });

/* ---------- the devtools socket ---------- */

/** Attach to the running WebView's page target, the way the disguise
 *  probe does: the socket is named by pid and the app's pid changes under
 *  us, so it is re-read on every attempt. */
async function attach() {
  let lastError = 'no webview_devtools_remote socket in /proc/net/unix';
  for (let i = 0; i < 60; i++) {
    await sleep(1000);
    const unix = adb('shell', 'cat', '/proc/net/unix');
    const socket = /webview_devtools_remote_\d+/.exec(unix)?.[0];
    if (!socket) continue;
    try {
      adb('forward', 'tcp:9333', `localabstract:${socket}`);
      const list = await fetch('http://127.0.0.1:9333/json/list', {
        signal: AbortSignal.timeout(3000)
      }).then((r) => r.json());
      const target = list.find((t) => t.type === 'page' && t.url.startsWith('https://localhost'));
      if (target) return connect(target.webSocketDebuggerUrl);
      lastError = `devtools listed ${list.length} target(s), none the app page`;
    } catch (error) {
      lastError = String(error?.cause?.code ?? error?.message ?? error);
    }
  }
  throw new Error(`no WebView devtools target appeared: ${lastError}`);
}

function connect(url) {
  const ws = new WebSocket(url);
  const pending = new Map();
  const listeners = new Set();
  let id = 0;
  /* The open itself goes on a clock, like every send below: a forward
     left pointing at a socket whose renderer has just been swapped
     answers devtools' HTTP listing but never finishes the WebSocket
     handshake, and an unbounded `ready` turned that into a silent
     forever-await the first time the WebView reloaded under the sweep.
     A timeout here is what lets attach()'s retry loop re-read the socket
     name and forward again instead of hanging the whole run. */
  const ready = new Promise((res, rej) => {
    const timer = setTimeout(() => rej(new Error('WS_NEVER_OPENED')), 8000);
    ws.addEventListener('open', () => {
      clearTimeout(timer);
      res();
    });
    ws.addEventListener('error', () => {
      clearTimeout(timer);
      rej(new Error('WS_ERROR'));
    });
  });
  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id) {
      const waiter = pending.get(msg.id);
      if (!waiter) return;
      pending.delete(msg.id);
      if (msg.error) {
        /* "Inspected target navigated or closed" is the same event the
           no-answer timeout guards - the WebView tore the execution
           context down mid-evaluate - but answered as an error reply
           instead of silence. Routed through the SOCKET_GONE retry so a
           first-run boot's own redirects cannot end the run; the retry
           re-attaches and re-evaluates against whatever document is
           live by then. */
        waiter.reject(
          new Error(
            msg.error.code === -32000
              ? 'SOCKET_GONE (inspected target navigated or closed)'
              : JSON.stringify(msg.error)
          )
        );
      } else waiter.resolve(msg.result);
    } else {
      for (const fn of listeners) fn(msg);
    }
  });
  /* A dropped socket has to become a rejection, not silence: a pending
     Runtime.evaluate nobody answers ends the run as an unsettled await
     with no clue which call it was. */
  ws.addEventListener('close', () => {
    for (const waiter of pending.values()) waiter.reject(new Error('SOCKET_GONE'));
    pending.clear();
  });
  /* Every call is on a clock, for the reason [[driving-the-webview-over-cdp
     -needs-timeouts]] gives: a WebView that navigates part-way through an
     evaluation destroys the execution context and devtools answers neither
     result nor error. */
  const send = async (method, params = {}, ms = 45000) => {
    await ready;
    const mine = ++id;
    return new Promise((res, rej) => {
      const timer = setTimeout(() => {
        pending.delete(mine);
        rej(new Error('SOCKET_GONE (no answer to ' + method + ')'));
      }, ms);
      const done = (fn) => (value) => {
        clearTimeout(timer);
        fn(value);
      };
      pending.set(mine, { resolve: done(res), reject: done(rej) });
      ws.send(JSON.stringify({ id: mine, method, params }));
    });
  };
  return {
    close: () => ws.close(),
    onEvent: (fn) => listeners.add(fn),
    offEvent: (fn) => listeners.delete(fn),
    send
  };
}

let client = null;
const errors = [];

async function initClient(c) {
  await c.send('Runtime.enable');
  await c.send('Page.enable');
  await c.send('Page.addScriptToEvaluateOnNewDocument', {
    source: INIT_HIDE_DEMO_SCRIPT
  });
  c.onEvent(onEvent);
}

/** Evaluate in the page, re-attaching when the WebView swaps its renderer
 *  under us. Throws what the page threw, not a bare "evaluation failed".
 *
 *  The clock has to outlive every expression it carries: the page-side
 *  polls run to 60 s (the boot wait, the persona reset, the fill), and a
 *  transport clock shorter than the expression it is asking about turns
 *  a slow-but-healthy poll into SOCKET_GONE - which the retry then
 *  re-sends, to time out again, five times, presenting the whole run as
 *  a transport hang that never was one. An expression whose condition
 *  genuinely never comes true answers at its own deadline, as a named
 *  "timed out waiting" error, and that is the failure the operator
 *  should see. */
async function ev(expression, ms = 90000) {
  let lastError = null;
  /* Five attempts, not three: a first-run boot redirects the page two or
     three times in quick succession, and each redirect can eat exactly
     one in-flight evaluate. Each attempt re-attaches and lands on
     whatever document is live, so the count only has to outlast the
     app's own settling. */
  for (let attempt = 0; attempt < 5; attempt++) {
    if (!client) {
      client = await attach();
      await initClient(client);
    }
    try {
      const result = await client.send(
        'Runtime.evaluate',
        { expression, awaitPromise: true, returnByValue: true },
        ms
      );
      if (result.exceptionDetails)
        throw new Error(result.exceptionDetails.exception?.description ?? 'evaluate threw');
      return result.result.value;
    } catch (error) {
      if (!String(error.message).includes('SOCKET_GONE')) throw error;
      /* Close before dropping the reference: a socket left open keeps
         its session alive on the WebView's devtools backend for as long
         as this process runs, and a retry path that leaks one per
         attempt leaves the phone carrying the corpses. */
      client.close();
      client = null;
      lastError = error;
      await sleep(500);
    }
  }
  /* The last underlying rejection rides along: a bare "kept dropping"
      says nothing about whether the socket closed, the WebView never
      answered, or the forward went stale - three different next steps. */
  throw new Error('the WebView kept dropping the devtools socket: ' + (lastError?.message ?? 'unknown'));
}

/** The sampler's answer, fetched in slices the socket will carry.
 *
 *  Ticket 140: the WebView drops the whole devtools connection for any
 *  reply of 4 MiB or more, and the frame table passes that on the app's
 *  densest screens - `/settings` samples 178 marks over 211 frames, which
 *  is 5.76 MB of JSON, and `/voice?metric=pitch` 4.78 MB. Those were the
 *  scenes the device reports had been recording as `SOCKET_GONE` and
 *  reading as a renderer crash; nothing on the phone was dying, the reply
 *  was simply bigger than the transport. Desktop never saw it because
 *  Playwright's CDP transport has no such cap.
 *
 *  So the table is stringified where it is made and pulled back a slice
 *  at a time. The retry in `ev()` still covers each leg: a re-attach lands
 *  on the same document, so the stashed string is still there. A
 *  navigation is the other thing entirely and this does not survive one -
 *  the global belongs to the document that made it - so the fetch has to
 *  finish before anything moves the page. Every caller below samples and
 *  then fetches, with the next `location.assign` a scene away. */
async function evFrames(expression, ms = 90000) {
  const total = await ev(
    `(async () => {
       window.__sweepReply = JSON.stringify(await (${expression}));
       return window.__sweepReply.length;
     })()`,
    ms
  );
  let json = '';
  for (const [from, to] of replySlices(total)) json += await ev(`window.__sweepReply.slice(${from}, ${to})`, ms);
  /* Dropped rather than left behind: the biggest of these is a 6 MB
     string, and a scene that kept its own would have the whole walk's
     worth of them resident by the end. Swallowed, though, because the
     frames are already in hand by this point: losing a whole scene to a
     failed nulling assignment would be this ticket's own bug one layer
     up, and the next navigation drops the global anyway. */
  await ev('window.__sweepReply = null; true;').catch(() => {});
  return JSON.parse(json);
}

const onEvent = (msg) => {
  if (msg.method === 'Runtime.exceptionThrown')
    errors.push(
      msg.params.exceptionDetails?.exception?.description ??
        msg.params.exceptionDetails?.text ??
        'exception'
    );
};

function pid() {
  try {
    const out = adb('shell', 'pidof', PKG).trim();
    return out ? Number(out.split(/\s+/)[0]) : null;
  } catch {
    return null;
  }
}

/* ---------- the page, driven ---------- */

const waitForExpression = (selector, ms = 30000, expectedPath = null) => `(async () => {
  const until = Date.now() + ${ms};
  while (Date.now() < until) {
    if ((!${JSON.stringify(expectedPath)} || location.pathname === ${JSON.stringify(expectedPath)}) && document.querySelector(${JSON.stringify(selector)})) return true;
    const err = document.querySelector('[data-app-root][data-boot="error"]');
    if (err) {
      const text = err.querySelector('.notice-body')?.innerText ?? '';
      if (text.includes('database is locked')) {
        await new Promise((r) => setTimeout(r, 800));
        location.reload();
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }
      throw new Error('boot failed: ' + (err.querySelector('.notice-body')?.innerText ?? 'unknown'));
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('timed out waiting for ' + ${JSON.stringify(selector)} + (${JSON.stringify(expectedPath)} ? ' on ' + ${JSON.stringify(expectedPath)} : ''));
})()`;

/** Walk the first run to \`target\`, stopping on it - the device twin of the
 *  desktop sweep's firstRunTo, over evaluate instead of locators. */
const firstRunExpression = (target) => `(async () => {
  const jump = document.querySelector('#demo-jump');
  jump.value = 'first-run';
  jump.dispatchEvent(new Event('change', { bubbles: true }));
  for (let i = 0; i < 60 && !document.querySelector('[data-next]'); i++)
    await new Promise((r) => setTimeout(r, 250));
  if (!document.querySelector('[data-next]')) throw new Error('the first run did not open');
  for (const step of ${JSON.stringify(SETUP_STEPS)}) {
    await new Promise((r) => setTimeout(r, 500));
    if (step === 'name') {
      const name = document.querySelector('#ob-name');
      Object.getOwnPropertyDescriptor(Object.getPrototypeOf(name), 'value').set.call(name, 'Ola');
      name.dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (step === ${JSON.stringify(target)}) return true;
    document.querySelector('[data-next]').click();
    await new Promise((r) => setTimeout(r, 350));
  }
  throw new Error('never reached the \${target} step');
})()`;

async function settle(path, theme) {
  await sleep(400);
  if (await ev(`!!document.querySelector('[data-leave-setup]')`)) {
    await ev(`document.querySelector('[data-leave-setup]').click(); true;`);
    await ev(waitForExpression('[data-home-hello]', 30000, '/'));
    await sleep(800);
  }
  if (await ev(`location.pathname + location.search !== ${JSON.stringify(path)}`)) {
    await ev(`location.assign(${JSON.stringify(path)}); true;`);
    /* Navigated on the whole address, waited on its pathname - the two are
       deliberately different. A query is something a screen is allowed to
       consume: settings reads `?raise=` once on mount and strips it back
       off (`replaceRoute('/settings')`), so a wait pinned on the search
       can never come true for exactly the scenes that carry one. Passing
       the full path here is what left `presentations-add` erroring 12/12
       on a boot that had already happened - the other half of e5678ffd
       (ticket 139), which taught the line above to reload on a repeated
       pathname and left this one as it was. `hydrationCold` has always
       pinned the pathname alone, which is why the same address measures
       fine in the hydration half. */
    await ev(waitForExpression('[data-app-root][data-boot="ready"], [data-pin-pad]', 40000, path.split('?')[0].split('#')[0]));
  } else {
    await ev(waitForExpression('[data-app-root][data-boot="ready"], [data-pin-pad]', 40000));
  }
  if (await ev(`!!document.querySelector('[data-pin-pad]')`)) {
    await ev(`(async () => {
      for (const d of ${JSON.stringify(PIN)}) {
        const key = document.querySelector('[data-pin-pad] [data-key="' + d + '"]');
        if (key) key.click();
        await new Promise((r) => setTimeout(r, 140));
      }
    })()`);
    await ev(waitForExpression('[data-app-root][data-boot="ready"]', 40000));
    await sleep(400);
  }
  await ev(SETTLE_PAGE_EXPRESSION(theme));
}

/* ---------- the camera ---------- */

/** Collect compositor frames while `fn` runs. Returns the frames with
 *  their timestamps, decoded lazily by the caller - only frames a finding
 *  names are ever decoded twice (as PNG files, for the evidence triple). */
async function screencast(fn) {
  const frames = [];
  /* A cast belongs to the connection it starts on: acks and teardown must
     not chase the global through a re-attach, because a frame the old
     session sent can arrive while ev()'s retry has already closed it -
     reading `client` there was a null deref that cascaded, ending every
     scene after one swallowed evaluate until the next prologue. And a
     cast cannot start from null at all: if the previous scene died with
     the socket down, the camera re-attaches here rather than throwing. */
  if (!client) {
    client = await attach();
    await initClient(client);
  }
  const c = client;
  const handler = (msg) => {
    if (msg.method !== 'Page.screencastFrame') return;
    const { data, metadata, sessionId } = msg.params;
    frames.push({ data, at: metadata.timestamp * 1000 });
    c.send('Page.screencastFrameAck', { sessionId }, 5000).catch(() => {});
  };
  c.onEvent(handler);
  try {
    await c.send('Page.startScreencast', {
      format: 'png',
      maxWidth: 390,
      maxHeight: 844,
      everyNthFrame: 1
    });
    return await fn(frames);
  } finally {
    /* Short clock: this socket may already be dead if fn() triggered a
       re-attach, and a teardown that waits the full send default on a
       corpse only stacks dead time onto a scene that is over. */
    await c.send('Page.stopScreencast', {}, 2000).catch(() => {});
    c.offEvent(handler);
  }
}

/* ---------- the render detector ---------- */

/* The arithmetic itself lives in the shared core now (the hydration
   sweep, ticket 108, points the same camera at a desktop cold load), so
   the thresholds and the flood fill cannot drift between the phone and
   the preview server; what stays here is everything that is this
   transport's alone - the run, the evidence triples, the report. */

/* ---------- the run ---------- */

if (APK) {
  console.log(`installing ${APK}`);
  adb('install', '-r', '-t', APK);
}
adb('shell', 'am', 'force-stop', PKG);
await sleep(1000);
adb('shell', 'monkey', '-p', PKG, '-c', 'android.intent.category.LAUNCHER', '1');
await sleep(5000);
client = await attach();
await initClient(client);
console.log(`attached to pid ${pid()} on ${serial}`);

/* A known floor for every run: the demo build's own state, so a phone that
   ran the app yesterday does not sweep yesterday's screen. Clearing the
   store also drops any access mode the phone's install had set - which is
   the preferred outcome, the sweep locking nothing it can avoid - and
   where a gate survives anyway, the demo install's throwaway PIN is typed
   once, here. The pad completes and submits itself at four digits
   (PinPad.svelte), so four clicks and a wait is the whole unlock. */
const PIN = flag('pin', '1111');
/* Let the app finish its own boot before the reload below: attaching
   during a cold start can land while the first journal open is still in
   flight, and reloading then makes two openers collide on the SQLite
   lock - "Couldn't open your journal", database is locked - which ends
   the run as a boot error that has nothing to do with the sweep. Any
   terminal surface (pad, setup, home, a first-run step) counts. */
const preBoot = await ev(`(async () => {
  const until = Date.now() + 30000;
  while (Date.now() < until) {
    if (document.querySelector('[data-pin-pad], [data-home-hello], [data-leave-setup], [data-next]')) return 'open';
    await new Promise((r) => setTimeout(r, 250));
  }
  return 'still-booting';
})()`);
if (preBoot !== 'open') console.log('boot: the app was still starting; reloading anyway');
await ev(`try { localStorage.clear(); } catch {} location.assign('/'); true;`);
await sleep(1500);
/* No pathname pin here: after the clear the first-run gate can send the
   fresh load straight to /onboarding, and boot's business is only that
   the app reached a terminal state - the scenes below pin their own
   paths, where it matters. A gate document reports needs-setup rather
   than ready, and a locked journal needs-unlock; both are terminal: the
   setup walk below takes the first, and the PIN branch of the boot loop
   the second. */
await ev(waitForExpression(
  '[data-app-root][data-boot="ready"], [data-app-root][data-boot="needs-setup"], [data-app-root][data-boot="needs-unlock"]',
  60000
));
const boot = await ev(`(async () => {
  const until = Date.now() + 20000;
  while (Date.now() < until) {
    if (document.querySelector('[data-pin-pad]')) {
      for (const digit of ${JSON.stringify(PIN)}) {
        document.querySelector('[data-pin-pad] [data-key="' + digit + '"]').click();
        await new Promise((r) => setTimeout(r, 120));
      }
      await new Promise((r) => setTimeout(r, 800));
      return document.querySelector('[data-pin-pad]') ? 'pin did not open' : 'pin';
    }
    /* Home alone means open: [data-leave-setup] also renders inside the
       onboarding flow, and reading it as "open" made the settle below
       click it - leaving setup midway on an install that has not chosen
       an access mode, which parks the app on the access chooser with no
       Home to come back to. The gate is the walk's to finish. */
    if (document.querySelector('[data-home-hello]')) return 'open';
    await new Promise((r) => setTimeout(r, 250));
  }
  return document.querySelector('[data-next]') || document.querySelector('[data-access-modes]')
    ? 'setup'
    : 'neither pad nor setup nor home';
})()`);
/* A journal that has not been onboarded yet (a fresh install, or a data
   wipe) is walked to Home here, once, before any profile runs: the
   profiles below assume a journal exists - the persona reset writes one,
   and every settle pins a path the gate would redirect away from. */
if (boot !== 'open' && boot !== 'pin') {
  if (boot !== 'setup') {
    console.error(`boot: ${boot}`);
    process.exit(1);
  }
  console.log('boot: setup; walking the first run once');
  let walked = false;
  try {
    walked = await ev(WALK_FIRST_RUN_FINISH_EXPRESSION, 150000);
  } catch (err) {
    console.error(`the first run walk failed: ${String(err).slice(0, 200)}`);
    process.exit(1);
  }
  if (!walked) {
    console.error('the first run walk never reached Home');
    process.exit(1);
  }
}
console.log(`boot: ${boot}`);

const report = [];
let evidenceCount = 0;

/* ---------- the hydration run (ticket 108) ---------- */

/** One cold scene: the camera rolls before the navigation, the sampler
 *  starts the moment boot reports ready, both stop three seconds later.
 *  Nothing is stamped on the page - the theme is already in the
 *  preferences boot stamps, and the cold window is meant to be
 *  untouched. */
async function hydrationCold(href) {
  const pathname = href.split('?')[0].split('#')[0];
  return screencast(async (cast) => {
    await ev(`location.assign(${JSON.stringify(href)}); true;`);
    await ev(waitForExpression('[data-app-root][data-boot="ready"]', 40000, pathname));
    const frames = await evFrames(samplerExpression('none', HYDRATION_MS, VT_NAMES));
    return { cast: [...cast], frames };
  });
}

/** One sheet scene: settled screen, then the opening and its hydration
 *  recorded together. */
async function hydrationSheet(scene, theme) {
  await settle(scene.at, theme);
  await sleep(HYDRATION_SETTLE_MS);
  return screencast(async (cast) => {
    const frames = await evFrames(samplerExpression(scene.act, HYDRATION_MS, VT_NAMES));
    return { cast: [...cast], frames };
  });
}

/** The tokens the scene routes carry, resolved from the profile's own
 *  journal by scraping the list screens that link the detail records. */
async function hydrationTokens(profile, theme) {
  const tokens = { yesterday: String(yesterdayEpochDay()) };
  const skipped = [];
  if (profile !== 'persona') {
    for (const key of Object.keys(HYDRATION_NEEDS)) skipped.push(key);
    return { tokens, skipped };
  }
  for (const [key, { list, prefix }] of Object.entries(HYDRATION_NEEDS)) {
    /* One list route that will not settle is a finding for the report, not
       a reason to lose the hours of seeding the walk sits on (ticket 139's
       /search/questions hang): record, skip, keep walking. */
    try {
      await settle(list, theme);
      const href = await ev(scrapeHrefExpression(prefix));
      if (href) tokens[key] = href.split('/').pop();
      else skipped.push(key);
    } catch (err) {
      skipped.push(key);
      console.log(`[persona] ${key}: could not settle ${list} (${String(err).slice(0, 120)}); detail scenes skip`);
    }
  }
  return { tokens, skipped };
}

async function hydrationRunScene(scene, profile, theme, tokens) {
  const needsToken = /\{(\w+)\}/.exec(scene.at)?.[1];
  if (scene.needs && needsToken && !tokens[scene.needs]) {
    report.push({ scene: scene.name, profile, theme, skipped: `no ${scene.needs} in this journal` });
    console.log(`[${profile}-${theme}] ${scene.name}: skipped, no ${scene.needs}`);
    return;
  }
  const href = fillTokens(scene.at, tokens);
  try {
    const result = scene.act ? await hydrationSheet(scene, theme) : await hydrationCold(href);
    await pushHydrationRun(report, outDir, { name: scene.name, is: scene.is, profile, theme, result, href, dump });
  } catch (err) {
    report.push({ scene: scene.name, profile, theme, href, error: String(err).slice(0, 300) });
    console.log(`[${profile}-${theme}] ${scene.name}: ERROR ${String(err).slice(0, 200)}`);
  }
}

async function hydrationScenes() {
  for (const profile of profiles) {
    await settle('/', themes[0]);
    if (profile === 'persona') {
      if (skipSeed) {
        console.log('[persona] skip-seed: trusting the journal as it stands');
      } else if (!(await ev(RESET_PERSONA_EXPRESSION, 2_700_000))) {
        console.error('the persona reset never reached Home; stopping this profile');
        continue;
      } else {
        await ev(FILL_EVERY_FEATURE_EXPRESSION, 2_700_000);
      }
      await sleep(1500);
    } else {
      /* The onboarding mount exists only here, between the jump and the
          walk that finishes the first run. The jump happens inside the
          scene's cast when the scene runs, and here when a --scenes
          filter has narrowed it away - the walk below assumes the first
          run is open, and without a jump it would wait on a screen the
          app never showed. */
      if (!SCENES.some((s) => s.name === 'onboarding-mount'))
        await ev(JUMP_FIRST_RUN_EXPRESSION);
      if (SCENES.some((s) => s.name === 'onboarding-mount')) {
        try {
          const mounted = await screencast(async (cast) => {
            await ev(JUMP_FIRST_RUN_EXPRESSION);
            await ev(waitForExpression('[data-next]', 30000, '/onboarding'));
            const frames = await evFrames(samplerExpression('none', HYDRATION_MS, VT_NAMES));
            return { cast: [...cast], frames };
          });
          await pushHydrationRun(report, outDir, {
            name: 'onboarding-mount',
            is: 'the first run opening over an empty journal',
            profile,
            theme: themes[0],
            result: mounted
          });
        } catch (err) {
          report.push({ scene: 'onboarding-mount', profile, theme: themes[0], error: String(err).slice(0, 300) });
          console.log(`[${profile}-${themes[0]}] onboarding-mount: ERROR ${String(err).slice(0, 200)}`);
        }
      }
      if (!(await ev(WALK_FIRST_RUN_FINISH_EXPRESSION, 150000))) {
        console.error('the first run never finished; stopping this profile');
        continue;
      }
    }

    for (const theme of themes) {
      /* The theme is written through the demo bar once per profile so a
         cold load reads it out of the preferences boot stamps. */
      await settle('/', theme);
      await ev(DEMO_THEME_EXPRESSION(theme));
      const { tokens, skipped } = await hydrationTokens(profile, theme);
      for (const note of skipped)
        console.log(`[${profile}] no ${note} to resolve in this journal; its detail scenes will skip`);
      for (const scene of SCENES) {
        if (scene.setup) continue; /* the prologues run outside the loop */
        if (scene.when && scene.when !== profile) continue;
        if (scene.name === PROOF.scene) {
          /* The proof, hydration-style: a settled screen, three wrong
             marks, the camera rolling over the same window - the file-end
             check demands both instruments saw them. */
          await settle('/', theme);
          await sleep(HYDRATION_SETTLE_MS);
          const result = await screencast(async (cast) => {
            await ev(`(${INJECT_PROOF_EXPRESSION})()`);
            const frames = await evFrames(samplerExpression('inject', HYDRATION_MS, VT_NAMES));
            return { cast: [...cast], frames };
          });
          await pushHydrationRun(report, outDir, { name: scene.name, is: scene.is, profile, theme, result });
          continue;
        }
        await hydrationRunScene(scene, profile, theme, tokens);
      }
    }
  }

  /* The lock-gate epilogue, last because a locked journal gates every
     cold load after it; under the run's first theme, written into the
     preferences first so the cold load actually boots with it. */
  const lockScene = SCENES.find((s) => s.setup === 'pin');
  if (lockScene && profiles.includes('persona')) {
    try {
      await settle('/', themes[0]);
      await ev(DEMO_THEME_EXPRESSION(themes[0]));
      await settle('/settings/access-mode', themes[0]);
      await ev(LOCK_SETUP_EXPRESSION(PIN));
      const result = await screencast(async (cast) => {
        await ev(`location.assign('/'); true;`);
        await ev(waitForExpression('[data-pin-pad]', 40000, '/'));
        const frames = await evFrames(samplerExpression('none', HYDRATION_MS, VT_NAMES));
        return { cast: [...cast], frames };
      });
      await pushHydrationRun(report, outDir, {
        name: 'lock-gate',
        is: lockScene.is,
        profile: 'persona',
        theme: themes[0],
        result
      });
      await ev(UNLOCK_PIN_EXPRESSION(PIN));
    } catch (err) {
      report.push({ scene: 'lock-gate', profile: 'persona', theme: themes[0], error: String(err).slice(0, 300) });
      console.log(`[persona-${themes[0]}] lock-gate: ERROR ${String(err).slice(0, 200)}`);
    }
  }
}

/* ---------- the gesture run (ticket 100) ---------- */

if (hydration) {
  await hydrationScenes();
} else {
  for (const profile of profiles) {
    if (profile === 'persona') {
      await settle('/', themes[0]);
      if (skipSeed) {
        console.log('[persona] skip-seed: trusting the journal as it stands');
      } else if (!(await ev(RESET_PERSONA_EXPRESSION, 2_700_000))) {
        console.error('the persona reset never reached Home; stopping this profile');
        continue;
      } else {
        await ev(FILL_EVERY_FEATURE_EXPRESSION, 2_700_000);
      }
      await sleep(1500);
    } else {
      await settle('/', themes[0]);
      await ev(JUMP_FIRST_RUN_EXPRESSION);
      if (!(await ev(WALK_FIRST_RUN_FINISH_EXPRESSION, 150000))) {
        console.error('the first run never finished; stopping this profile');
        continue;
      }
      await sleep(1500);
    }

    for (const theme of themes) {
      try {
        await ev(DEMO_THEME_EXPRESSION(theme));
        await sleep(300);
      } catch {}
      for (const scene of SCENES) {
        if (scene.when && scene.when !== profile) continue;
        for (let pass = 1; pass <= passes; pass++) {
          const label = `[${profile}-${theme}] ${scene.name} p${pass}`;
          try {
            await settle(scene.at, theme);
            if (scene.firstRun) await ev(firstRunExpression(scene.firstRun));
            await sleep(1400);
            if (scene.act === 'inject') await ev(`(${INJECT_PROOF_EXPRESSION})()`);
            const result = await screencast(async (cast) => {
              const frames = await evFrames(samplerExpression(scene.act, SCENE_MS, VT_NAMES));
              return { cast: [...cast], frames };
            });
            await sleep(600);
            /* The style half, exactly as the desktop sweep reads it. */
            const transitioned = result.frames.some((f) => f.active);
            const instrument = transitioned ? 'vt' : 'rows';
            const styleFrames = transitioned ? result.frames.filter((f) => f.active) : result.frames;
            const all = findYanks(styleFrames, instrument, styleFrames.length - 1);
            const styleYanks = all.filter((y) => !EXEMPT.test(y.mark));

            /* The render half. Instantaneous interactions with no ongoing
               animation render in 1 frame and emit no further compositor frames;
               these have no pixel yanks to analyze. */
            let findings = [];
            let motion = [];
            if (result.cast.length >= 3) {
              const decoded = result.cast.map((f) => {
                const png = decodePng(Buffer.from(f.data, 'base64'));
                return { png, gray: grayFrame(png), at: f.at };
              });
              const sizes = new Map();
              for (const d of decoded) {
                const k = `${d.png.width}x${d.png.height}`;
                sizes.set(k, (sizes.get(k) || 0) + 1);
              }
              let dominantKey = '';
              let maxCount = -1;
              for (const [k, count] of sizes) {
                if (count > maxCount) {
                  maxCount = count;
                  dominantKey = k;
                }
              }
              const [width, height] = dominantKey.split('x').map(Number);
              const uniform = decoded.filter((d) => d.png.width === width && d.png.height === height);

              if (uniform.length >= 3) {
                const res = findPixelYanks(
                  uniform.map((d) => d.gray),
                  width,
                  height,
                  uniform.map((d) => d.at)
                );
                findings = res.findings;
                motion = res.motion;
              }
            }

            for (const finding of findings) {
              if (evidenceCount >= EVIDENCE_CAP) break;
              evidenceCount++;
              const i = finding.frame;
              const endI = finding.toFrame !== undefined ? finding.toFrame + 1 : i + 1;
              /* The evidence triple: the frame before, the finding, the frame
                 after. That is the pair-by-pair story a person checks the
                 detector's arithmetic against. */
              for (const [suffix, index] of [
                ['a', i - 1],
                ['b', i],
                ['c', endI]
              ])
                if (result.cast[index])
                  await writeFile(
                    `${outDir}/${scene.name}-${profile}-${theme}-p${pass}-${String(i).padStart(3, '0')}${suffix}.png`,
                    Buffer.from(result.cast[index].data, 'base64')
                  );
            }

            if (dump)
              await writeFile(
                `${outDir}/${scene.name}-${profile}-${theme}-p${pass}.frames.json`,
                JSON.stringify(result.frames, null, 1)
              );
            report.push({
              scene: scene.name,
              profile,
              theme,
              pass,
              is: scene.is,
              instrument,
              styleFrames: styleFrames.length,
              sampled: result.frames.length,
              cast: result.cast.length,
              styleYanks,
              suppressed: all.length - styleYanks.length,
              pixelFindings: findings,
              motion
            });
            console.log(
              `${label}: ${result.cast.length} cast / ${styleFrames.length} style frames as ${instrument === 'vt' ? 'a transition' : 'a state change'}, ${styleYanks.length} style / ${findings.length} render yank(s)` +
                (styleYanks.length || findings.length
                  ? `\n  ${[
                      ...styleYanks.map((y) => `style ${y.kind} ${y.mark} @${y.at}ms - ${y.detail}`),
                      ...findings.map((f) => `render ${f.kind} @${f.at} box ${f.box.w}x${f.box.h} area ${(f.areaPct * 100).toFixed(1)}%`)
                    ].join('\n  ')}`
                  : '')
            );
          } catch (err) {
            report.push({ scene: scene.name, profile, theme, pass, error: String(err).slice(0, 300) });
            console.log(`${label}: ERROR ${String(err).slice(0, 200)}`);
          }
        }
      }
    }
  }
}

await writeFile(
  `${outDir}/report.json`,
  JSON.stringify(
    {
      target: 'device',
      serial,
      ...(hydration ? { mode: 'hydration', profiles } : {}),
      thresholds: {
        DIFF_EPS,
        TRANSIENT_MIN,
        OUTLIER_MIN,
        GAP_RATIO,
        ...(hydration ? { HYDRATION_MS, HYDRATION_PX } : {})
      },
      themes,
      passes,
      report,
      errors
    },
    null,
    2
  )
);
client.close();
adb('forward', '--remove', 'tcp:9333');

const styleTotal = report.reduce((n, r) => n + (r.styleYanks?.length ?? 0), 0);
const renderTotal = report.reduce((n, r) => n + (r.pixelFindings?.length ?? 0), 0);
const skippedTotal = report.filter((r) => r.skipped).length;
const erroredTotal = report.filter((r) => r.error).length;
console.log(
  `\n${report.length} run(s), ${styleTotal} style / ${renderTotal} render yank(s), ${skippedTotal} skipped, ${erroredTotal} errored; report in ${outDir}/report.json`
);

/* ---------- side by side with the desktop ---------- */

if (existsSync(comparePath)) {
  const desktop = JSON.parse(await readFile(comparePath, 'utf8'));
  /* Hydration reports carry a profile as well as a theme, and the gesture
     reports do not; the key takes whichever of the two it finds, so a
     persona run is never compared against an empty journal's numbers. */
  const key = (r) => `${r.scene}@${r.theme ?? 'light'}${r.profile ? `:${r.profile}` : ''}`;
  const desktopMap = new Map(desktop.report.map((r) => [key(r), r]));
  const deviceOnly = [];
  for (const r of report) {
    const d = desktopMap.get(key(r));
    /* Whichever shape the desktop report is in - the gesture half's
       `yanks`, or the hydration half's style-and-render pair. */
    const dn =
      (d?.yanks?.length ?? 0) + (d?.styleYanks?.length ?? 0) + (d?.pixelFindings?.length ?? 0);
    const vn = (r.styleYanks?.length ?? 0) + (r.pixelFindings?.length ?? 0) + (r.yanks?.length ?? 0);
    if (!d) continue;
    if (vn > dn) deviceOnly.push(`${key(r)}: desktop ${dn}, device ${vn}`);
  }
  console.log('\nside by side (desktop report: ' + comparePath + ')');
  if (deviceOnly.length) {
    console.log('device-only findings:');
    for (const line of deviceOnly) console.log(`  ${line}`);
  } else {
    console.log('no device-only findings against that report');
  }
}

/* ---------- the proof ---------- */

if (prove) {
  const proofRuns = report.filter((r) => r.scene === PROOF.scene);
  const missing = missingProofYanks(report, { checkArrival: !args.includes('--hydration') });
  const cameraSaw = proofRuns.some((r) =>
    (r.pixelFindings ?? []).some((f) => f.areaPct >= 0.05)
  );
  if (missing.length || !cameraSaw) {
    console.error(
      `proof FAILED: ${missing.length ? `the style arithmetic did not report ${missing.join(' or ')}` : ''}` +
        `${missing.length && !cameraSaw ? ' and ' : ''}` +
        `${!cameraSaw ? 'the camera saw none of it' : ''}. A clean run above is not evidence of anything.`
    );
    process.exitCode = 1;
  } else {
    console.log('proof: all style yanks and the camera saw them. The sweep can fail.');
  }
}
if (errors.length) {
  console.error(`${errors.length} page error(s):`);
  for (const e of errors) console.error(`  ${e.slice(0, 200)}`);
}
