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
  EXEMPT,
  INIT_HIDE_DEMO_SCRIPT,
  INJECT_PROOF_EXPRESSION,
  PROOF,
  SCENE_MS,
  SETTLE_PAGE_EXPRESSION,
  VT_NAMES,
  findYanks,
  scenesFor,
  samplerExpression
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
const passes = Number(flag('passes', '3'));
const comparePath = flag('compare', resolve(outDir, '../yank-sweep/report.json'));
const prove = args.includes('--prove');
const dump = args.includes('--dump');
const SCENES = scenesFor({ prove, only });

/** Two renders of the same pixel differing by less than this are the same
 *  render: PNG is lossless, so what moves under this is jpeg-less dither
 *  and text antialiasing settling. */
const DIFF_EPS = 12;
/** A transient has to cover this share of the frame before it is a yank
 *  and not a highlight blinking. */
const TRANSIENT_MIN = 0.03;
/** And the neighbours have to agree with each other this much better than
 *  either agrees with the finding, or the frame is just motion - a slide
 *  changes every frame, a flash changes one. */
const OUTLIER_MIN = 0.03;
/** A screencast frame arriving much later than its neighbours saw a
 *  different slice of time than the styles did; motion aliased across a
 *  gap reads as a teleport. Guard rather than chase. */
const GAP_RATIO = 2.5;

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
  const ready = new Promise((res, rej) => {
    ws.addEventListener('open', () => res());
    ws.addEventListener('error', rej);
  });
  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id) {
      const waiter = pending.get(msg.id);
      if (!waiter) return;
      pending.delete(msg.id);
      if (msg.error) waiter.reject(new Error(JSON.stringify(msg.error)));
      else waiter.resolve(msg.result);
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
 *  under us. Throws what the page threw, not a bare "evaluation failed". */
async function ev(expression, ms = 45000) {
  for (let attempt = 0; attempt < 3; attempt++) {
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
      client = null;
    }
  }
  throw new Error('the WebView kept dropping the devtools socket');
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
    if (err) throw new Error('boot failed: ' + (err.querySelector('.notice-body')?.innerText ?? 'unknown'));
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('timed out waiting for ' + ${JSON.stringify(selector)} + (${JSON.stringify(expectedPath)} ? ' on ' + ${JSON.stringify(expectedPath)} : ''));
})()`;

/** Walk the first run to `target`, stopping on it - the device twin of the
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
  throw new Error('never reached the ${target} step');
})()`;

async function settle(path, theme) {
  if (await ev(`!!document.querySelector('[data-leave-setup]')`)) {
    await ev(`document.querySelector('[data-leave-setup]').click(); true;`);
    await ev(waitForExpression('[data-home-hello]', 30000, '/'));
    await sleep(800);
  }
  if (await ev(`location.pathname !== ${JSON.stringify(path)}`)) {
    await ev(
      `(async () => {
        location.assign(${JSON.stringify(path)});
        return true;
      })()`
    );
    await ev(waitForExpression('[data-app-root][data-boot="ready"]', 40000, path));
  } else {
    await ev(waitForExpression('[data-app-root][data-boot="ready"]', 40000));
  }
  await ev(SETTLE_PAGE_EXPRESSION(theme));
}

/* ---------- the camera ---------- */

/** Collect compositor frames while `fn` runs. Returns the frames with
 *  their timestamps, decoded lazily by the caller - only frames a finding
 *  names are ever decoded twice (as PNG files, for the evidence triple). */
async function screencast(fn) {
  const frames = [];
  const handler = (msg) => {
    if (msg.method !== 'Page.screencastFrame') return;
    const { data, metadata, sessionId } = msg.params;
    frames.push({ data, at: metadata.timestamp * 1000 });
    client.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
  };
  client.onEvent(handler);
  try {
    await client.send('Page.startScreencast', {
      format: 'png',
      maxWidth: 390,
      maxHeight: 844,
      everyNthFrame: 1
    });
    return await fn(frames);
  } finally {
    await client.send('Page.stopScreencast').catch(() => {});
    client.offEvent(handler);
  }
}

/* ---------- the render detector ---------- */

const diffMask = (a, b) => {
  const mask = new Uint8Array(a.length);
  let changed = 0;
  for (let i = 0; i < a.length; i++)
    if (Math.abs(a[i] - b[i]) > DIFF_EPS) {
      mask[i] = 1;
      changed++;
    }
  return { mask, frac: changed / a.length };
};

/** Connected regions of a mask, 4-neighbour flood fill. Returned largest
 *  first, regions under `minArea` px dropped. */
function regions(mask, w, h, minArea) {
  const seen = new Uint8Array(mask.length);
  const out = [];
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i] || seen[i]) continue;
    let stack = [i];
    seen[i] = 1;
    let area = 0;
    let x0 = w;
    let x1 = 0;
    let y0 = h;
    let y1 = 0;
    while (stack.length) {
      const p = stack.pop();
      const x = p % w;
      const y = (p / w) | 0;
      area++;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
      for (const q of [p - 1, p + 1, p - w, p + w]) {
        if (q < 0 || q >= mask.length || Math.abs((q % w) - x) > 1) continue;
        if (mask[q] && !seen[q]) {
          seen[q] = 1;
          stack.push(q);
        }
      }
    }
    if (area >= minArea)
      out.push({ area, box: { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 } });
  }
  return out.sort((a, b) => b.area - a.area);
}

/** A frame whose content differs from both its neighbours while the
 *  neighbours agree with each other: something painted that was never
 *  meant to be on screen. The style trace can be right and the render
 *  wrong - this reads the render. */
function findPixelYanks(grays, w, h, ats) {
  const dts = [];
  for (let i = 1; i < grays.length; i++) dts.push(ats[i] - ats[i - 1]);
  const median = dts.slice().sort((a, b) => a - b)[Math.floor(dts.length / 2)] || 16;
  const findings = [];
  const motion = [];
  for (let i = 1; i < grays.length - 1; i++) {
    const prev = diffMask(grays[i - 1], grays[i]);
    const next = diffMask(grays[i + 1], grays[i]);
    const skip = diffMask(grays[i + 1], grays[i - 1]);
    motion.push({ at: ats[i], prev: round4(prev.frac), next: round4(next.frac), skip: round4(skip.frac) });
    if (
      dts[i - 1] > median * GAP_RATIO ||
      dts[i] > median * GAP_RATIO
    )
      continue;
    /* Transient: changed against both neighbours, stable across them. */
    let transient = 0;
    const tmask = new Uint8Array(prev.mask.length);
    for (let p = 0; p < tmask.length; p++)
      if (prev.mask[p] && next.mask[p] && !skip.mask[p]) {
        tmask[p] = 1;
        transient++;
      }
    const frac = transient / tmask.length;
    const outlier = (prev.frac + next.frac) / 2 - 2 * skip.frac;
    if (frac < TRANSIENT_MIN || outlier < OUTLIER_MIN) continue;
    const found = regions(tmask, w, h, Math.round(0.002 * w * h));
    if (!found.length) continue;
    const top = found[0];
    const wide = top.box.w >= 0.5 * w && top.box.h >= 0.4 * h;
    findings.push({
      kind: wide || top.area >= 0.12 * w * h ? 'bloat' : 'flash',
      frame: i,
      at: Math.round(ats[i]),
      box: top.box,
      areaPct: round4(top.area / (w * h)),
      outlier: round4(outlier),
      regions: found.slice(0, 5).map((r) => ({ box: r.box, areaPct: round4(r.area / (w * h)) }))
    });
  }
  return { findings, motion };
}

const round4 = (n) => Math.round(n * 10000) / 10000;

/* ---------- the run ---------- */

if (APK) {
  console.log(`installing ${APK}`);
  adb('install', '-r', '-t', APK);
}
if (!pid()) {
  adb('shell', 'monkey', '-p', PKG, '-c', 'android.intent.category.LAUNCHER', '1');
  await sleep(6000);
}
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
await ev(`try { localStorage.clear(); } catch {} location.assign('/'); true;`);
await ev(waitForExpression('[data-app-root][data-boot="ready"]', 60000, '/'));
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
    if (document.querySelector('[data-leave-setup]') || document.querySelector('[data-home-hello]'))
      return 'open';
    await new Promise((r) => setTimeout(r, 250));
  }
  return 'neither pad nor setup nor home';
})()`);
if (boot !== 'open' && boot !== 'pin') {
  console.error(`boot: ${boot}`);
  process.exit(1);
}
console.log(`boot: ${boot}`);

const report = [];
let evidenceCount = 0;
const EVIDENCE_CAP = 60;

for (const theme of themes) {
  for (const scene of SCENES) {
    for (let pass = 1; pass <= passes; pass++) {
      const label = `[${theme}] ${scene.name} p${pass}`;
      try {
        await settle(scene.at, theme);
        if (scene.firstRun) await ev(firstRunExpression(scene.firstRun));
        await sleep(1400);
        if (scene.act === 'inject') await ev(`(${INJECT_PROOF_EXPRESSION})()`);
        const result = await screencast(async (cast) => {
          const frames = await ev(samplerExpression(scene.act, SCENE_MS, VT_NAMES));
          return { cast: [...cast], frames };
        });
        if (result.cast.length < 4) throw new Error(`only ${result.cast.length} screencast frames`);

        /* The style half, exactly as the desktop sweep reads it. */
        const transitioned = result.frames.some((f) => f.active);
        const instrument = transitioned ? 'vt' : 'rows';
        const styleFrames = transitioned ? result.frames.filter((f) => f.active) : result.frames;
        const all = findYanks(styleFrames, instrument, styleFrames.length - 1);
        const styleYanks = all.filter((y) => !EXEMPT.test(y.mark));

        /* The render half. Frames are decoded per pass; the grays are what
           the arithmetic reads, the PNGs are kept around only for evidence. */
        const decoded = result.cast.map((f) => {
          const png = decodePng(Buffer.from(f.data, 'base64'));
          return { png, gray: grayFrame(png), at: f.at };
        });
        const { width, height } = decoded[0].png;
        if (decoded.some((d) => d.png.width !== width || d.png.height !== height))
          throw new Error('screencast frames arrived in more than one size');
        const { findings, motion } = findPixelYanks(
          decoded.map((d) => d.gray),
          width,
          height,
          decoded.map((d) => d.at)
        );

        for (const finding of findings) {
          if (evidenceCount >= EVIDENCE_CAP) break;
          evidenceCount++;
          const i = finding.frame;
          /* The evidence triple: the frame before, the finding, the frame
             after. That is the pair-by-pair story a person checks the
             detector's arithmetic against. */
          for (const [suffix, index] of [
            ['a', i - 1],
            ['b', i],
            ['c', i + 1]
          ])
            await writeFile(
              `${outDir}/${scene.name}-${theme}-p${pass}-${String(i).padStart(3, '0')}${suffix}.png`,
              Buffer.from(result.cast[index].data, 'base64')
            );
        }

        if (dump)
          await writeFile(
            `${outDir}/${scene.name}-${theme}-p${pass}.frames.json`,
            JSON.stringify(result.frames, null, 1)
          );
        report.push({
          scene: scene.name,
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
        report.push({ scene: scene.name, theme, pass, error: String(err).slice(0, 300) });
        console.log(`${label}: ERROR ${String(err).slice(0, 200)}`);
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
      thresholds: { DIFF_EPS, TRANSIENT_MIN, OUTLIER_MIN, GAP_RATIO },
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
console.log(
  `\n${report.length} run(s), ${styleTotal} style / ${renderTotal} render yank(s); report in ${outDir}/report.json`
);

/* ---------- side by side with the desktop ---------- */

if (existsSync(comparePath)) {
  const desktop = JSON.parse(await readFile(comparePath, 'utf8'));
  const key = (scene, theme) => `${scene}@${theme}`;
  const desktopMap = new Map(desktop.report.map((r) => [key(r.scene, r.theme ?? 'light'), r]));
  const deviceOnly = [];
  for (const r of report) {
    const d = desktopMap.get(key(r.scene, r.theme));
    const dn = d?.yanks?.length ?? 0;
    const vn = (r.styleYanks?.length ?? 0) + (r.pixelFindings?.length ?? 0);
    if (!d) continue;
    if (vn > dn) deviceOnly.push(`${key(r.scene, r.theme)}: desktop ${dn}, device ${vn}`);
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
  const scene = proofRuns[0];
  const got = (mark, kind) =>
    scene?.styleYanks?.some((y) => y.mark.startsWith(mark) && y.kind === kind);
  const missing = [
    got(PROOF.teleport, 'teleport') ? null : `a 200px jump on ${PROOF.teleport}`,
    got(PROOF.vanish, 'vanish') ? null : `a one-frame cut on ${PROOF.vanish}`,
    got(PROOF.bloat, 'bloat') ? null : `a one-frame bloat on ${PROOF.bloat}`
  ].filter(Boolean);
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
    console.log('proof: all three style yanks and the camera saw them. The sweep can fail.');
  }
}
if (errors.length) {
  console.error(`${errors.length} page error(s):`);
  for (const e of errors) console.error(`  ${e.slice(0, 200)}`);
}
