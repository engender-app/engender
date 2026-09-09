/* On-device proof for setup's disguise step (phase 10 redesign ticket 32).

   The acceptance criterion this answers: turning the disguise on during
   setup produces a finished install rather than a setup that died halfway.
   It cannot be shown in a browser, because what makes it hard is Android's
   alone - flipping the launcher alias kills the process
   (DisguisePlugin.setDisguised), and setup holds every answer in memory
   until complete() writes them.

   Driven through the debug build's WebView devtools socket rather than by
   input events, for the reason [[webview-devtools-over-adb]] gives: the app
   sets FLAG_SECURE, so a screencap is black, and the live page is the
   authority anyway. Screenshots come from Page.captureScreenshot, which is
   the renderer rather than the framebuffer and so is not blocked.

   Run against an emulator, by serial, never against a phone that happens to
   be plugged in:
     node tests/android-tier/disguise-setup-probe.mjs emulator-5554 [apk]

   Build the APK first, with JDK 21 and the web assets copied in:
     npm run build
     npx cap copy android
     JAVA_HOME=~/.sdkman/candidates/java/21.0.12-tem \
       android/gradlew -p android :app:assembleDebug
*/
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const serial = process.argv[2];
if (!serial) throw new Error('pass the device serial, e.g. emulator-5554');
const PKG = 'dev.engender.app';
const APK =
  process.argv[3] ??
  new URL('../../android/app/build/outputs/apk/debug/app-debug.apk', import.meta.url).pathname;
const SHOTS = new URL('../../.claude/disguise-step-shots/', import.meta.url).pathname;
mkdirSync(SHOTS, { recursive: true });

const adb = (...args) => execFileSync('adb', ['-s', serial, ...args], { encoding: 'utf8' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The app's own pid, or null when it is not running - which is the signal
    the disguise actually restarted it. */
function appPid() {
  /* `pidof` exits 1 when nothing matches, which here is the answer rather
     than a failure: no pid is what the disguise flipping the alias leaves
     behind. */
  try {
    const out = adb('shell', 'pidof', PKG).trim();
    return out ? Number(out.split(/\s+/)[0]) : null;
  } catch {
    return null;
  }
}

/** Which launcher entry PackageManager would actually hand a launcher,
    which is the disguise's whole visible effect. Asked as a resolve rather
    than read out of `dumpsys package`: the enabled/disabled component lists
    there are empty while a component sits at its manifest default, so a
    dump reads "not disguised" both before the flip and after a flip back,
    and cannot tell them apart. This answers with the component itself. */
function launcherAlias() {
  const out = adb('shell', 'pm resolve-activity --brief -c android.intent.category.LAUNCHER ' + PKG);
  return /Launcher\w+/.exec(out)?.[0] ?? out.trim();
}

async function attach() {
  let lastError = 'no webview_devtools_remote socket in /proc/net/unix';
  for (let i = 0; i < 60; i++) {
    await sleep(1000);
    const unix = adb('shell', 'cat', '/proc/net/unix');
    /* The socket is named by pid, and the app's pid changes under this
       probe on purpose - so it is re-read every attempt rather than
       forwarded once. A forward to a dead pid answers nothing at all, which
       is a hang rather than an error, hence the abort signal below. */
    const socket = /webview_devtools_remote_\d+/.exec(unix)?.[0];
    if (!socket) continue;
    try {
      adb('forward', 'tcp:9333', `localabstract:${socket}`);
      const list = await fetch('http://127.0.0.1:9333/json/list', {
        signal: AbortSignal.timeout(3000)
      }).then((r) => r.json());
      const target = list.find((t) => t.type === 'page' && t.url.startsWith('http'));
      if (target) return connect(target.webSocketDebuggerUrl);
      lastError = `devtools listed ${list.length} target(s), none a page`;
    } catch (error) {
      lastError = String(error?.cause?.code ?? error?.message ?? error);
    }
  }
  throw new Error(`no WebView devtools target appeared: ${lastError}`);
}

function connect(url) {
  const ws = new WebSocket(url);
  const pending = new Map();
  let id = 0;
  const ready = new Promise((resolve, reject) => {
    ws.addEventListener('open', () => resolve());
    ws.addEventListener('error', reject);
  });
  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    const waiter = pending.get(msg.id);
    if (!waiter) return;
    pending.delete(msg.id);
    if (msg.error) waiter.reject(new Error(JSON.stringify(msg.error)));
    else waiter.resolve(msg.result);
  });
  /* A dropped socket has to become a rejection, not silence. The WebView
     replaces its renderer more than once under this probe - opening the
     journal is one, the disguise killing the process is the other - and a
     pending Runtime.evaluate that nobody ever answers ends the run with
     "unsettled top-level await" and no clue which call it was. */
  ws.addEventListener('close', () => {
    for (const waiter of pending.values()) waiter.reject(new Error('SOCKET_GONE'));
    pending.clear();
  });

  /* Every call is on a clock. A WebView that navigates part-way through a
     Runtime.evaluate destroys the execution context it was running in, and
     devtools then answers neither with a result nor with an error and
     leaves the socket open - so without this the run ends as an unsettled
     await with no indication of which call it was. */
  const send = async (method, params = {}, ms = 45000) => {
    await ready;
    const mine = ++id;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(mine);
        reject(new Error('SOCKET_GONE (no answer to ' + method + ')'));
      }, ms);
      const done = (fn) => (value) => {
        clearTimeout(timer);
        fn(value);
      };
      pending.set(mine, { resolve: done(resolve), reject: done(reject) });
      ws.send(JSON.stringify({ id: mine, method, params }));
    });
  };

  return {
    close: () => ws.close(),
    /** Evaluates in the page and returns the value, throwing what the page
        threw rather than a bare "evaluation failed". */
    async evaluate(expression) {
      const result = await send('Runtime.evaluate', {
        expression: `(async () => { ${expression} })()`,
        awaitPromise: true,
        returnByValue: true
      });
      if (result.exceptionDetails) {
        throw new Error(result.exceptionDetails.exception?.description ?? 'evaluate threw');
      }
      return result.result.value;
    },
    async shoot(name) {
      const shot = await send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(`${SHOTS}${name}.png`, Buffer.from(shot.data, 'base64'));
    }
  };
}

/* The three DOM helpers the walk needs, injected once per page rather than
   repeated in every expression. `type` goes through the value setter on the
   prototype and then dispatches input, which is what a bind:value listens
   for; assigning .value alone changes the field and tells Svelte nothing. */
const HELPERS = `
  window.__probe = {
    has: (sel) => !!document.querySelector(sel),
    text: (sel) => document.querySelector(sel)?.textContent?.trim() ?? null,
    click: (sel) => {
      const el = document.querySelector(sel);
      if (!el) throw new Error('no element for ' + sel);
      el.click();
      return true;
    },
    type: (sel, value) => {
      const el = document.querySelector(sel);
      if (!el) throw new Error('no field for ' + sel);
      Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set.call(el, value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    },
    waitFor: async (sel, ms = 20000) => {
      const until = Date.now() + ms;
      while (Date.now() < until) {
        if (document.querySelector(sel)) return true;
        await new Promise((r) => setTimeout(r, 100));
      }
      throw new Error('timed out waiting for ' + sel);
    },
    /* One step forward, waited on both ends. The steps cross on a shared
       axis and the incoming one waits for the outgoing to finish leaving,
       so a fixed sleep is either too short or a guess; the title changing
       is the step changing. */
    /* The sun's accessible name is "step N of M" (ob_step_of), which is the
       only place the step count is written down since ticket 29 took the
       rail away - so it is what this counts on, rather than a title that
       has two elements in the DOM for the length of a crossfade. */
    where: () => document.querySelector('.setup-sky')?.getAttribute('aria-label') ?? '(no sun)',
    advance: async () => {
      const before = window.__probe.where();
      await window.__probe.waitFor('[data-next]');
      document.querySelector('[data-next]').click();
      const until = Date.now() + 20000;
      while (Date.now() < until) {
        const now = window.__probe.where();
        if (now !== before) {
          await new Promise((r) => setTimeout(r, 450));
          return now + ' - ' + (document.querySelector('.setup-title')?.textContent ?? '');
        }
        await new Promise((r) => setTimeout(r, 100));
      }
      throw new Error('the step did not change from ' + JSON.stringify(before));
    }
  };
`;

/** The page, re-attached when the WebView swaps its renderer under us. The
    helpers go back in on every attach, since they live on the page. */
let page = null;
async function ev(expression) {
  for (let attempt = 0; attempt < 3; attempt++) {
    if (!page) {
      page = await attach();
      await page.evaluate(HELPERS + 'return true;');
    }
    try {
      return await page.evaluate(expression);
    } catch (error) {
      if (!String(error.message).includes('SOCKET_GONE')) throw error;
      page = null;
    }
  }
  throw new Error('the WebView kept dropping the devtools socket');
}

/** A screenshot from the renderer, which FLAG_SECURE does not reach. */
async function shoot(name) {
  if (!page) {
    page = await attach();
    await page.evaluate(HELPERS + 'return true;');
  }
  await page.shoot(name);
}

const findings = {};
const say = (key, value) => {
  findings[key] = value;
  console.log(`  ${key}: ${JSON.stringify(value)}`);
};

/* Reinstalled rather than `pm clear`ed. Clearing wipes the app's data and
   leaves the launcher alias exactly where the last run put it, because
   component enabled state belongs to PackageManager rather than to the
   app - so a second run would start with the disguise live in the launcher
   and false in a fresh pref table, and the first thing the app does on
   reaching `ready` is flip the alias back, which kills the process in the
   middle of setup. (Real behaviour, self-healing in one restart, and not
   what this probe is about.) The shell may not reset a component's state
   itself - `pm default-state` is refused with a SecurityException - so the
   reset is an uninstall. */
console.log('installing a first run');
try {
  adb('uninstall', PKG);
} catch {
  // Not installed, which is the state this is trying to reach anyway.
}
adb('install', '-r', '-t', APK);
say('the launcher starts undisguised', launcherAlias());
adb('shell', 'monkey', '-p', PKG, '-c', 'android.intent.category.LAUNCHER', '1');
await sleep(6000);

/* Waited on the step rather than on data-boot="ready": a brand new install
   sits at `needs-setup` for the whole flow, and reaches `ready` only once
   the access-mode step has opened the journal. */
await ev("await window.__probe.waitFor('[data-next]', 40000);");
say('starts on setup', await ev("return window.__probe.has('[data-next]');"));

console.log('walking setup');
say('welcome -> ', await ev('return window.__probe.advance();'));
await ev("await window.__probe.waitFor('#ob-name');");
await ev("window.__probe.type('#ob-name', 'Ola');");
say('name -> ', await ev('return window.__probe.advance();'));
say('flag -> ', await ev('return window.__probe.advance();'));
say('scales -> ', await ev('return window.__probe.advance();'));
say('areas -> ', await ev('return window.__probe.advance();'));

/* The lock step on a real first run is the access-mode module, and it is
   the one step with no way past: it creates the keystore every later write
   needs. Passphrase, because it is the only mode an emulator can complete
   without enrolled biometrics. */
console.log('setting an access mode');
await ev("await window.__probe.waitFor('[data-access-modes]');");
await ev("window.__probe.click('[data-list-row=\"passphrase\"]');");
await ev("await window.__probe.waitFor('[data-access-continue]');");
await ev("window.__probe.click('[data-access-continue]');");
await ev("await window.__probe.waitFor('#am-passphrase');");
await ev("window.__probe.type('#am-passphrase', 'probe-passphrase');");
await ev("window.__probe.type('#am-passphrase-confirm', 'probe-passphrase');");
await ev("window.__probe.click('[data-access-submit]');");
await ev("await window.__probe.waitFor('[data-skip-step]', 90000);");
await sleep(1500);

say('lock -> ', await ev('return window.__probe.advance();'));
say('checkin -> ', await ev('return window.__probe.advance();'));
await ev("await window.__probe.waitFor('[data-list-row=\"disguise\"]');");
await sleep(600);

/* The Android wording, read off the device rather than asserted from the
   catalogue: this is the branch a browser render cannot show. */
say('the row says', await ev("return window.__probe.text('[data-list-row=\"disguise\"]');"));
say('the note says', await ev("return window.__probe.text('[data-disguise-preview] + p');"));
await shoot('android-step-off');

console.log('turning the disguise on');
await ev("window.__probe.click('[role=\"switch\"]');");
await ev("await window.__probe.waitFor('[data-disguise-preview][data-on=\"true\"]');");
await sleep(500);
await shoot('android-step-on');

/* Held, not applied: the launcher must still be the app's own while the
   switch is on and the step is still open. If this is already disguised,
   the answer was written where it was given, which is the defect the whole
   ticket is shaped around. */
say('alias while the step is open', launcherAlias());
const pidBefore = appPid();
say('pid before the finish', pidBefore);

console.log('finishing');
say('disguise -> ', await ev('return window.__probe.advance();'));
await ev("await window.__probe.waitFor('[data-finish]');");
await sleep(400);
await ev("window.__probe.click('[data-finish]');");
page?.close();
page = null;

/* The restart, watched rather than assumed. */
let died = false;
for (let i = 0; i < 60; i++) {
  const now = appPid();
  if (now === null || now !== pidBefore) {
    died = true;
    break;
  }
  await sleep(500);
}
say('the app restarted itself', died);
say('alias after the finish', launcherAlias());

console.log('launching again, the way the person would');
adb('shell', 'monkey', '-p', PKG, '-c', 'android.intent.category.LAUNCHER', '1');
await sleep(7000);
page = null;

/* A cold start in passphrase mode meets the gate, not Home - which is
   itself the first half of the claim: setup is over, so what the app asks
   for now is the journal's secret rather than a name and a flag. */
await ev("await window.__probe.waitFor('#journal-passphrase, [data-next]', 60000);");
say('setup came back', await ev("return window.__probe.has('[data-next]');"));
say('the tab title after the restart', await ev('return document.title;'));
await shoot('android-after-restart');

console.log('opening the journal');
await ev("window.__probe.type('#journal-passphrase', 'probe-passphrase');");
await ev("window.__probe.click('[data-passphrase-submit]');");
await ev("await window.__probe.waitFor('[data-home-hello]', 60000);");
say('the journal opened', await ev("return window.__probe.has('[data-home-hello]');"));

/* Settled, not first-painted. Home draws its greeting from the preference
   projection, which starts at the defaults and fills in when the journal's
   pref table is attached - so a read taken the moment [data-home-hello]
   exists sees a nameless greeting and the app's own title, and would call
   this ticket broken when it is not. The same is true of the tab title,
   which documentChrome writes from prefs.disguise. */
await ev(`
  const until = Date.now() + 30000;
  while (Date.now() < until) {
    const greeting = document.querySelector('[data-home-hello]')?.textContent ?? '';
    if (document.title === 'Notes' && greeting.includes('Ola')) return true;
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
`);
say('the greeting', await ev("return window.__probe.text('[data-home-hello]');"));
say('the tab title', await ev('return document.title;'));
await shoot('android-home-disguised');
page?.close();
page = null;

adb('forward', '--remove', 'tcp:9333');

const ok =
  findings['the launcher starts undisguised'] === 'LauncherDefault' &&
  findings['starts on setup'] === true &&
  findings['alias while the step is open'] === 'LauncherDefault' &&
  findings['the app restarted itself'] === true &&
  findings['alias after the finish'] === 'LauncherDisguised' &&
  findings['setup came back'] === false &&
  findings['the journal opened'] === true &&
  String(findings['the greeting']).includes('Ola') &&
  findings['the tab title'] === 'Notes';

console.log(ok ? '\nPASS a disguised finish leaves a finished install' : '\nFAIL see the findings above');
process.exit(ok ? 0 : 1);
