/* Release gate (ticket 04's acceptance: "verify it, do not assume it"):
   confirms the production build (`npm run build`) is a static SPA that
   makes zero requests off its own origin - the SQLocal .wasm/worker in
   particular, which Rive's canvas package already gets wrong by
   defaulting to a CDN. Serves build/ with `vite preview` and drives a
   real Chromium through it with Playwright.

   It also reads the emitted JavaScript from disk (ticket 05): the Alice
   persona and the demo bar have to be absent from a production build, and
   the only way to know is to look at what was written, not at the source
   that was supposed to guard them. Run with `npm run verify:build` after
   `npm run build`.

   The second half installs the app for real (phase 2 ticket 03): manifest,
   service worker and precached shell, then kills the network and starts the
   app again. That is the check no test against a dev server can make -
   neither the worker nor the manifest exists until something is built. */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { preview } from 'vite';
import { createReporter, launchChromium, launchPersistentChromium } from '../browser-harness.mjs';
import { appVersion } from '../../scripts/app-version.mjs';

/** Every file under `path`, recursively. */
function walk(path, files = []) {
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const full = join(path, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else files.push(full);
  }
  return files;
}

/** Everything the build emitted, JavaScript and CSS both - the demo bar's
    styling used to sit in a shared stylesheet, where dropping the component
    would still have left its rules behind. */
function emittedAssets() {
  return walk('build/_app/immutable')
    .filter((file) => file.endsWith('.js') || file.endsWith('.css'))
    .map((file) => readFileSync(file, 'utf8'))
    .join('\n');
}

/** Every file the release directory holds, as the paths it serves them at. */
function releasePaths() {
  return walk('build').map((file) => `/${relative('build', file)}`);
}

const server = await preview({ preview: { port: 0 } });
const address = server.httpServer.address();
const origin = `http://localhost:${address.port}`;

const browser = await launchChromium();
const page = await (await browser.newContext()).newPage();

const allRequests = [];
const externalRequests = [];
page.on('request', (req) => {
  allRequests.push(req.url());
  if (new URL(req.url()).origin !== origin) externalRequests.push(req.url());
});

const { ok, fail, finish } = createReporter();

try {
  await page.goto(origin, { waitUntil: 'networkidle' });

  /* A production first run stops at the passphrase gate before the
     database exists (ticket 09) - only the demo build invents a passphrase
     for itself. Meeting the gate here is itself an assertion: a production
     journal is never created without one. */
  await page.waitForSelector('#journal-passphrase', { timeout: 10000 });
  ok('a production first run asks for a journal passphrase before anything else');

  await page.fill('#journal-passphrase', 'verify-build passphrase');
  await page.fill('#journal-passphrase-confirm', 'verify-build passphrase');
  await page.click('[data-passphrase-submit]');

  // Give boot() time to open the database and load the sqlite3mc
  // worker/wasm - the whole point of this check.
  await page.waitForSelector('.app[data-boot="ready"]', { timeout: 30000 });
  await page.waitForTimeout(1000);

  // Confirms boot() actually ran and fetched the encrypted driver's
  // wasm/worker, rather than the zero-external-requests check above
  // passing vacuously because nothing loaded at all.
  if (allRequests.some((u) => u.includes('.wasm'))) ok("boot() loads the sqlite3mc wasm build from the app's own origin");
  else fail("boot() loads the sqlite3mc wasm build from the app's own origin", `no .wasm request seen; requests were: ${allRequests.join(', ')}`);

  /* The session rule (ADR-0018), on the production build - the walkthrough
     can't test this because the demo build unlocks itself: a reload ends
     the unlocked session, the unwrapped key dies with it, and the journal
     opens again only for the passphrase. */
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('#journal-passphrase', { timeout: 10000 });
  const confirmField = await page.locator('#journal-passphrase-confirm').count();
  if (confirmField === 0) ok('a production reload asks for the passphrase again (unlock, not a second setup)');
  else fail('a production reload asks for the passphrase again', 'the setup form rendered instead of the unlock form');

  await page.fill('#journal-passphrase', 'not the passphrase');
  await page.click('[data-passphrase-submit]');
  await page.waitForSelector('[data-passphrase-status]:has-text("not right")', { timeout: 15000 });
  ok('a wrong passphrase is refused with no diagnosis beyond "not right"');

  await page.fill('#journal-passphrase', 'verify-build passphrase');
  await page.click('[data-passphrase-submit]');
  await page.waitForSelector('.app[data-boot="ready"]', { timeout: 30000 });
  ok('the right passphrase opens the same journal after the reload');

  if (externalRequests.length === 0) ok('production build makes zero requests off its own origin');
  else fail('production build makes zero requests off its own origin', externalRequests.join(', '));

  /* Greps the bundle rather than trusting the guard: someone's diary
     persona shipping inside the app people keep their own diary in is the
     failure this exists to catch, and "it's behind a flag" is not the same
     as "it isn't there".

     Each needle is text only the demo module has. Note what is not here:
     "Estradiol patch" is the reminder editor's placeholder as well as one
     of Alice's reminders, so it would fail against a bundle that is
     perfectly clean. */
  const bundle = emittedAssets();
  const persona = ['Alice', 'Coffee with Marta', 'Voice workshop weekend'].filter((s) => bundle.includes(s));
  if (persona.length === 0) ok('production build contains no demo persona');
  else fail('production build contains no demo persona', `found ${persona.join(', ')}`);

  const demoBar = ['Demo controls', 'Jump to screen', 'Reset demo state', 'demo-phone-frame'].filter((s) =>
    bundle.includes(s)
  );
  if (demoBar.length === 0) ok('production build contains no demo bar');
  else fail('production build contains no demo bar', `found ${demoBar.join(', ')}`);

  /* The counterpart: the vocabulary every real user needs does ship, so a
     "nothing found" pass above can't be the bundle simply not being read. */
  if (bundle.includes('euphoria_dysphoria')) ok('production build does contain the built-in vocabulary');
  else fail('production build does contain the built-in vocabulary', 'no dimension key found in the bundle');
} catch (e) {
  fail('verify-build', e.message ?? String(e));
}

await browser.close();

/* --- Phase 2 ticket 03: install the app, kill the network, start it again -

   A profile directory rather than the throwaway context above, for two
   reasons: Chromium answers every installability question about an incognito
   profile with `in-incognito` and looks no further, and a restart that the
   browser remembers nothing about would not be much of a restart. */
const profile = await mkdtemp(join(tmpdir(), 'gender-diary-install-'));
let installed;
let serving = true;
const closeServer = async () => {
  if (serving) (serving = false), await server.close();
};
try {
  installed = await launchPersistentChromium(profile);
  const cold = installed.pages()[0] ?? (await installed.newPage());
  await cold.goto(origin, { waitUntil: 'networkidle' });

  /* A fresh profile is a first run, and a production first run creates its
     journal only behind a passphrase (ticket 09) - walk the setup the way
     a person would before anything below can boot. */
  await cold.waitForSelector('#journal-passphrase', { timeout: 10000 });
  await cold.fill('#journal-passphrase', 'verify-build passphrase');
  await cold.fill('#journal-passphrase-confirm', 'verify-build passphrase');
  await cold.click('[data-passphrase-submit]');
  await cold.waitForSelector('.app[data-boot="ready"]', { timeout: 30000 });

  /* A production build has no persona in it, so a cold start is the first-run
     gate. Walking it is what puts a journal on the device, and the quick log
     after it is the entry the offline start has to read back. Five steps then
     finish, the same six screens walkthrough.test.mjs flow 13 walks. */
  for (let i = 0; i < 5; i++) await cold.locator('[data-next]').click();
  await cold.locator('[data-finish]').click();
  await cold.waitForSelector('.home-hello');
  await cold.locator('.quicklog .mood-btn[data-mood="4"]').click();
  await cold.waitForSelector('.entry-card');

  const cdp = await installed.newCDPSession(cold);
  const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors');
  if (installabilityErrors.length === 0) ok('Chromium finds the built app installable: manifest, icons and worker all satisfy it');
  else fail('Chromium finds the built app installable', JSON.stringify(installabilityErrors));

  // Precaching is what the install step waits on, so a worker that reached
  // 'activated' is a shell that is either complete or absent.
  await cold.waitForFunction(
    async () => (await navigator.serviceWorker.getRegistration())?.active?.state === 'activated',
    null,
    { timeout: 30000 }
  );
  const shell = await cold.evaluate(async () => {
    const names = await caches.keys();
    const cache = await caches.open(names[0]);
    return { names, paths: (await cache.keys()).map((request) => new URL(request.url).pathname) };
  });

  if (shell.names.length === 1 && shell.names[0].startsWith('gender-diary-shell-'))
    ok(`the shell is one cache per release (${shell.names[0]})`);
  else fail('the shell is one cache per release', JSON.stringify(shell.names));

  /* The whole release, file by file, against what is actually in the cache.
     Three files are deliberately outside the shell: the fallback document,
     which is cached under / because that is what a navigation asks for; the
     version file, which has to stay live to be an update signal at all; and
     the worker itself, which the browser fetches and stores on its own. */
  const outsideShell = new Set(['/index.html', '/_app/version.json', '/service-worker.js']);
  const release = releasePaths().filter((path) => !outsideShell.has(path));
  const missing = release.filter((path) => !shell.paths.includes(path));
  if (missing.length === 0 && shell.paths.includes('/'))
    ok(`the precached shell holds the fallback document and all ${release.length} other files of the release`);
  else
    fail(
      'the precached shell holds the fallback document and every other file of the release',
      missing.length ? `missing ${missing.slice(0, 8).join(', ')}` : 'the fallback document is not cached under /'
    );

  /* Named separately from the count above, which both sides of a mistake can
     satisfy at once: fonts dropped from static/ would leave the release and
     the cache agreeing with each other and nothing to load offline. */
  const kinds = {
    "SQLocal's worker": shell.paths.some((path) => path.startsWith('/_app/immutable/workers/') && path.endsWith('.js')),
    'the SQLite WASM the worker loads': shell.paths.some(
      (path) => path.startsWith('/_app/immutable/workers/') && path.endsWith('.wasm')
    ),
    'all four bundled woff2 faces': shell.paths.filter((path) => path.endsWith('.woff2')).length === 4,
    'the manifest and its icons': shell.paths.includes('/manifest.webmanifest') && shell.paths.filter((path) => path.startsWith('/icons/')).length === 2
  };
  const absent = Object.keys(kinds).filter((kind) => !kinds[kind]);
  if (absent.length === 0) ok('the shell names what an offline boot reaches for first: worker, WASM, fonts, manifest, icons');
  else fail('the shell names what an offline boot reaches for first', `no ${absent.join(', no ')}`);

  /* The animation assets, which are the one part of the shell there is
     nothing to check yet: static/rive/ does not exist, and RiveSlot.svelte
     renders its CSS fallback until a .riv lands in there. The trap waiting
     for whoever lands the first one is that @rive-app/canvas fetches its
     runtime WASM from unpkg, falling back to jsdelivr, so an animation that
     plays online would be a request off the origin and a blank canvas
     offline. Hence a check that stays quiet until an asset exists and then
     insists the runtime is local too. */
  const animations = existsSync('static/rive') ? walk('static/rive').map((file) => `/${relative('static', file)}`) : [];
  if (animations.length === 0) {
    console.log('SKIP  the shell holds the local animation assets and a local Rive runtime: static/rive/ is empty');
  } else {
    const missingAnimations = animations.filter((path) => !shell.paths.includes(path));
    const localRuntime = shell.paths.some((path) => /\/rive[^/]*\.wasm$/.test(path));
    if (missingAnimations.length === 0 && localRuntime)
      ok('the shell holds the local animation assets and a local Rive runtime');
    else
      fail(
        'the shell holds the local animation assets and a local Rive runtime',
        missingAnimations.length
          ? `missing ${missingAnimations.join(', ')}`
          : "no Rive WASM in the shell - RuntimeLoader still points at the CDN, so set it to a bundled copy and turn the fallback off"
      );
  }

  /* The version the running app shows (phase 2 ticket 01), read out of the
     release that was just built - the real one, resolved from this checkout,
     which is the version this build would ship under.

     What this half proves is that the value reached the app: the resolver
     runs again here rather than comparing against a literal, so it catches a
     build that stopped carrying its version, or carried a stale one. What it
     cannot prove is that the resolver itself is right, since both sides ask
     the same function. The walkthrough suite holds the other half - it
     builds under a GENDER_DIARY_VERSION nobody derives and insists on seeing
     exactly that string - and the rules live in tests/app-version.test.ts. */
  await cold.locator('a[href="/settings"]:visible').first().click();
  await cold.locator('[data-about-open]').click();
  const shownVersion = (await cold.locator('[data-app-version]').innerText()).trim();
  const builtVersion = appVersion();
  if (shownVersion === builtVersion) ok(`the About screen shows the version this build resolved (${builtVersion})`);
  else fail('the About screen shows the version this build resolved', `built ${builtVersion}, shown ${shownVersion}`);

  /* The restart, with the origin gone rather than merely unreachable: a new
     browser process against the same profile, the preview server closed
     behind it, and the context offline so nothing else can answer either.
     Nothing below this line can be served by anything but the cache. */
  await installed.close();
  await closeServer();
  installed = await launchPersistentChromium(profile, { offline: true });

  const restarted = installed.pages()[0] ?? (await installed.newPage());
  const offlineRequests = [];
  restarted.on('request', (request) => offlineRequests.push(request.url()));
  await restarted.goto(origin);

  /* The restart ended the unlocked session, so the journal opens for the
     passphrase again - offline, which is itself worth having: the unlock
     path (argon2 wasm included) has to come out of the shell cache. */
  await restarted.waitForSelector('#journal-passphrase', { timeout: 30000 });
  await restarted.fill('#journal-passphrase', 'verify-build passphrase');
  await restarted.click('[data-passphrase-submit]');
  await restarted.waitForSelector('.app[data-boot="ready"]', { timeout: 30000 });
  await restarted.waitForSelector('.entry-card');

  const entries = await restarted.locator('.entry-card').count();
  const home = await restarted.locator('.home-hello').count();
  if (home === 1 && entries >= 1)
    ok(`with the network off the app opens the Journal and reads what is in it (${entries} entry card)`);
  else fail('with the network off the app opens the Journal and reads existing entries', `home: ${home}, entries: ${entries}`);

  /* Which the worker did, rather than an HTTP cache that happened to still
     hold everything: workerStart is only set on a navigation a service
     worker answered. */
  const answeredByWorker = await restarted.evaluate(
    () => navigator.serviceWorker.controller !== null && performance.getEntriesByType('navigation')[0].workerStart > 0
  );
  if (answeredByWorker) ok('the offline document came from the service worker, not from a browser cache');
  else fail('the offline document came from the service worker', 'no worker controlled the page or answered the navigation');

  /* A deep path, started cold and offline. The worker answers every
     navigation with the one document it precached, so the URLs inside that
     document have to mean the same thing at every depth - which is what
     paths.relative: false in svelte.config.js is for. With SvelteKit's
     default this passes at / and asks /entry/new/ for the app's entry
     chunk here. */
  /* Closed first, because the encrypted driver's SAHPool holds the OPFS
     access handles for as long as its tab lives (ADR-0020's one connection
     per origin) - the deep start below is about a cold start at depth, not
     about two simultaneous tabs, which the driver does not support. */
  await restarted.close();

  const deep = await installed.newPage();
  deep.on('request', (request) => offlineRequests.push(request.url()));
  await deep.goto(`${origin}/entry/new/today`);
  await deep.waitForSelector('#journal-passphrase', { timeout: 30000 }).catch(() => {});
  await deep.fill('#journal-passphrase', 'verify-build passphrase').catch(() => {});
  await deep.click('[data-passphrase-submit]').catch(() => {});
  const deepBooted = await deep
    .waitForSelector('.app[data-boot="ready"]', { timeout: 30000 })
    .then(() => true)
    .catch(() => false);
  if (deepBooted && (await deep.locator('#ed-note').count()) === 1)
    ok('an offline start on a nested route opens that screen, not a shell missing its chunks');
  else
    fail(
      'an offline start on a nested route opens that screen',
      deepBooted ? 'the entry editor did not render' : 'the app never booted - check the asset URLs in the cached document'
    );

  const offOrigin = offlineRequests.filter((url) => new URL(url).origin !== origin);
  if (offOrigin.length === 0 && offlineRequests.length > 0)
    ok(`offline startup made ${offlineRequests.length} requests and not one of them off its own origin`);
  else fail('offline startup makes no request to another origin', offOrigin.join(', ') || 'no requests were seen at all');
} catch (e) {
  fail('install and offline start', e.message ?? String(e));
} finally {
  await installed?.close();
  await rm(profile, { recursive: true, force: true });
  // A no-op unless the section threw before it got that far itself.
  await closeServer();
}

const failures = finish('BUILD VERIFICATION PASSES');
process.exit(failures ? 1 : 0);
