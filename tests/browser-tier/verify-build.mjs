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

/* --- Phase 5 performance ticket 01: the OCR engine, online then offline ---

   The shell no longer precaches that engine, so the question this answers is
   the one the trade turns on: are its bytes still there with no network, after
   the app has loaded it once.

   Driven at the cache rather than through the scanner's own sheet: what this
   file is responsible for is the shell's caching behaviour, not the screen
   that triggers it, and a real recognition run would make this slower and
   less deterministic for no gain here. The screen itself - opening the sheet,
   running a recognition, the download notice it shows first - is the
   walkthrough's job (ticket 44). The step neither file drives (tesseract
   reading those files) stays covered by ocr-engine.test.ts, which pins the
   paths the engine loads from.

   The set the page asks for, as ocr-engine.ts names it. */
const OCR_ASSETS = [
  '/tesseract/worker.min.js',
  '/tesseract/tesseract-core.wasm.js',
  '/tesseract/tesseract-core.wasm',
  '/tesseract/lang-data/eng.traineddata.gz',
  '/tesseract/lang-data/pol.traineddata.gz'
];

/** Loads the engine's files the way a first recognition does, then sends the
    ask ocr-engine.ts sends once they are in. Returns what each file measured,
    which is what the offline half is compared against - not the bytes on
    disk, since the two language files are served .gz and a blob of one is its
    decompressed size. */
async function loadAndKeepOcrEngine(page, assets, message) {
  return await page.evaluate(
    async ({ assets, message }) => {
      const sizes = {};
      for (const asset of assets) {
        const response = await fetch(asset);
        if (!response.ok) return `fetching ${asset} answered ${response.status}`;
        sizes[asset] = (await response.blob()).size;
      }
      /* Through the registration, the way ocr-engine.ts sends it: this page
         installed the worker, so it is not controlled by it. */
      const registration = await navigator.serviceWorker.getRegistration();
      registration?.active?.postMessage(message);
      return registration?.active ? { sizes } : 'no active worker to ask';
    },
    { assets, message }
  );
}

/** Any screen, from whatever state the page is in.

    Loaded by URL rather than walked to. Both would be fair - the walkthrough
    suite is what covers the taps that get a person there, and ADR-0036 moved
    Settings behind a More hub since these checks were written - but a load is
    the one that works from a page that has just started cold offline, which is
    where half the calls below are made. A load is a reload, and a reload ends
    the unlocked session (ADR-0018), so the gate is met again on the way in. */
async function openScreen(page, origin, path) {
  await page.goto(`${origin}${path}`);
  await page.waitForSelector('#journal-passphrase', { timeout: 30000 }).catch(() => {});
  await page.fill('#journal-passphrase', 'verify-build passphrase').catch(() => {});
  await page.click('[data-passphrase-submit]').catch(() => {});
  await page.waitForSelector('.app[data-boot="ready"]', { timeout: 30000 });
}

/** What the release cache holds right now: its name, every path in it, and the
    bytes it adds up to.

    Measured rather than derived from the file list, because what a first visit
    actually costs is what the browser stored, and the two came apart once
    already: the audit found a 54.06 MB shell whose asset list read as
    unremarkable (phase 5 performance ticket 01). */
async function measureCache(page) {
  return await page.evaluate(async () => {
    const names = await caches.keys();
    const cache = await caches.open(names[0]);
    const entries = await cache.keys();
    let bytes = 0;
    for (const request of entries) {
      const response = await cache.match(request);
      if (response) bytes += (await response.blob()).size;
    }
    return { names, bytes, paths: entries.map((request) => new URL(request.url).pathname) };
  });
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
  const PASSPHRASE = 'verify-build passphrase';

  /* Onboarding is truly first now (ticket 54): a brand new install used to
     stop at the passphrase gate before the database even existed, ahead of
     onboarding's own welcome screen ever getting a chance to paint - only
     the demo build invented a passphrase for itself and never met this.
     Proven the way 32.1 proved its own ordering bug, by timing the real
     race rather than reading the code: a MutationObserver started before
     navigation even begins, watching for whichever of the two screens the
     layout could show first - onboarding's own welcome, or the gate -
     actually reaches the DOM first. A selector that merely resolves fast
     afterwards would prove nothing about which one arrived first. */
  await page.addInitScript(() => {
    window.__firstPaintRace = [];
    const seen = new Set();
    const record = () => {
      if (!seen.has('onboarding') && document.querySelector('[data-next]')) {
        seen.add('onboarding');
        window.__firstPaintRace.push('onboarding-welcome');
      }
      if (!seen.has('gate') && document.querySelector('[data-access-modes], #journal-passphrase')) {
        seen.add('gate');
        window.__firstPaintRace.push('access-gate');
      }
    };
    // `document`, not `document.documentElement`: an init script runs before
    // the parser has created <html>, and observing null throws - silently,
    // since nothing here was awaited - which recorded an empty race every
    // time rather than the ordering it was written to catch.
    new MutationObserver(record).observe(document, { childList: true, subtree: true });
    record();
  });

  await page.goto(origin, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-next]', { timeout: 10000 });
  const race = await page.evaluate(() => window.__firstPaintRace);
  if (race[0] === 'onboarding-welcome') ok("a production first run paints onboarding's welcome screen before any security gate");
  else fail("a production first run paints onboarding's welcome screen before any security gate", JSON.stringify(race));

  await page.locator('[data-next]').click(); // welcome -> name
  await page.locator('[data-next]').click(); // name -> flag
  await page.locator('[data-next]').click(); // flag -> scales
  await page.locator('[data-next]').click(); // scales -> lock

  /* Reaching the lock step is where the access-mode module (ticket 53)
     appears - not before, which the race above already pinned, and not a
     second copy built for onboarding: this is the same AccessModeSetup
     component Settings uses, on screen because the gate itself is
     rendering now that the flow has reached the one step that needs it. */
  await page.waitForSelector('[data-access-modes]', { timeout: 10000 });
  ok('the access-mode module appears at the one onboarding step that needs it, and only there');

  await page.locator('[data-list-row="passphrase"]').click();
  await page.fill('#am-passphrase', PASSPHRASE);
  await page.fill('#am-passphrase-confirm', PASSPHRASE);
  await page.click('[data-access-submit]');

  // Give boot() time to open the database and load the sqlite3mc
  // worker/wasm - the whole point of this check.
  await page.waitForSelector('.app[data-boot="ready"]', { timeout: 30000 });
  await page.waitForTimeout(1000);

  // Confirms boot() actually ran and fetched the encrypted driver's
  // wasm/worker, rather than the zero-external-requests check above
  // passing vacuously because nothing loaded at all.
  if (allRequests.some((u) => u.includes('.wasm'))) ok("boot() loads the sqlite3mc wasm build from the app's own origin");
  else fail("boot() loads the sqlite3mc wasm build from the app's own origin", `no .wasm request seen; requests were: ${allRequests.join(', ')}`);

  /* The gate steps aside once the mode is set up, and onboarding picks up
     exactly where it left off - its own lock-step content (the
     lock-on-leave toggle), not a jump back to the welcome screen and not a
     stall on the gate's own screen. */
  await page.waitForSelector('[data-next]', { timeout: 10000 });
  ok('onboarding continues on its own lock step once the access mode is set up');

  await page.locator('[data-next]').click(); // lock -> checkin
  await page.locator('[data-next]').click(); // checkin -> done
  await page.locator('[data-finish]').click();
  await page.waitForSelector('[data-home-hello]');
  ok('finishing onboarding lands on Home');

  /* 32.1's own race, on the real flow rather than the demo build's
     simulated one this time: a late navigation landing after the walk must
     not undo where it actually finished. */
  await page.waitForTimeout(2500);
  if (page.url() === `${origin}/`) ok('Home stays put - no late navigation undid finishing onboarding');
  else fail('Home stays put after finishing onboarding', page.url());

  /* The session rule (ADR-0018), on the production build - the walkthrough
     can't test this because the demo build unlocks itself: a reload ends
     the unlocked session, the unwrapped key dies with it, and the journal
     opens again only for the passphrase.

     This doubles as ticket 54's other half: a returning user, with a
     keystore already on the device, still meets the gate first - the
     first-run exception above only ever applied to needs-setup, and a
     reload here is needs-unlock. Nothing onboarding does is reachable from
     this screen; there is no [data-next] to find. */
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('#journal-passphrase', { timeout: 10000 });
  const confirmField = await page.locator('#journal-passphrase-confirm').count();
  if (confirmField === 0) ok('a returning user meets the unlock gate first, exactly as before (unlock, not onboarding)');
  else fail('a returning user meets the unlock gate first', 'the setup form rendered instead of the unlock form');

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

  /* A fresh profile is a first run, and a production first run's own first
     screen is onboarding's welcome now (ticket 54) - walk it the way a
     person would, meeting the gate only once it reaches the one step that
     actually needs a database. */
  await cold.waitForSelector('[data-next]', { timeout: 10000 });

  /* Gripped by handle rather than by class (ADR-0029). These were
     `.home-hello`, `.quicklog .mood-btn` and `.entry-card`, and phase 5
     ticket 21 rebuilt Home out of the surface kit - none of the three
     survived, and each would have failed here as an anonymous 30s timeout
     rather than as a name. The rule the walkthrough keeps applies to every
     suite that drives a real screen; only walkthrough-locators.test.ts was
     watching, and it watches one file.

     Walking it is what puts a journal on the device, and the quick log
     after it is the entry the offline start has to read back. */
  /* Walked to the end rather than counted out. It was five clicks and a
     finish, which stopped being the flow when 7d11edfd made the first run
     seven steps, and failed here as an anonymous 30s wait for [data-finish] -
     the same shape ADR-0029 is about. The bound is a runaway guard, not the
     step count: onboarding-steps has seven today and the flow is one shorter
     under disguise.

     This loop naturally stops at the lock step: reaching it is what turns
     the gate back on (ticket 54), so [data-next] - onboarding's own control -
     is briefly gone from the page while the access-mode module has it. */
  for (let step = 0; step < 12 && (await cold.locator('[data-next]').count()); step++) {
    await cold.locator('[data-next]').click();
  }

  await cold.waitForSelector('[data-access-modes]', { timeout: 10000 });
  await cold.locator('[data-list-row="passphrase"]').click();
  await cold.fill('#am-passphrase', 'verify-build passphrase');
  await cold.fill('#am-passphrase-confirm', 'verify-build passphrase');
  await cold.click('[data-access-submit]');
  await cold.waitForSelector('.app[data-boot="ready"]', { timeout: 30000 });

  // Onboarding picks back up on its own lock step once the mode is set up,
  // the same second half the throwaway context above already walked.
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
  await openScreen(cold, origin, '/settings');
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
  const shell = await measureCache(cold);
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

  /* The download notice, read off the built bundle rather than off the
     screen: what can be checked here is that the copy shipped and that both
     languages of it did. The walkthrough drives the screen itself and checks
     the notice is actually on it, in whichever one locale that runs in. */
  const shipped = emittedAssets();
  /* Read out of the catalogues rather than restated here, so a reworded notice
     stays checked instead of quietly failing (ADR-0029's rule, applied to copy
     this file has to name). */
  const notice = ['messages/en.json', 'messages/pl.json']
    .map((catalogue) => JSON.parse(readFileSync(catalogue, 'utf8')).labs_ocr_download_title)
    .filter((line) => shipped.includes(line));
  if (notice.length === 2) ok('the scanner ships the line that says what it is about to download, in both languages');
  else fail('the scanner ships its download notice in both languages', `found ${notice.length} of 2`);

  /* Loading the engine, which is what puts it in the cache: the same files
     ocr-engine.ts fetches, then the same ask it sends afterwards. */
  const online = await loadAndKeepOcrEngine(cold, OCR_ASSETS, 'gender-diary:cache-on-demand');
  if (typeof online === 'string') fail('the OCR engine loads from the app origin', online);
  else ok('the OCR engine loads from the app origin');
  const onlineSizes = typeof online === 'string' ? {} : online.sizes;

  /* The worker fills its cache off the message, so the wait is for the cache
     rather than for a reply: the ask is deliberately one-way. Polled with
     plain evaluates rather than waitForFunction, whose default polling runs on
     animation frames - which a page that is not the frontmost tab does not
     get, and this one has had a second page opened over it. */
  for (let attempt = 0; attempt < 60; attempt++) {
    const cached = await cold.evaluate(async (assets) => {
      const cache = await caches.open((await caches.keys())[0]);
      let found = 0;
      for (const asset of assets) if (await cache.match(asset)) found++;
      return found;
    }, OCR_ASSETS);
    if (cached === OCR_ASSETS.length) break;
    await cold.waitForTimeout(1000);
  }

  const afterUse = await measureCache(cold);
  const cachedOcr = afterUse.paths.filter((path) => path.startsWith('/tesseract/')).length;
  if (cachedOcr === OCR_ASSETS.length)
    ok(
      `loading the engine adds it to the same release cache (${afterUse.paths.length} entries, ${(
        afterUse.bytes / 1e6
      ).toFixed(2)} MB)`
    );
  else fail('loading the engine adds it to the release cache', `${cachedOcr} of ${OCR_ASSETS.length} OCR files cached`);

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
    /* The PDF renderer, both halves (phase 8 features ticket 55). Its
       worker only reaches the shell through the emitted-client-assets
       plugin, since Vite's worker pipeline is invisible to SvelteKit's own
       manifest - the same reason SQLocal's worker is named above. The
       fonts are the fourteen standard faces a document may name without
       carrying: without them a page of an opened document draws blank,
       and it would draw blank exactly when there is no network, which is
       when this store matters most (ADR-0065). */
    "the PDF renderer's worker": shell.paths.some((path) => /\/_app\/immutable\/workers\/pdf-worker-[^/]+\.js$/.test(path)),
    'every standard PDF font': readdirSync(new URL('../../static/pdf-fonts/', import.meta.url)).every((font) =>
      shell.paths.includes(`/pdf-fonts/${font}`)
    ),
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
  await openScreen(cold, origin, '/settings');
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

  /* The half of ticket 01 the whole trade rests on: the engine was loaded once
     while there was a network, and this is a different browser process against
     an origin that is gone. Every byte below can only come from the cache the
     page asked the worker to fill.

     Sizes compared against the files on disk, because a 200 proves less than
     it looks: an offline fetch that fell through to a cached error page would
     also be ok. */
  const offlineEngine = await deep.evaluate(async (assets) => {
    const sizes = {};
    for (const asset of assets) {
      const response = await fetch(asset).catch(() => null);
      sizes[asset] = response && response.ok ? (await response.blob()).size : 0;
    }
    return sizes;
  }, OCR_ASSETS);
  const short = OCR_ASSETS.filter((asset) => !offlineEngine[asset] || offlineEngine[asset] !== onlineSizes[asset]);
  if (short.length === 0)
    ok(
      `with the network gone the OCR engine still loads whole from the shell (${(
        Object.values(onlineSizes).reduce((a, b) => a + b, 0) / 1e6
      ).toFixed(1)} MB across ${OCR_ASSETS.length} files)`
    );
  else
    fail(
      'with the network gone the OCR engine still loads whole from the shell',
      short.map((asset) => `${asset}: ${offlineEngine[asset]} of ${onlineSizes[asset]} bytes`).join(', ')
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
