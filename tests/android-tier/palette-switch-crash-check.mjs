/* On-device proof for ticket 245: switching the palette in a running app
   must never tear down the foreground Activity.

   The acceptance criterion this answers: cycling through every palette
   while Settings is open and in the foreground never kills the app's
   process and never forces the WebView's devtools socket to drop and
   reattach - a drop is the signal the Activity itself got torn down and
   recreated, which reads to a person as the app closing or "crashing",
   even though nothing calls Process.killProcess for a palette-only change.

   Root cause (see ticket 245): DisguisePlugin.setLauncherIdentity calls
   DisguiseAlias.apply() synchronously on every palette change, which
   disables whichever launcher activity-alias is currently enabled -
   including the one the running task was actually launched through. Android
   tears down a task whose launching alias just got disabled even under
   PackageManager.DONT_KILL_APP (that flag only protects the process, not
   the window). It doesn't fire on every switch - only when the palette
   picked disables the alias the live task is still running under - which
   is why this probe cycles through every palette rather than just one.

   Cannot be shown in a browser: chrome.icon (documentChrome.ts) only picks
   which favicon a <link> points at, and the native alias flip
   (androidDisguise.setLauncherIdentity, platform-sync.ts:350) has no web
   equivalent at all.

   Driven through the debug build's WebView devtools socket rather than by
   input events, for the same reason tests/android-tier/disguise-setup-probe.mjs
   is: the live page is the authority on what's still running, and a socket
   drop is itself the signal being measured here, not just a transport
   detail to route around.

   Run against an emulator, by serial, never against a phone that happens to
   be plugged in:
     node tests/android-tier/palette-switch-crash-check.mjs emulator-5554 [apk]

   Build the APK first, with JDK 21 and the web assets copied in:
     npm run build
     npx cap sync android
     JAVA_HOME=~/.sdkman/candidates/java/21.0.12-tem android/gradlew -p android :app:assembleDebug
*/
import { execFileSync } from 'node:child_process';

const serial = process.argv[2];
if (!serial) throw new Error('pass the device serial, e.g. emulator-5554');
const PKG = 'dev.engender.app';
const APK =
  process.argv[3] ??
  new URL('../../android/app/build/outputs/apk/debug/app-debug.apk', import.meta.url).pathname;

const PALETTES = ['trans', 'nonbinary', 'genderfluid', 'bisexual', 'lesbian', 'pansexual', 'rainbow', 'agender'];

const adb = (...args) => execFileSync('adb', ['-s', serial, ...args], { encoding: 'utf8' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The app's own pid, or null when it is not running - the signal a
    palette switch must never produce (unlike disguise, which is supposed
    to restart the process; see disguise-setup-probe.mjs's own appPid). */
function appPid() {
  try {
    const out = adb('shell', 'pidof', PKG).trim();
    return out ? Number(out.split(/\s+/)[0]) : null;
  } catch {
    return null;
  }
}

async function attach() {
  let lastError = 'no webview_devtools_remote socket in /proc/net/unix';
  for (let i = 0; i < 60; i++) {
    await sleep(1000);
    const unix = adb('shell', 'cat', '/proc/net/unix');
    const socket = /webview_devtools_remote_\d+/.exec(unix)?.[0];
    if (!socket) continue;
    try {
      adb('forward', 'tcp:9334', `localabstract:${socket}`);
      const list = await fetch('http://127.0.0.1:9334/json/list', {
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
  ws.addEventListener('close', () => {
    for (const waiter of pending.values()) waiter.reject(new Error('SOCKET_GONE'));
    pending.clear();
  });
  const send = async (method, params = {}, ms = 20000) => {
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
    }
  };
}

/** The page, re-attached when the WebView swaps its renderer under us -
    each reattach is counted as a `socketDrop`, which is the finding this
    whole probe exists to produce. */
let page = null;
let socketDrops = 0;
async function ev(expression) {
  for (let attempt = 0; attempt < 3; attempt++) {
    if (!page) {
      if (attempt > 0) socketDrops++;
      page = await attach();
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

const findings = {};
const say = (key, value) => {
  findings[key] = value;
  console.log(`  ${key}: ${JSON.stringify(value)}`);
};

console.log('installing (data kept - this is a preference, not a fresh-install scenario)');
adb('install', '-r', '-t', APK);
adb('shell', 'monkey', '-p', PKG, '-c', 'android.intent.category.LAUNCHER', '1');
await sleep(6000);

await ev(`
  const until = Date.now() + 40000;
  while (Date.now() < until) {
    const root = document.querySelector('[data-app-root]');
    if (root?.getAttribute('data-boot') === 'ready') return true;
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
`);
await ev(`
  const row = document.querySelector('[data-leave-setup]');
  if (row) { row.click(); await new Promise((r) => setTimeout(r, 1500)); }
  return true;
`);
await ev("location.href = '/settings'; return true;");
await sleep(2000);

const pidBefore = appPid();
say('pid before switching', pidBefore);

console.log('cycling every palette twice, in the foreground');
for (const round of [1, 2]) {
  for (const palette of PALETTES) {
    console.log(`  round ${round}: ${palette}`);
    const clicked = await ev(`
      const el = document.querySelector('[data-palette-pick="${palette}"]');
      if (!el) return false;
      el.click();
      return true;
    `);
    if (!clicked) throw new Error(`no swatch for ${palette} - not on /settings?`);
    await sleep(1200);
  }
}

const boot = await ev("return document.querySelector('[data-app-root]')?.getAttribute('data-boot');");
say('data-boot after cycling every palette twice', boot);
say('pid after switching', appPid());
say('socket drops during the cycle', socketDrops);

const ok = findings['pid after switching'] !== null && findings['pid after switching'] === pidBefore &&
  findings['data-boot after cycling every palette twice'] === 'ready' &&
  findings['socket drops during the cycle'] === 0;

console.log(ok
  ? '\nPASS switching palette in a running app never tore down the foreground activity'
  : '\nFAIL see the findings above - a socket drop or a pid change means the activity was torn down mid-session');

page?.close();
adb('forward', '--remove', 'tcp:9334');
process.exit(ok ? 0 : 1);
