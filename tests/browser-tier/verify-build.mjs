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

/* --- Phase 5 performance ticket 01: the scanner, online then offline ---

   The shell no longer precaches the OCR engine, so the question this answers
   is the one that trade turns on: does the scanner still work with no network
   after it has been opened once. Nothing short of running it proves that. The
   engine is 27 MB of wasm and language data, so both runs are slow, and the
   waits below are sized for that rather than for a normal click.

   A canvas rather than a fixture image, so the repository carries no binary
   for this: white ground, black text, the shape of a lab slip line. */
async function labSlipImage(page) {
  const dataUrl = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 900;
    canvas.height = 300;
    const draw = canvas.getContext('2d');
    draw.fillStyle = '#ffffff';
    draw.fillRect(0, 0, canvas.width, canvas.height);
    draw.fillStyle = '#000000';
    draw.font = '48px serif';
    draw.fillText('Estradiol 412 pmol/L', 40, 90);
    draw.fillText('Testosterone 0.8 nmol/L', 40, 180);
    draw.fillText('2026-08-27', 40, 270);
    return canvas.toDataURL('image/png');
  });
  return Buffer.from(dataUrl.split(',')[1], 'base64');
}

/** Opens the lab scanner and reads one image through it, from whatever state
    the page is in. Returns the state the machine settled in. */
async function readOneImage(page, origin) {
  await page.goto(`${origin}/settings/labs`);
  /* Every navigation here is a fresh load, and a reload ends the unlocked
     session (ADR-0018), so the gate is met again on the way in. */
  await page.waitForSelector('#journal-passphrase', { timeout: 30000 }).catch(() => {});
  await page.fill('#journal-passphrase', 'verify-build passphrase').catch(() => {});
  await page.click('[data-passphrase-submit]').catch(() => {});
  await page.waitForSelector('.app[data-boot="ready"]', { timeout: 30000 });

  await page.locator('[data-import-lab]').click();
  await page.waitForSelector('[data-ocr-pick="gallery"]', { timeout: 10000 });

  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.locator('[data-ocr-pick="gallery"]').click()
  ]);
  await chooser.setFiles({ name: 'lab-slip.png', mimeType: 'image/png', buffer: await labSlipImage(page) });

  /* Either end of a recognition that ran: rows were found, or the text held
     none. recognition-failed is the engine not loading, which is the failure
     this whole section exists to catch. */
  await page.waitForFunction(
    () => {
      const state = document.querySelector('[data-ocr-state]')?.getAttribute('data-ocr-state');
      return state === 'review' || state === 'no-rows' || state === 'recognition-failed';
    },
    null,
    { timeout: 180000 }
  );
  return await page.locator('[data-ocr-state]').getAttribute('data-ocr-state');
}

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

  /* Gripped by handle rather than by class (ADR-0029). These were
     `.home-hello`, `.quicklog .mood-btn` and `.entry-card`, and phase 5
     ticket 21 rebuilt Home out of the surface kit - none of the three
     survived, and each would have failed here as an anonymous 30s timeout
     rather than as a name. The rule the walkthrough keeps applies to every
     suite that drives a real screen; only walkthrough-locators.test.ts was
     watching, and it watches one file.

     A production build has no persona in it, so a cold start is the first-run
     gate. Walking it is what puts a journal on the device, and the quick log
     after it is the entry the offline start has to read back. Five steps then
     finish, the same six screens walkthrough.test.mjs flow 13 walks. */
  /* Walked to the end rather than counted out. It was five clicks and a
     finish, which stopped being the flow when 7d11edfd made the first run
     seven steps, and failed here as an anonymous 30s wait for [data-finish] -
     the same shape ADR-0029 is about. The bound is a runaway guard, not the
     step count: onboarding-steps has seven today and the flow is one shorter
     under disguise. */
  for (let step = 0; step < 12 && (await cold.locator('[data-next]').count()); step++) {
    await cold.locator('[data-next]').click();
  }
  await cold.locator('[data-finish]').click();
  await cold.waitForSelector('[data-home-hello]');
  await cold.locator('[data-mood="4"]').click();
  // Quick Log now seeds the editor route; save once to create the entry
  // this offline-start check is meant to read back.
  await cold.waitForSelector('#ed-note');
  await cold.locator('[data-save]').click();
  await cold.waitForSelector('[data-home-hello]');
  await cold.waitForSelector('[data-entry-card]');

  const cdp = await installed.newCDPSession(cold);
  const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors');
  if (installabilityErrors.length === 0) ok('Chromium finds the built app installable: manifest, icons and worker all satisfy it');
  else fail('Chromium finds the built app installable', JSON.stringify(installabilityErrors));

  /* The same question with disguise on (ticket 25). Flipped through the real
     Settings control, then waited on the boot mirror the head script reads,
     so SQLite and localStorage agree before a fresh page asks Chromium what
     it would install. That keeps this from passing only because the profile
     happens to be sitting at the passphrase gate and boot never got as far as
     opening preferences again. */
  /* Straight to the screen rather than through the tab, which stopped being a
     link to it: ADR-0036 put a More hub in front of Settings and the nav tab
     goes there now. What follows is about disguise, not about how a person
     reaches Settings, and the walkthrough owns that route. */
  await cold.goto(`${origin}/settings`);
  /* Waited out, because a goto is a fresh boot: the rows render before the
     journal is open and are replaced when it is, so a click sent early
     resolves the row and then loses it to the re-render. */
  await cold.waitForSelector('.app[data-boot="ready"]', { timeout: 30000 });
  await cold.locator('[data-list-row="disguise"]').click();
  await cold.getByRole('switch', { name: 'Disguise app' }).click();
  await cold.waitForFunction(() => {
    const boot = JSON.parse(localStorage.getItem('gender-diary-boot-prefs') || '{}');
    return boot.disguise === true;
  });

  const disguisedPage = await installed.newPage();
  await disguisedPage.goto(origin, { waitUntil: 'networkidle' });
  const disguisedCdp = await installed.newCDPSession(disguisedPage);
  const resolved = await disguisedCdp.send('Page.getAppManifest');
  const { installabilityErrors: disguisedErrors } = await disguisedCdp.send('Page.getInstallabilityErrors');
  const identity = resolved.data ? JSON.parse(resolved.data) : {};
  if (
    disguisedErrors.length === 0 &&
    resolved.url.endsWith('/manifest-notes.webmanifest') &&
    identity.name === 'Notes'
  )
    ok('a disguised install is installable too, and Chromium reads it as "Notes"');
  else
    fail(
      'a disguised install is installable too, and Chromium reads it as "Notes"',
      JSON.stringify({ url: resolved.url, name: identity.name, errors: disguisedErrors })
    );
  /* Back to the app's own identity before anything else reloads this origin,
     again through the real preference path rather than by poking only the
     mirror the head script reads. */
  await cold.getByRole('switch', { name: 'Disguise app' }).click();
  await cold.waitForFunction(() => {
    const boot = JSON.parse(localStorage.getItem('gender-diary-boot-prefs') || '{}');
    return boot.disguise === false;
  });
  await cold.keyboard.press('Escape');
  await disguisedPage.close();

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
    const entries = await cache.keys();
    /* Measured rather than derived from the file list, because what a first
       visit actually costs is what the browser stored, and the two came apart
       once already: the audit found a 54.06 MB shell whose asset list read as
       unremarkable (phase 5 performance ticket 01). */
    let bytes = 0;
    for (const request of entries) {
      const response = await cache.match(request);
      if (response) bytes += (await response.blob()).size;
    }
    return { names, bytes, paths: entries.map((request) => new URL(request.url).pathname) };
  });
  const megabytes = (shell.bytes / 1e6).toFixed(2);

  if (shell.names.length === 1 && shell.names[0].startsWith('gender-diary-shell-'))
    ok(`the shell is one cache per release (${shell.names[0]}), ${shell.paths.length} entries, ${megabytes} MB`);
  else fail('the shell is one cache per release', JSON.stringify(shell.names));

  /* The whole of ticket 01's first finding, as the one number a person feels:
     the shell was 54.06 MB across 324 entries, 49.7 MB of it an OCR engine
     that a first visit has no use for. The ceiling is deliberately loose - it
     is here to catch another feature's assets being precached wholesale, not
     to make an ordinary release fail because a font was added. */
  const SHELL_CEILING_MB = 15;
  if (shell.bytes < SHELL_CEILING_MB * 1e6) ok(`a first visit stores ${megabytes} MB, under the ${SHELL_CEILING_MB} MB ceiling`);
  else fail(`a first visit stores under ${SHELL_CEILING_MB} MB`, `${megabytes} MB across ${shell.paths.length} entries`);

  const precachedOnDemand = shell.paths.filter((path) => path.startsWith('/tesseract/'));
  if (precachedOnDemand.length === 0) ok('the OCR engine is not in a fresh install\'s shell');
  else fail("the OCR engine is not in a fresh install's shell", precachedOnDemand.slice(0, 4).join(', '));

  /* Opening the scanner, online, which is what puts the engine in the cache.
     The notice is checked in the same visit because it has to be read before
     the download starts, and this is the moment it would be. */
  await cold.goto(`${origin}/settings/labs`);
  await cold.waitForSelector('.app[data-boot="ready"]', { timeout: 30000 });
  await cold.locator('[data-import-lab]').click();
  if ((await cold.locator('[data-ocr-download]').count()) === 1)
    ok('the scanner says what it is about to download before it downloads it');
  else fail('the scanner says what it is about to download', 'no download notice in the pick sheet');
  await cold.keyboard.press('Escape');

  const onlineRead = await readOneImage(cold, origin);
  if (onlineRead === 'review' || onlineRead === 'no-rows') ok(`the scanner reads an image online (${onlineRead})`);
  else fail('the scanner reads an image online', `the machine settled in ${onlineRead}`);

  const afterUse = await cold.evaluate(async () => {
    const cache = await caches.open((await caches.keys())[0]);
    const paths = (await cache.keys()).map((request) => new URL(request.url).pathname);
    let bytes = 0;
    for (const request of await cache.keys()) {
      const response = await cache.match(request);
      if (response) bytes += (await response.blob()).size;
    }
    return { ocr: paths.filter((path) => path.startsWith('/tesseract/')), entries: paths.length, bytes };
  });
  if (afterUse.ocr.length >= 5)
    ok(
      `using the scanner adds the engine to the same cache (${afterUse.ocr.length} files, now ${afterUse.entries} entries, ${(afterUse.bytes / 1e6).toFixed(2)} MB)`
    );
  else fail('using the scanner adds the engine to the release cache', `${afterUse.ocr.length} OCR files in the cache`);

  /* The whole release, file by file, against what is actually in the cache.
     Four files are deliberately outside the shell: the fallback document,
     which is cached under / because that is what a navigation asks for; the
     version file, which has to stay live to be an update signal at all; the
     worker itself, which the browser fetches and stores on its own; and
     release.json, which describes the directory on the server rather than the
     app in the browser - nothing in the app reads it, and a cached copy would
     go on answering for the release that was live when it was cached
     (ticket 05).

     The OCR engine is outside it for a different reason, and the assertion is
     narrowed rather than weakened: /tesseract/ belongs to a feature the app
     loads on demand, so an install that has never opened the lab scanner is
     supposed not to hold it, and what is checked below is every file of the
     release except that set (phase 5 performance ticket 01). The set is named
     by its directory rather than listed, so a sixth OCR file would join it
     silently - which is right, since the whole directory is what ships and
     what a page later asks the worker for. */
  const outsideShell = new Set(['/index.html', '/_app/version.json', '/service-worker.js', '/release.json']);
  const release = releasePaths().filter((path) => !outsideShell.has(path) && !path.startsWith('/tesseract/'));
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
    /* Both manifests, because either one can be the one a disguised install
       reads (ticket 25), and every icon either one names - counted off the
       files rather than written down here, so adding a purpose or a disguise
       cannot leave this passing while the shell is short an icon. */
    'the manifests and their icons':
      ['/manifest.webmanifest', '/manifest-notes.webmanifest'].every((path) => shell.paths.includes(path)) &&
      readdirSync(new URL('../../static/icons/', import.meta.url)).every((icon) => shell.paths.includes(`/icons/${icon}`))
  };
  const absent = Object.keys(kinds).filter((kind) => !kinds[kind]);
  if (absent.length === 0) ok('the shell names what an offline boot reaches for first: worker, WASM, fonts, manifests, icons');
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
  await cold.goto(`${origin}/settings`);
  await cold.waitForSelector('.app[data-boot="ready"]', { timeout: 30000 });
  /* Phase 5 ticket 24: the About row is a ListRow now, whose own handle is
     data-list-row="about" rather than a settings-specific attribute. */
  await cold.locator('[data-list-row="about"]').click();
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
  await restarted.waitForSelector('[data-entry-card]');

  const entries = await restarted.locator('[data-entry-card]').count();
  const home = await restarted.locator('[data-home-hello]').count();
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

  /* The half of ticket 01 that the whole trade rests on: the scanner was
     opened once while there was a network, and this is a different browser
     process against a dead origin. The engine can only come from the cache the
     page asked the worker to fill.

     Run on the deep page rather than a new one, because the encrypted driver
     holds the OPFS access handles for as long as its tab lives (ADR-0020, one
     connection per origin). */
  const offlineRead = await readOneImage(deep, origin);
  if (offlineRead === 'review' || offlineRead === 'no-rows')
    ok(`the scanner still reads an image with the network gone (${offlineRead})`);
  else fail('the scanner still reads an image with the network gone', `the machine settled in ${offlineRead}`);

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
