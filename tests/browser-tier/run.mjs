/* Browser tier (ticket 03): the Node tier (vitest.config.ts) cannot
   exercise SQLocal, which needs a real browser's OPFS. This script serves
   the probe pages in this directory over a standalone dev server, drives
   a real Chromium through them with Playwright, and prints PASS/FAIL
   lines like tests/walkthrough.test.mjs. Run with `npm run test:browser`.

   One dev server and one browser for the whole file; each ticket adds its
   own probe page + a `run(...)` block below rather than its own script. */
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { readFile } from 'node:fs/promises';
import { createReporter, launchChromium } from '../browser-harness.mjs';
import { readyAttr, resultGlobal } from '../probe-handshake.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const { ok, fail, finish, block } = createReporter();

const server = await createServer({ configFile: `${here}/browser-tier.vite.config.ts`, server: { port: 0 } });
await server.listen();
const port = server.config.server.port;

/* Fake camera and microphone, for phase 5 ticket 22's probe: video notes
   record through getUserMedia, and the only way to exercise the real capture
   path headlessly is to give Chromium a synthetic device and pre-grant the
   permission. Inert for every other probe here - none of them ask for a
   media device. The fake camera produces a moving pattern with a tone on the
   audio track, which is exactly what a re-encode has to carry over. */
const browser = await launchChromium({
  args: [
    '--use-fake-device-for-media-stream',
    '--use-fake-ui-for-media-stream',
    '--autoplay-policy=no-user-gesture-required'
  ]
});
const page = await (await browser.newContext()).newPage();

/* A module that throws on import (the familiar `$state is not defined` from
   a probe reaching a Svelte store without the plugin, or any other load-time
   error) never calls publish() at all, so waitForSelector below would just
   run out its 30s default and read as an anonymous timeout. Forwarding
   `pageerror` and racing it against the wait means load() fails with the
   error's own text, attributed to whichever probe was loading when it
   fired - see docs/agents/verification.md on why this differs from
   walkthrough.test.mjs's policy of collecting page errors instead. */
let onPageError;
page.on('pageerror', (error) => onPageError?.(error));

/** Loads `path`, waits for `name`'s ready attribute to appear, and reads
    `name`'s result global off `window` (tests/probe-handshake.mjs derives
    both from `name`, the same way the probe page publishing them does).
    Reload the same page and call again to check persistence. */
async function load(path, name) {
  const failure = new Promise((_resolve, reject) => {
    onPageError = reject;
  });
  try {
    await Promise.race([
      (async () => {
        await page.goto(`http://localhost:${port}${path}`, { waitUntil: 'networkidle' });
        await page.waitForSelector(`body[${readyAttr(name)}]`, { state: 'attached' });
      })(),
      failure
    ]);
  } finally {
    onPageError = undefined;
  }
  return page.evaluate((key) => window[key], resultGlobal(name));
}
const reload = () => page.reload({ waitUntil: 'networkidle' });

// --- Ticket 03: FTS5 + OPFS mechanics, against a synthetic table -----------
await block('ticket 03 browser tier', 5, async () => {
  const first = await load('/', 'probe');
  if (first.error) throw new Error(first.error);

  if (first.markerExisted === false) ok('SQLocal opens a fresh database backed by OPFS');
  else fail('SQLocal opens a fresh database backed by OPFS', 'marker row already existed on first load');

  const { fts5 } = first;
  if (fts5.gesla === 1) ok("FTS5 remove_diacritics folds ą/ę/ś in 'zażółć gęślą jaźń'");
  else fail("FTS5 remove_diacritics folds ą/ę/ś in 'zażółć gęślą jaźń'", `got ${fts5.gesla} match(es)`);

  if (fts5.lozku === 0) ok('FTS5 does not fold ł (ADR-0005: no canonical decomposition)');
  else fail('FTS5 does not fold ł (ADR-0005: no canonical decomposition)', `got ${fts5.lozku} match(es), expected 0`);

  if (fts5.zazolc === 0) ok("'zazolc' finds nothing without app-level folding, confirming ADR-0005's premise");
  else fail("'zazolc' finds nothing without app-level folding, confirming ADR-0005's premise", `got ${fts5.zazolc} match(es)`);

  await reload();
  const second = await load('/', 'probe');
  if (second.error) throw new Error(second.error);
  if (second.markerExisted === true) ok('OPFS survives a full page reload');
  else fail('OPFS survives a full page reload', 'marker row was gone after reload');
});

// --- Ticket 04: the real driver + boot() against the real schema -----------
await block('ticket 04 browser tier', 7, async () => {
  const first = await load('/driver.html', 'driver-probe');
  if (first.error) throw new Error(first.error);

  /* Compared against the migration list rather than a literal. This read
     `=== 6` from ticket 04 until phase 5 ticket 22, so it had been failing
     since v7 and saying nothing useful while it did - a hardcoded schema
     version is exactly what goes stale first, and it collides between
     branches besides. */
  if (first.userVersion === first.latestSchemaVersion)
    ok(`boot() opens the database and migrates it to the current schema (v${first.userVersion})`);
  else
    fail(
      'boot() opens the database and migrates it to the current schema',
      `user_version is ${first.userVersion}, migrations.ts says ${first.latestSchemaVersion}`
    );

  if (first.markerExisted === false) ok('boot() runs against a fresh database on first load');
  else fail('boot() runs against a fresh database on first load', 'marker entry already existed');

  ok(`navigator.storage.persist() resolved (denied: ${first.persistDenied})`);

  // Ticket 07: run()'s changes/lastInsertRowid contract, which the
  // journal's throw-on-unknown-id behaviour sits on (ADR-0002/0017).
  const rc = first.runContract;
  if (rc.insertChanges === 1 && rc.updateChanges === 1 && rc.missChanges === 0)
    ok('run() reports changes truthfully for an insert, a hit and a miss');
  else fail('run() reports changes truthfully for an insert, a hit and a miss', JSON.stringify(rc));
  if (rc.lastInsertRowid === rc.rowidByUuid && typeof rc.lastInsertRowid === 'number')
    ok('run() reports lastInsertRowid as the row just inserted (checked against its uuid)');
  else fail('run() reports lastInsertRowid as the row just inserted (checked against its uuid)', JSON.stringify(rc));

  // Ticket 10: the streak counts consecutive days with a window function,
  // and this build is the only one that can tell us whether it has them.
  if (first.windowFunctionRun >= 1) ok('the WASM build has the window functions the streak counts runs with');
  else fail('the WASM build has the window functions the streak counts runs with', JSON.stringify(first.windowFunctionRun));

  await reload();
  const second = await load('/driver.html', 'driver-probe');
  if (second.error) throw new Error(second.error);
  if (second.markerExisted === true) ok('data written before a reload is still there after boot() re-runs');
  else fail('data written before a reload is still there after boot() re-runs', 'marker entry was gone after reload');
});

// --- Ticket 09: folded search against the WASM SQLite, via the journal ----
await block('ticket 09 browser tier', 12, async () => {
  const r = await load('/search.html', 'search-probe');
  if (r.error) throw new Error(r.error);

  const eq = (label, actual, expected) => {
    if (JSON.stringify(actual) === JSON.stringify(expected)) ok(label);
    else fail(label, `got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
  };

  // The case FTS5 cannot do on its own: ticket 03's probe proves plain FTS5
  // returns nothing for 'zazolc' and for ł. Through the fold, both land.
  eq("'lozko' finds 'łóżko' in the WASM build", r.folded.lozko, [r.ids.bed]);
  eq("'zazolc' finds 'zażółć' in the WASM build", r.folded.zazolc, [r.ids.gesla]);
  eq("'cwiczenia' finds 'ćwiczenia' in the WASM build", r.folded.cwiczenia, [r.ids.cwiczenia]);
  eq('prefix matching works in the WASM build', r.folded.prefix, [r.ids.cwiczenia]);
  eq('typing the accented form folds the same way', r.folded.accentedInput, [r.ids.bed]);
  eq('a matched tag finds the entry carrying it', r.tagOnly, [r.ids.tagged]);

  // A letter foldText does not cover has to stay one token, or the word it
  // sits in stops matching itself.
  eq("'Müller' finds the note it was typed from", r.unfolded.asTyped, [r.ids.muller]);
  eq("'muller' finds it too, unicode61 folding ü on both sides", r.unfolded.asAscii, [r.ids.muller]);
  eq('the fold still reaches ł in that same note', r.unfolded.polishInSameNote, [r.ids.muller]);

  eq('editing a note leaves none of the old text in the index', r.afterEdit.old, []);
  eq('editing a note indexes the new text', r.afterEdit.new, [r.ids.bed]);
  eq('a deleted entry leaves the index', r.afterDelete, []);
});

// --- Ticket 12: crypto primitives, and hash-wasm's no-network-fetch claim -
await block('ticket 12 browser tier', 3, async () => {
  const requestUrls = [];
  const onRequest = (req) => requestUrls.push(req.url());
  page.on('request', onRequest);

  const result = await load('/crypto.html', 'crypto-probe');
  page.off('request', onRequest);
  if (result.error) throw new Error(result.error);

  if (result.archiveKeyLength === 32 && result.pinKeyLength === 32) ok('Argon2id derives a 32-byte key for both the archive and PIN parameter sets');
  else fail('Argon2id derives a 32-byte key for both the archive and PIN parameter sets', `got archive=${result.archiveKeyLength} pin=${result.pinKeyLength}`);

  if (result.roundTripOk) ok('AES-256-GCM round-trips a real derived key through encrypt/decrypt');
  else fail('AES-256-GCM round-trips a real derived key through encrypt/decrypt', 'decrypted text did not match');

  const wasmRequests = requestUrls.filter((u) => u.includes('.wasm'));
  if (wasmRequests.length === 0) ok('hash-wasm makes no separate request for its WASM - it is bundled as base64, not fetched');
  else fail('hash-wasm makes no separate request for its WASM - it is bundled as base64, not fetched', wasmRequests.join(', '));
});

// --- Ticket 11: normalize() against a real canvas, and the OPFS store -----
await block('ticket 11 browser tier', 22, async () => {
  const r = await load('/photos.html', 'photos-probe');
  if (r.error) throw new Error(r.error);

  const size = (s) => `${s.width}x${s.height}`;

  if (size(r.bigFull) === '2048x1536') ok('a 4000x3000 photo normalizes to 2048px on the long edge (ADR-0008)');
  else fail('a 4000x3000 photo normalizes to 2048px on the long edge (ADR-0008)', `got ${size(r.bigFull)}`);

  if (size(r.smallFull) === '300x200') ok('a photo smaller than the cap is not upscaled');
  else fail('a photo smaller than the cap is not upscaled', `got ${size(r.smallFull)}`);

  if (size(r.bigThumb) === '320x240' && r.thumbIsSmallerFile)
    ok('a thumbnail is generated alongside, small enough that the grid never decodes a full photo');
  else fail('a thumbnail is generated alongside', `${size(r.bigThumb)}, smaller file: ${r.thumbIsSmallerFile}`);

  // The fixture has to carry EXIF in, or "no EXIF out" proves nothing.
  if (r.inputMarkers.includes('APP1/Exif')) ok('the orientation fixture really does carry EXIF going in');
  else fail('the orientation fixture really does carry EXIF going in', JSON.stringify(r.inputMarkers));

  // ADR-0015's claim, segment by segment: EXIF and XMP ride in APP1,
  // Photoshop/IPTC in APP13, free text in COM. None may survive.
  const carried = [...r.outputMarkers, ...r.thumbMarkers].filter((name) => !name.startsWith('APP2/ICC_PROFILE'));
  if (carried.length === 0)
    ok('normalize() leaves no EXIF, GPS, IPTC or comment metadata in the photo or its thumbnail (ADR-0015)');
  else
    fail(
      'normalize() leaves no EXIF, GPS, IPTC or comment metadata in the photo or its thumbnail (ADR-0015)',
      JSON.stringify(carried)
    );

  // The one segment that does survive, and where it comes from. Both
  // fixtures have to be what they claim, or the inference is circular.
  if (r.strippedSourceHadNone && r.forgedSourceCarriedIt)
    ok('the ICC fixtures are what they claim: one source with no profile, one with a forged profile');
  else
    fail(
      'the ICC fixtures are what they claim',
      `stripped had none: ${r.strippedSourceHadNone}, forged carried it: ${r.forgedSourceCarriedIt}`
    );

  if (r.encoderAddsProfile)
    ok(`the ${r.iccProfileLength}-byte ICC profile comes from the encoder: a source with none comes back with one`);
  else fail('the ICC profile comes from the encoder', 'a source with no profile came back with none either');

  if (!r.forgedProfileSurvived)
    ok("a source's own ICC profile does not survive the re-encode, so no device name can ride in on one");
  else
    fail(
      "a source's own ICC profile does not survive the re-encode",
      'the forged profile came back out, so profiles are carried over from the photo'
    );

  if (size(r.rotatedSize) === '50x100')
    ok('EXIF orientation 6 is baked into the pixels: a 100x50 landscape stores as a 50x100 portrait');
  else
    fail(
      'EXIF orientation 6 is baked into the pixels: a 100x50 landscape stores as a 50x100 portrait',
      `got ${size(r.rotatedSize)} - if it is 100x50 the tag was dropped without applying it`
    );

  if (r.heic?.name === 'UnsupportedImageError' && /HEIC/.test(r.heic.message))
    ok('HEIC is refused by name with a message that says what to do, not silently dropped');
  else fail('HEIC is refused by name with a message that says what to do', JSON.stringify(r.heic));

  if (r.junk?.name === 'UnsupportedImageError') ok('a file that is not an image is refused the same way');
  else fail('a file that is not an image is refused the same way', JSON.stringify(r.junk));

  if (JSON.stringify(r.readBack) === '[1,2,3,4,5]' && r.listed.includes('probe.jpg'))
    ok('the OPFS store writes, lists and reads a photo back byte for byte');
  else fail('the OPFS store writes, lists and reads a photo back byte for byte', JSON.stringify(r.readBack));

  if (r.readMissing === null) ok('reading a file that is not there answers null rather than throwing');
  else fail('reading a file that is not there answers null rather than throwing', JSON.stringify(r.readMissing));

  if (!r.listedAfterRemove.includes('probe.jpg') && r.removeMissingWasQuiet)
    ok('remove takes the file, and removing what is not there stays quiet');
  else fail('remove takes the file, and removing what is not there stays quiet', JSON.stringify(r.listedAfterRemove));

  // The safety property: the sweep deletes everything the store lists, so
  // the store must see only its own directory - never the SAHPool
  // directory holding the database (ticket 09 moved it off the root).
  const photoRoot = String(r.photoDirectory).split('/')[0];
  const poolDir = r.rootNames.find((n) => n.includes('sahpool') || n.includes('mc-pool'));
  if (r.rootNames.includes(photoRoot) && poolDir && !r.listed.includes(poolDir))
    ok(`photos live in ${r.photoDirectory}/, so the sweep can never see the database pool (${poolDir}/)`);
  else
    fail(
      'photos live in their own directory, so the sweep can never see the database pool',
      `root: ${JSON.stringify(r.rootNames)}, store listed: ${JSON.stringify(r.listed)}`
    );

  if (r.storedPhotoIsCiphertext) ok('the photo file on raw OPFS carries no JPEG signature - ciphertext, not a photo');
  else fail('the photo file on raw OPFS carries no JPEG signature', 'raw bytes start with a JPEG SOI marker');

  // The whole path, end to end, on the real driver and real OPFS.
  const rt = r.roundTrip;
  if (rt.photoCount === 1 && rt.fileName === rt.expectedFileName)
    ok('a normalized photo attaches to an entry and reads back under its opaque uuid name');
  else fail('a normalized photo attaches to an entry and reads back', JSON.stringify(rt));

  if (r.thumbFromStore && `${r.thumbFromStore.width}x${r.thumbFromStore.height}` === '320x213' && r.fullIsStoredToo)
    ok('the thumbnail loads from the store at 320px, so the Progress grid never decodes the full photo');
  else
    fail(
      'the thumbnail loads from the store at 320px',
      `${JSON.stringify(r.thumbFromStore)}, full stored: ${r.fullIsStoredToo}`
    );

  if (r.filesAfterDelete.length === 0) ok('deleting the entry takes the photo and its thumbnail off real storage');
  else fail('deleting the entry takes the photo and its thumbnail off real storage', JSON.stringify(r.filesAfterDelete));

  const sweptToKeptOnly =
    r.filesAfterSweep.length === 2 && r.filesAfterSweep.every((n) => n.startsWith(r.keptPhotoId));
  if (sweptToKeptOnly) ok('the boot sweep reclaims a file no row references, against real OPFS');
  else fail('the boot sweep reclaims a file no row references, against real OPFS', JSON.stringify(r.filesAfterSweep));

  /* The picker, driven through a real file dialog. Two files rather than
     one, because an entry holds several photos and the input is set
     multiple; the bytes are handed straight to normalize(), which is what
     ticket 08's editor will do with them. A 1x1 PNG is enough - what is
     being tested is that bytes survive the trip, not what they depict. */
  const pngBuffer = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'
  );

  page.once('filechooser', async (chooser) => {
    await chooser.setFiles([
      { name: 'first.png', mimeType: 'image/png', buffer: pngBuffer },
      { name: 'second.png', mimeType: 'image/png', buffer: pngBuffer }
    ]);
  });
  await page.click('#pick');
  await page.waitForFunction(() => window.__pickerResult !== undefined, null, { timeout: 5000 });
  const picked = await page.evaluate(() => window.__pickerResult);

  if (picked.error) throw new Error(`picker: ${picked.error}`);
  // 0x89 'P' 'N' 'G' - the bytes arrive as the file's own, not re-encoded
  // by the picker, which only reads them.
  if (picked.count === 2 && JSON.stringify(picked.firstBytes) === JSON.stringify([137, 80, 78, 71]))
    ok('the web picker returns the raw bytes of every file chosen, ready for normalize()');
  else fail('the web picker returns the raw bytes of every file chosen', JSON.stringify(picked));

  if (picked.normalizedSizes.length === 2 && picked.normalizedSizes.every((s) => s.width === 1 && s.height === 1))
    ok('picked bytes go straight into normalize() with no filename or MIME type involved');
  else fail('picked bytes go straight into normalize()', JSON.stringify(picked.normalizedSizes));
});

// --- Ticket 13: the archive, packed on the real platform and downloaded --
await block('ticket 13 browser tier', 10, async () => {
  const r = await load('/archive.html', 'archive-probe');
  if (r.error) throw new Error(r.error);

  /* Format version 2 (phase 5 ticket 35): the payload's preferences
     changed shape (the active preset became the list of scales it stood
     for), which moved the version this probe writes and reads without
     touching the body layout it is actually checking here. See
     src/lib/data/archive/codec.ts's own comment on archiveCodecV2. */
  if (r.header.formatVersion === 2 && r.spansChunks)
    ok(`a real journal packs into ${r.header.totalChunks} chunks of ${r.header.chunkSize} bytes (${r.archiveLength} bytes, ${r.packMs}ms including the KDF)`);
  else fail('a real journal packs into several chunks', JSON.stringify(r.header));

  const manifest = JSON.stringify(r.manifest);
  if (manifest === JSON.stringify(r.unpacked) && r.photoMatches)
    ok('every photo and thumbnail comes back out of the archive, byte for byte, through the browser\'s own WebCrypto');
  else fail('every photo and thumbnail comes back out of the archive', `${manifest} in, ${JSON.stringify(r.unpacked)} out`);

  if (r.entry?.note === 'zażółć gęślą jaźń' && r.entry.dims?.femininity === 60 && r.entry.tags?.includes('e-happy'))
    ok('the entry round-trips with its note, dimension values and tags');
  else fail('the entry round-trips with its note, dimension values and tags', JSON.stringify(r.entry));

  if (r.preferences?.name === 'Alicja' && r.preferences.theme === 'dark' && !('pinHash' in r.preferences) && !r.pinHashInPlaintext)
    ok('portable preferences travel and the PIN hash appears nowhere in the file (ADR-0003)');
  else fail('portable preferences travel and the PIN hash appears nowhere in the file', JSON.stringify(r.preferences));

  if (r.wrongPassword?.name === 'DecryptionFailedError' && r.wrongPassword.message === 'wrong password')
    ok('a wrong password fails with nothing but "wrong password"');
  else fail('a wrong password fails with nothing but "wrong password"', JSON.stringify(r.wrongPassword));

  /* Ticket 14: the same archive restored into another journal on the real
     platform, where a Replace is a dozen deletes and every insert inside one
     BEGIN/COMMIT through SQLocal's worker. */
  const restored = r.restored ?? {};
  if (
    restored.entries === 1 &&
    restored.note === 'zażółć gęślą jaźń' &&
    restored.dims?.femininity === 60 &&
    restored.tags?.includes('e-happy') &&
    restored.milestones === 1 &&
    restored.photos === 2 &&
    /* Seven built-in gender dimensions today (src/lib/data/vocabulary/
       builtins.ts's BUILT_IN_DIMENSIONS) - social_recognition and
       gender_stability joined the original five after this count was
       last written here. */
    restored.builtInDimensions === 7 &&
    restored.photoBytesMatch
  )
    ok('a Replace installs the archive over the encrypted driver and OPFS: rows, photo bytes and the built-ins it kept by key');
  else fail('a Replace installs the archive over the encrypted driver and OPFS', JSON.stringify(restored));

  if (restored.searchHits === 1)
    ok("a restored note is in the search index, folded by the import rather than carried in the file");
  else fail('a restored note is in the search index', JSON.stringify(restored.searchHits));

  const second = r.afterSecondImport ?? {};
  if (
    second.entries === restored.entries &&
    second.photos === restored.photos &&
    second.tagRows === restored.tagRows &&
    second.milestones === restored.milestones
  )
    ok('merging the same archive again on the real platform changes nothing');
  else fail('merging the same archive again changes nothing', `${JSON.stringify(restored)} then ${JSON.stringify(second)}`);

  // The archive really becomes a file: a click, a download, and bytes on
  // disk that plain Node - which knows nothing about this app - can read
  // the header of, which is the whole point of the header being plaintext.
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#deliver')]);
  const saved = await download.path();
  const bytes = await readFile(saved);
  const delivery = await page.evaluate(() => window.__deliveryResult);

  if (download.suggestedFilename() === `alicja-journal-${delivery.localDay}.ttbackup` && delivery.delivery === 'downloaded')
    ok(`the archive downloads as ${download.suggestedFilename()}`);
  else fail('the archive downloads under a dated name', `${download.suggestedFilename()}, ${JSON.stringify(delivery)}`);

  const magic = bytes.subarray(0, 6).toString('latin1');
  const headerJson = JSON.parse(bytes.subarray(12, 12 + bytes.readUInt32BE(8)).toString('utf8'));
  // Version byte read raw off the file, deliberately not through the app's
  // own decoder (see this block's own comment above) - 2, same as r.header
  // .formatVersion above, for the same format-version-2 reason.
  if (bytes.length === r.archiveLength && magic === 'GDIARY' && bytes.readUInt16BE(6) === 2 && headerJson.totalChunks === r.header.totalChunks)
    ok('the downloaded file is the archive, and its version, KDF parameters and salt read without a password');
  else fail('the downloaded file is the archive with a readable plaintext header', `${bytes.length} bytes, magic ${magic}`);

  // Cross-platform archive round-trips now run in the Android tier, where
  // one probe can boot both the web and Android storage stacks in one app.
  console.log('INFO  cross-platform archive round-trips are verified in tests/android-tier');
});

// --- Ticket 09 (phase 2): at-rest encryption, gated by the closed-app scan -
await block('ticket 09 (phase 2) browser tier', 10, async () => {
  const r = await load('/encryption.html', 'encryption-probe');
  if (r.error) throw new Error(r.error);

  if (r.keystoreRoundTrips) ok('the keystore file round-trips: unlock returns the same data key that was created');
  else fail('the keystore file round-trips', 'unlocked key differs from the created one');

  // F-08 (ticket 04): the web database cipher is pinned rather than left to
  // sqlite3mc's compiled default.
  if (r.cipher === 'chacha20') ok(`the web database cipher is pinned explicitly (${r.cipher})`);
  else fail('the web database cipher is pinned explicitly', `got ${JSON.stringify(r.cipher)}`);

  // F-08's compatibility risk: a journal written under sqlite3mc's implicit
  // cipher default - what every journal on disk was written under before
  // this ticket - still opens now that the cipher is pinned to chacha20.
  if (r.cipherCompat?.cipher === 'chacha20' && r.cipherCompat?.readBack === 'sentinel-cipher-compat-8420')
    ok('a database written under the pre-pin implicit cipher default still opens under the pinned cipher');
  else fail('a database written under the implicit cipher default still opens pinned', JSON.stringify(r.cipherCompat));

  if (r.searchHitsWhileOpen >= 1) ok(`FTS5 searches the encrypted journal while it is open (${r.searchHitsWhileOpen} hits)`);
  else fail('FTS5 searches the encrypted journal while it is open', `got ${r.searchHitsWhileOpen} hits`);

  /* The claim gate itself. Every persistent file the closed app left -
     SAHPool pool files (database, side files, the pre-migration copy),
     encrypted photos, the keystore - and every localStorage value, scanned
     for seeded entry text, lab strings, a reminder title, a milestone
     name, a preference value, a half-written draft's note, photo body text
     and the JPEG signature. */
  const dirtyFiles = r.scan.filter((f) => f.found.length > 0);
  if (r.scan.length >= 3 && dirtyFiles.length === 0)
    ok(`closed-app scan: no protected content readable in any of ${r.scan.length} OPFS files (pre-migration copy included)`);
  else
    fail(
      'closed-app scan: no protected content readable in any OPFS file',
      dirtyFiles.map((f) => `${f.path}: ${f.found.join(', ')}`).join('; ') || `only ${r.scan.length} files scanned`
    );

  /* Both mirrors have to be on the scan's plate for a clean scan to mean
     anything: the boot cache, and the entry-draft mirror an editor leaves
     behind mid-edit (sec-audit 02, finding G-01) - the one writer that puts
     journal text in localStorage at all. */
  const dirtyKeys = r.localStorageScan.filter((k) => k.found.length > 0);
  if (r.bootCachePresent && r.draftMirrorPresent && dirtyKeys.length === 0)
    ok('closed-app scan: the localStorage boot mirror and the entry-draft mirror hold none of the protected content');
  else
    fail(
      'closed-app scan: localStorage holds none of the protected content',
      dirtyKeys.map((k) => `${k.key}: ${k.found.join(', ')}`).join('; ') ||
        `mirrors written: boot cache ${r.bootCachePresent}, entry draft ${r.draftMirrorPresent}`
    );

  if (r.draftMirrorRestored === 'sentinel-draft-note-half-written-5583' && r.draftMirrorUnderWrongKey === null)
    ok('the encrypted entry-draft mirror restores under the journal key and reads as no draft under any other');
  else
    fail(
      'the encrypted entry-draft mirror restores under the journal key only',
      JSON.stringify({ restored: r.draftMirrorRestored, wrongKey: r.draftMirrorUnderWrongKey })
    );

  if (r.wrongPassphrase?.name === 'DecryptionFailedError' && r.wrongPassphrase.message === 'wrong password')
    ok('a wrong passphrase fails with nothing but "wrong password"');
  else fail('a wrong passphrase fails with nothing but "wrong password"', JSON.stringify(r.wrongPassphrase));

  if (r.reopenedNote === 'sentinel-note-woke-up-early-9351' && r.reopenedPhotoIntact)
    ok('the right passphrase brings back the journal and its photos through a full close');
  else fail('the right passphrase brings back the journal', JSON.stringify({ note: r.reopenedNote, photo: r.reopenedPhotoIntact }));

  if (r.oldPassphraseAfterRewrap?.name === 'DecryptionFailedError' && r.noteAfterRewrap === 'sentinel-note-woke-up-early-9351')
    ok('changing the passphrase rewraps the data key: old passphrase dead, journal untouched and readable');
  else
    fail(
      'changing the passphrase rewraps the data key',
      JSON.stringify({ old: r.oldPassphraseAfterRewrap, note: r.noteAfterRewrap })
    );

  if (r.wrongRawKey !== null) ok('a wrong raw key is refused by SQLite rather than read as garbage');
  else fail('a wrong raw key is refused by SQLite', 'a query under a random key succeeded');
});

// --- Ticket 10 (phase 2): converting a plaintext-era journal --------------
await block('ticket 10 (phase 2) browser tier', 14, async () => {
  const r = await load('/conversion.html', 'conversion-probe');
  if (r.error) throw new Error(r.error);

  /* The fixture first, or nothing below it means anything: this journal was
     written by the pre-encryption app, so every sentinel has to be sitting
     in the clear on disk before the conversion runs. */
  const expected = ['JPEG signature', 'entry note', 'lab analyte', 'milestone name', 'photo body', 'pin hash', 'preference name', 'reminder title'];
  if (JSON.stringify(r.plaintextScanFound) === JSON.stringify(expected))
    ok('the pre-encryption journal really is readable on disk: all 8 sentinels found before converting');
  else
    fail(
      'the pre-encryption journal is readable on disk before converting',
      `found ${JSON.stringify(r.plaintextScanFound)}`
    );

  if (r.stateBeforeConversion === 'convert') ok('a plaintext journal in the OPFS root is recognised as one to convert');
  else fail('a plaintext journal is recognised as one to convert', r.stateBeforeConversion);

  if (r.precheck?.ok === true && r.markerAfterPrecheck === 'preparing')
    ok('the precheck passes on a device with room, and leaves the marker before the keystore');
  else fail('the precheck passes and leaves a marker', JSON.stringify({ precheck: r.precheck, marker: r.markerAfterPrecheck }));

  // A keystore beside a plaintext journal is only unambiguous because the
  // marker is already there (conversion.ts's ordering rule).
  if (r.stateWithKeystoreMidConversion === 'convert')
    ok('a keystore written mid-conversion does not make the app think the journal is already encrypted');
  else fail('a keystore written mid-conversion is still a conversion', r.stateWithKeystoreMidConversion);

  if (r.copyBeforeRedoVerifies === true)
    ok('a copy written by an attempt that then died verifies, and the conversion below writes over it');
  else fail('an abandoned copy verifies and is written over', JSON.stringify(r.copyBeforeRedoVerifies));

  if (r.interrupted && r.markerAfterInterruption === 'photos' && r.stateAfterInterruption === 'convert' && r.sourceStillPresentMidPhotos)
    ok('killed part way through the photos: the marker says photos, and the plaintext journal is still on disk');
  else
    fail(
      'killed part way through the photos leaves a resumable state',
      JSON.stringify({ error: r.interrupted, marker: r.markerAfterInterruption, state: r.stateAfterInterruption })
    );

  if (r.markerAfterConversion === null && r.stateAfterConversion === 'unlock' && r.plaintextGone)
    ok('the resume finishes: marker cleared, plaintext journal retired, journal is one that unlocks');
  else
    fail(
      'the resume finishes the conversion',
      JSON.stringify({ marker: r.markerAfterConversion, state: r.stateAfterConversion, plaintextGone: r.plaintextGone })
    );

  /* The claim gate, on a journal that was plaintext ten seconds ago. Every
     OPFS file: the SAHPool pool files holding the converted database and
     its side files, the encrypted photos, the keystore - and no source, no
     pre-migration copy and no temporary artifact left over from the copy
     itself. */
  if (r.dirtyFiles.length === 0 && r.scan.length >= 3)
    ok(`closed-app scan after conversion: none of the 8 sentinels readable in any of ${r.scan.length} OPFS files`);
  else fail('closed-app scan after conversion finds no readable journal content', r.dirtyFiles.join('; ') || `only ${r.scan.length} files scanned`);

  const remnants = r.rootNames.filter((p) => p.includes('gender-diary.sqlite3'));
  if (remnants.length === 0) ok('no plaintext database, pre-migration copy or side file survives in the OPFS root');
  else fail('no plaintext database or side file survives in the OPFS root', JSON.stringify(remnants));

  if (r.dirtyKeys.length === 0 && r.bootMirror && !('pinHash' in r.bootMirror))
    ok('the boot mirror rewrites itself from the encrypted table, without the PIN hash it used to carry');
  else fail('the boot mirror loses the PIN hash', JSON.stringify({ dirty: r.dirtyKeys, mirror: r.bootMirror }));

  // The journal itself, read back through the passphrase.
  const carried =
    r.note === 'sentinel-converted-note-woke-up-early-4182' &&
    r.photoCount === 1 &&
    r.photoIntact &&
    r.milestones?.includes('sentinel-converted-milestone-first-day-2260') &&
    r.reminders?.includes('sentinel-converted-reminder-progynova-7715') &&
    r.labs?.includes('sentinel-converted-analyte-estradiol') &&
    r.preferenceName === 'sentinel-converted-preference-alicja-9014';
  if (carried) ok('every entry, photo, milestone, reminder, lab result and preference comes back through the passphrase');
  else fail('the whole journal comes back through the passphrase', JSON.stringify(r));

  // Whole-database, not export/import: restore.ts never touches the pref
  // table, so a device-local preference that survives proves the mechanism
  // (ADR-0003/0020).
  if (r.deviceLocalInDatabase === 'sentinel-converted-device-local-6801')
    ok('a device-local preference travels too - one an archive would have dropped');
  else fail('a device-local preference travels with the database', JSON.stringify(r.deviceLocalInDatabase));

  if (r.searchHits >= 1) ok(`the FTS5 index came across with the pages rather than being rebuilt (${r.searchHits} hits)`);
  else fail('the FTS5 index came across with the pages', `got ${r.searchHits} hits`);

  if (r.secondConvertPhoto === true) ok('converting an already-converted photo again leaves it readable, which is what a resume relies on');
  else fail('converting an already-converted photo is a no-op', JSON.stringify(r.secondConvertPhoto));
});

// --- Ticket 04 (phase 2): when a waiting release may take over ------------
await block('ticket 04 (phase 2) update guard', 5, async () => {
  const r = await load('/update.html', 'update-probe');
  if (r.error) throw new Error(r.error);

  /* The fixture first. Without a second release genuinely installed and
     waiting behind the first, everything below passes for the wrong reason. */
  if (r.secondReleaseWaiting) ok('a second release installs and waits behind the one running the page');
  else fail('a second release installs and waits', 'no worker ever reached registration.waiting');

  // Update while blocked, which is the whole point of the ticket.
  if (r.offeredWhileBlocked === false && r.appliedWhileBlocked === false && r.reloadsWhileBlocked === 0)
    ok('with a write in flight the update is neither offered nor applied');
  else
    fail(
      'with a write in flight the update is neither offered nor applied',
      JSON.stringify({ offered: r.offeredWhileBlocked, applied: r.appliedWhileBlocked, reloads: r.reloadsWhileBlocked })
    );

  /* And the consequence in the browser rather than in the app's own opinion
     of itself: the waiting worker is still waiting, and the page is still
     controlled by the release it loaded on. */
  if (r.stillWaitingAfterBlockedAttempt && r.controllerUnchanged)
    ok('the waiting worker really did not activate: same controller, still waiting');
  else
    fail(
      'the waiting worker does not activate during a write',
      JSON.stringify({ waiting: r.stillWaitingAfterBlockedAttempt, sameController: r.controllerUnchanged })
    );

  // Update when idle. Nothing happened between the two but the write landing.
  if (r.offeredOnceIdle) ok('the update is offered once the write lands, without anything else happening');
  else fail('the update is offered once the journal is idle', 'updateReady() stayed false');

  if (r.appliedWhenIdle && r.controllerChanged && r.nothingLeftWaiting && r.reloadsWhenIdle === 1)
    ok('applying it when idle hands the page to the new worker and reloads once');
  else
    fail(
      'applying the update when idle hands the page over',
      JSON.stringify({
        applied: r.appliedWhenIdle,
        controllerChanged: r.controllerChanged,
        nothingWaiting: r.nothingLeftWaiting,
        reloads: r.reloadsWhenIdle
      })
    );
});

// --- Ticket 04 (phase 2): forward migration, refusal and the copy ---------
await block('ticket 04 (phase 2) migration and rollback', 9, async () => {
  const r = await load('/migration.html', 'migration-probe');
  if (r.error) throw new Error(r.error);

  const before = ['sentinel-migration-note-before-the-update-5514'];
  const both = [...before, 'sentinel-migration-note-written-after-the-copy-8820'].sort();

  if (r.startingVersion === r.shippedVersion && JSON.stringify(r.startingNotes) === JSON.stringify(before))
    ok(`the fixture is a journal on the shipped schema (v${r.startingVersion}) with an entry in it`);
  else
    fail(
      'the fixture is a journal on the shipped schema',
      JSON.stringify({ version: r.startingVersion, notes: r.startingNotes })
    );

  if (r.forwardVersion === r.nextVersion && JSON.stringify(r.notesAfterForward) === JSON.stringify(before))
    ok('newer code migrates the older journal forward and the entry survives it');
  else
    fail(
      'newer code migrates an older journal forward, preserving data',
      JSON.stringify({ version: r.forwardVersion, notes: r.notesAfterForward })
    );

  if (r.copyAfterForward === true && r.copyAfterCleanBoot === false)
    ok('the pre-migration copy outlives the boot that migrated and goes on the next clean one');
  else
    fail(
      'the pre-migration copy is kept until the next clean boot',
      JSON.stringify({ afterMigrating: r.copyAfterForward, afterCleanBoot: r.copyAfterCleanBoot })
    );

  if (r.refusal && r.refusal.found === r.nextVersion && r.refusal.known === r.shippedVersion)
    ok('older code refuses a journal a newer schema touched, naming both versions');
  else fail('older code refuses a journal created by a newer schema', JSON.stringify(r.refusal));

  if (JSON.stringify(r.notesAfterRefusal) === JSON.stringify(before) && r.copyAfterRefusal === false)
    ok('the refusal leaves the journal exactly as it was, and takes no copy');
  else
    fail('the refusal changes nothing', JSON.stringify({ notes: r.notesAfterRefusal, copy: r.copyAfterRefusal }));

  if (
    typeof r.brokenMigration === 'string' &&
    r.brokenMigration !== 'nothing was thrown' &&
    r.versionAfterFailure === r.nextVersion
  )
    ok(`a failing migration rolls its step back and leaves the schema at v${r.versionAfterFailure}`);
  else
    fail(
      'a failing migration leaves the schema where it was',
      JSON.stringify({ thrown: r.brokenMigration, version: r.versionAfterFailure })
    );

  if (r.copyAfterFailure === true && r.copyAfterRetry === true)
    ok('the failure leaves a copy, and the retry does not spend it on a worse one');
  else
    fail(
      'a failed migration leaves a recoverable pre-migration copy',
      JSON.stringify({ afterFailure: r.copyAfterFailure, afterRetry: r.copyAfterRetry })
    );

  /* The box this exists to close: the copy verifies under the data key, goes
     back as the live journal, and what comes up is the journal from before -
     the entry written after the copy was taken is gone, which is how a
     restore that moved bytes tells itself from one that did nothing. */
  if (
    JSON.stringify(r.notesBeforeRestore) === JSON.stringify(both) &&
    JSON.stringify(r.notesAfterRestore) === JSON.stringify(before) &&
    r.versionAfterRestore === r.nextVersion
  )
    ok('the copy goes back as the live journal and the previous visible journal is what opens');
  else
    fail(
      'the app gets back to the previous visible journal',
      JSON.stringify({
        before: r.notesBeforeRestore,
        after: r.notesAfterRestore,
        version: r.versionAfterRestore
      })
    );

  if (r.copyAfterRestoredBoot === false)
    ok('and the restored journal coming up clean is what finally retires the copy');
  else fail('a clean boot after the restore retires the copy', JSON.stringify(r.copyAfterRestoredBoot));
});

// --- Ticket 27: the photo journey export, against a real canvas and MediaRecorder ---
await block('ticket 27 photo journey export', 19, async () => {
  const r = await load('/journey.html', 'journey-probe');
  if (r.error) throw new Error(r.error);

  const size = (s) => `${s.width}x${s.height}`;
  // JPEG survives a re-encode, so a flat colour comes back near it, not on it.
  const near = (got, want) => got.every((channel, i) => Math.abs(channel - want[i]) <= 16);
  /* VP8 is looser still: 4:2:0 chroma subsampling plus a full RGB-YUV-RGB
     round trip moves a flat red by about twenty per channel. Wide enough to
     accept that, nowhere near wide enough to confuse red with green or blue,
     which are what this is telling apart. */
  const nearInVideo = (got, want) => got.every((channel, i) => Math.abs(channel - want[i]) <= 32);
  const RED = [220, 40, 40];
  const GREEN = [40, 200, 80];
  const BLUE = [50, 80, 220];
  const SURROUND = [23, 21, 26];
  const MISSING = [43, 40, 48];

  if (r.collageSignature.join() === '255,216,255' && r.collageType === 'image/jpeg')
    ok('a collage comes back as real JPEG bytes, not a canvas nobody encoded');
  else fail('a collage comes back as real JPEG bytes', `${r.collageType}, starts ${r.collageSignature}`);

  if (size(r.collageSize) === size(r.expectedCollageSize))
    ok(`the collage is the size collageLayout() measured (${size(r.collageSize)})`);
  else fail('the collage is the size collageLayout() measured', `${size(r.collageSize)} vs ${size(r.expectedCollageSize)}`);

  const [first, second, third, empty] = r.cellColours;
  if (near(first, RED) && near(second, GREEN) && near(third, BLUE))
    ok('the cells hold the photos in journey order, oldest first');
  else fail('the cells hold the photos in journey order', JSON.stringify(r.cellColours.slice(0, 3)));

  if (near(empty, SURROUND)) ok('and a grid slot past the end of the journey stays empty rather than repeating a photo');
  else fail('a grid slot past the end of the journey stays empty', JSON.stringify(empty));

  // A portrait photo in a square cell: cropped to its centre, so the corner
  // of the cell is inside the photo. Letterboxing would leave the surround.
  if (near(r.portraitCornerColour, GREEN))
    ok(`a portrait photo is cropped to fill its square cell, not letterboxed (${r.coverOfPortrait.sHeight | 0}px taken from ${1200}px)`);
  else fail('a portrait photo is cropped to fill its square cell', JSON.stringify(r.portraitCornerColour));

  if (r.collageProgress.join() === '1,2,3') ok('progress is reported per photo, so a long export can say where it is');
  else fail('progress is reported per photo', JSON.stringify(r.collageProgress));

  // ADR-0008 leaves no original to go back to, so the export can only read
  // the stored files - and it reads the full photos, not the thumbnails the
  // grid draws, because a 320px thumbnail in a 360px cell would be visible.
  if (r.readsWereFullPhotos.every((name) => !name.includes('-thumb')))
    ok('the export consumes the stored full-size photos, never a thumbnail or an original (ADR-0008)');
  else fail('the export consumes the stored full-size photos', JSON.stringify(r.readsWereFullPhotos));

  if (r.missingPhotoStillRendered && near(r.gapColour, MISSING))
    ok('a photo with no file, reclaimed or never stored, leaves a gap rather than failing the whole export');
  else fail('a photo with no file leaves a gap', `rendered: ${r.missingPhotoStillRendered}, ${JSON.stringify(r.gapColour)}`);

  /* Ticket 27's out-of-scope line: no "upscaling beyond what the
     already-normalized source photos support". A 200px photo in a 360px cell
     sits at 200px, so the cell corner is still surround. */
  if (near(r.tinyCentreColour, GREEN) && near(r.tinyCornerColour, SURROUND))
    ok(`a photo smaller than its cell is centred at its own size, not stretched to fill (200px in a ${r.tinyCell}px cell)`);
  else
    fail(
      'a photo smaller than its cell is not stretched to fill',
      `centre ${JSON.stringify(r.tinyCentreColour)}, corner ${JSON.stringify(r.tinyCornerColour)}`
    );

  if (r.abortRejected)
    ok('and a recording in flight can be abandoned, so a minutes-long timelapse is not a trap');
  else fail('a recording in flight can be abandoned', `abortRejected: ${r.abortRejected}`);

  // --- the timelapse -----------------------------------------------------
  if (r.timelapseSupported) ok('MediaRecorder can record WebM here, which is what the timelapse option needs');
  else fail('MediaRecorder can record WebM here', 'timelapseSupported() said no');

  if (r.timelapseSignature.join() === '26,69,223,163' && r.timelapseType === 'video/webm')
    ok('a timelapse comes back as a real WebM file (EBML header)');
  else fail('a timelapse comes back as a real WebM file', `${r.timelapseType}, starts ${r.timelapseSignature}`);

  if (size(r.firstFrame) === `${r.timelapseEdge}x${r.timelapseEdge}`)
    ok(`the recorded video decodes at ${r.timelapseEdge}x${r.timelapseEdge}`);
  else fail('the recorded video decodes at the timelapse edge', size(r.firstFrame));

  if (nearInVideo(r.firstFrame.centre, RED))
    ok('and its first frame is the oldest photo, on the canvas before recording started');
  else fail('the first frame is the oldest photo', JSON.stringify(r.firstFrame.centre));

  // Recording is real time (MediaRecorder has no other clock), so three
  // photos at 700ms each cannot come back in less than about two seconds.
  if (r.recordingTookMs >= 2000) ok(`recording runs in real time, as the duration estimate says (${r.recordingTookMs}ms for 3 photos)`);
  else fail('recording runs in real time', `${r.recordingTookMs}ms for 3 photos at 700ms each`);

  // --- generating is not sharing (ticket 27's whole posture) --------------
  if (r.shareCallsAfterGenerating === 0)
    ok('a collage and a timelapse both exist and nothing has been shared: generating transmits nothing');
  else fail('generating transmits nothing', `navigator.share was called ${r.shareCallsAfterGenerating} time(s)`);

  if (r.fileNames.collage === 'alicja-journey-2025-08-13.jpg' && r.fileNames.timelapse === 'alicja-journey-2025-08-13.webm')
    ok('the files are named for a journey rather than a journal, so neither reads as a backup');
  else fail('the files are named for a journey', JSON.stringify(r.fileNames));

  await page.click('#share');
  await page.waitForFunction(() => window.__journeyShareResult !== undefined);
  const shared = await page.evaluate(() => window.__journeyShareResult);

  if (shared.delivery === 'shared' && shared.shareCalls === 1)
    ok('and it takes a click on the share button to hand the file over - once');
  else fail('a click on the share button hands the file over', JSON.stringify(shared));

  if (shared.sharedFile?.name === 'alicja-journey-2025-08-13.jpg' && shared.sharedFile.type === 'image/jpeg' && shared.sharedFile.size > 0)
    ok('what the share sheet receives is the generated collage itself, named and typed for what it is');
  else fail('the share sheet receives the generated collage', JSON.stringify(shared.sharedFile));
});

// --- Phase 5 ticket 22: the video note re-encode ---------------------------
await block('phase 5 ticket 22 video note re-encode', 9, async () => {
  const r = await load('/video-notes.html', 'video-note-probe');
  if (r.error) throw new Error(r.error);

  if (r.fileName === '11111111-2222-3333-4444-555555555555.webm')
    ok('a video note is stored under an opaque <uuid>.webm, resolvable on either platform');
  else fail('a video note is stored under an opaque <uuid>.webm', r.fileName);

  if (r.captured && r.sourceSize > 0)
    ok(`startVideoRecording() produces a real capture off the fake camera (${(r.sourceSize / 1024) | 0}KB)`);
  else fail('startVideoRecording() produces a real capture', `captured: ${r.captured}, ${r.sourceSize} bytes`);

  /* The claim ticket 22 actually makes: a file over the ceiling is
     compressed further rather than accepted as-is. Size is the whole point,
     so this is the assertion that matters. */
  if (r.reencodedSize !== null && r.reencodedSize < r.sourceSize)
    ok(
      `re-encoding compresses an oversized capture rather than accepting it (${(r.sourceSize / 1024) | 0}KB to ${(r.reencodedSize / 1024) | 0}KB)`
    );
  else fail('re-encoding compresses an oversized capture', `${r.sourceSize} to ${r.reencodedSize}`);

  if (r.reencodedType === 'video/webm')
    ok('and it lands in the same container, so the stored .webm means what its name says');
  else fail('the re-encode lands in the same container', String(r.reencodedType));

  /* Smaller alone would also describe a black file, so the marker quadrant
     has to survive: this proves the re-encode carried the picture over. */
  const green = ([, g]) => g > 120;
  if (r.reencodedFrame && green(r.reencodedFrame.marker))
    ok('the re-encoded file is still the same video, not an empty one of the right length');
  else fail('the re-encoded file is still the same video', JSON.stringify(r.reencodedFrame));

  // 480p in, 480p out. Ticket 22's 1080p is a cap, and upscaling would only
  // spend bits on detail that is not there (ADR-0008's rule for photos).
  if (r.reencodedFrame?.height === r.sourceFrame.height && r.reencodedFrame.height < r.maxShortEdge)
    ok(`a capture below the ${r.maxShortEdge}p cap keeps its own size rather than being upscaled to it`);
  else
    fail(
      'a capture below the cap keeps its own size',
      `${JSON.stringify(r.sourceFrame)} to ${JSON.stringify(r.reencodedFrame)}`
    );

  if (r.targetForOversized && r.targetForOversized.audioBitsPerSecond > 0)
    ok('the target comes from limits.ts, so the probe exercises the real decision');
  else fail('the target comes from limits.ts', JSON.stringify(r.targetForOversized));

  /* A video note is video AND audio (ticket 22's scope line). reencode.ts has
     to mute the <video> it plays to satisfy the autoplay policy, so this is
     the check that the mute does not also silence the track it carries over -
     the failure it guards against would store every note without its sound. */
  if (r.sourceHasAudio && r.reencodedHasAudio)
    ok('the re-encode carries the audio over, so speech survives what the picture gives up');
  else
    fail(
      'the re-encode carries the audio over',
      `source had audio: ${r.sourceHasAudio}, re-encode had audio: ${r.reencodedHasAudio}`
    );

  if (r.undecodableGivesNull)
    ok('and a file the browser cannot decode yields null, so an oversized capture is kept rather than lost');
  else fail('a file the browser cannot decode yields null', `got ${r.undecodableGivesNull}`);
});

// --- Phase 5 ticket 18: rasterizing the wrapped share card -----------------
await block('phase 5 ticket 18 wrapped share card', 6, async () => {
  const r = await load('/share-card.html', 'share-card-probe');
  if (r.error) throw new Error(r.error);

  if (r.fullType === 'image/png') ok('the wrapped card rasterizes to a real PNG, not a canvas nobody encoded');
  else fail('the wrapped card rasterizes to a real PNG', r.fullType);

  if (r.fullSize.width > 0 && r.fullSize.height > 0)
    ok(`the rasterized card has a real size (${r.fullSize.width}x${r.fullSize.height})`);
  else fail('the rasterized card has a real size', JSON.stringify(r.fullSize));

  // Near white would mean the gradient never painted - the art strip is
  // captured from what WrappedCard.svelte and the app's own palette CSS
  // actually rendered, not redrawn by this rasterizer.
  const nearWhite = r.artPixel.every((channel) => channel > 240);
  if (!nearWhite) ok(`the palette art strip rasterizes with real colour, not a blank div (${JSON.stringify(r.artPixel)})`);
  else fail('the palette art strip rasterizes with real colour', JSON.stringify(r.artPixel));

  if (r.statText === '12') ok('a picked stat tile carries its own text into the rasterized card');
  else fail('a picked stat tile carries its own text into the rasterized card', JSON.stringify(r.statText));

  if (!r.emptyHasArt && !r.emptyHasStats)
    ok('a card with nothing picked has no art strip and no stat tile to rasterize in the first place');
  else fail('a card with nothing picked has no art or stats', JSON.stringify({ art: r.emptyHasArt, stats: r.emptyHasStats }));

  if (r.emptySize.width > 0 && r.emptySize.height > 0 && r.emptySize.height < r.fullSize.height)
    ok(`a card with nothing picked still rasterizes (its own padding), smaller than one with content (${r.emptySize.height}px vs ${r.fullSize.height}px)`);
  else fail('a card with nothing picked still rasterizes, smaller than one with content', JSON.stringify({ empty: r.emptySize, full: r.fullSize }));
});

// --- Phase 5 ticket 30: the control kit, measured rather than assumed ------
/* The 48px floor is the one thing in this ticket that cannot be read off a
   stylesheet: min-height on a class says nothing about what the element it
   ends up on actually measures, which is exactly how the switch shipped 48px
   tall and 44px wide, and how the Gecko slider thumb ended up at 20px. So
   every control on the fixture page gets its rendered box read, and the
   pressed and held states get driven with a real pointer. */
await block('phase 5 ticket 30 control kit', 23, async () => {
  await page.goto(`http://localhost:${port}/controls.html`, { waitUntil: 'networkidle' });
  await page.waitForSelector('body[data-controls-ready]', { state: 'attached' });

  const TOUCH = 48;
  /* Both axes for anything a finger lands on. `.btn`, `.slider`, `.list-row`
     and the fields run the width of the screen, so only their height is in
     question - a width assertion on them would measure the card. */
  const CONTROLS = [
    ['.btn', 'height'],
    ['.icon-btn', 'both'],
    ['.switch', 'both'],
    ['.segment', 'both'],
    ['.pin-key', 'both'],
    ['.slider', 'height'],
    ['.input', 'height']
  ];
  /* Controls this ticket handed to the screen tickets rather than redesigning.
     Measured anyway: "check the rest rather than assuming" asks for the
     number, and an owner is not a number. A failure here is a finding for
     whoever owns the control, not for this ticket to fix. */
  const HANDED_ON = [
    ['.list-row', 'height'],
    ['.mood-btn', 'both'],
    ['.tag-chip', 'both'],
    ['.toast-action', 'both']
  ];

  /* A hit test rather than a rect. The rect is what the element occupies; the
     target is what answers a finger, and the two differ wherever a control
     extends its target past its own box - which is how the switch's 28px
     track sits in a 48px target, and how the tag chip and the toast's action
     reach the floor without the visible pill growing. So: take each control's
     centre, probe a point half the floor away on each axis under test, and
     require the control to be what is there. That also catches a target
     something else is sitting on top of, which a rect cannot see at all. */
  const measured = await page.evaluate(
    ({ controls, touch }) => {
      const reach = touch / 2 - 1;
      return controls.map(([selector, axis]) => {
        const els = [...document.querySelectorAll(selector)];
        const misses = [];
        let smallest = null;
        for (const el of els) {
          /* elementFromPoint reads the viewport, and this page is several
             screens tall, so a control has to be brought into it first. */
          el.scrollIntoView({ block: 'center' });
          const r = el.getBoundingClientRect();
          const size = `${Math.round(r.width * 10) / 10}x${Math.round(r.height * 10) / 10}`;
          if (smallest === null || r.width * r.height < smallest.area) {
            smallest = { area: r.width * r.height, size };
          }
          const cx = r.left + r.width / 2;
          const cy = r.top + r.height / 2;
          const points =
            axis === 'both'
              ? [[cx, cy - reach], [cx, cy + reach], [cx - reach, cy], [cx + reach, cy]]
              : [[cx, cy - reach], [cx, cy + reach]];
          for (const [x, y] of points) {
            const hit = document.elementFromPoint(x, y);
            if (!hit || (hit !== el && !el.contains(hit))) {
              misses.push(`${size} at (${Math.round(x - cx)}, ${Math.round(y - cy)})`);
            }
          }
        }
        return { selector, axis, count: els.length, misses, smallest: smallest?.size };
      });
    },
    { controls: [...CONTROLS, ...HANDED_ON], touch: TOUCH }
  );

  for (const m of measured) {
    if (m.count === 0) {
      fail(`${m.selector} is on the page to be measured`, 'no elements matched');
      continue;
    }
    const owned = HANDED_ON.some(([selector]) => selector === m.selector);
    const what = owned
      ? `${m.selector} answers across ${TOUCH}px, though it belongs to a screen ticket`
      : `${m.selector} answers across ${TOUCH}px on every instance`;
    if (m.misses.length === 0) {
      ok(`${what} (${m.count} of them, smallest box ${m.smallest})`);
    } else {
      fail(what, `${m.misses.length} probe(s) landed elsewhere: ${m.misses.slice(0, 3).join(', ')}`);
    }
  }

  /* The press. .btn's transform is the one this ticket moved onto a token,
     and a token that resolves to nothing is a control with no press at all -
     which is the state ticket 29 found on Android and no test could see. */
  const pressed = await page.evaluate(() => {
    const read = (el) => getComputedStyle(el).transform;
    const btn = document.querySelector('.btn');
    const rest = read(btn);
    const depth = getComputedStyle(document.documentElement).getPropertyValue('--press-depth-wide').trim();
    return { rest, depth };
  });
  const declared = (await readFile(new URL('../../src/lib/motion/press.css', import.meta.url), 'utf8'))
    .match(/--press-depth-wide:\s*([\d.]+)/)?.[1];
  if (pressed.depth === declared)
    ok(`the wide press depth resolves to what press.css declares (${declared})`);
  else fail('the wide press depth resolves to what press.css declares', `${pressed.depth} vs ${declared}`);
  if (pressed.rest === 'none') ok('a button at rest carries no transform of its own');
  else fail('a button at rest carries no transform', pressed.rest);

  /* Held, with a finger on the thumb. All of it was built as transitions on a
     state class, and a state class nothing sets is a design that exists only
     in the stylesheet. */
  const thumb = page.locator('[data-case="slider-hundred"] .slider-thumb');
  await thumb.scrollIntoViewIfNeeded();
  const box = await thumb.boundingBox();
  const readout = page.locator('[data-case="slider-hundred"] .dim-value');
  const parked = await readout.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(500);
  const held = await readout.boundingBox();
  const ring = await thumb.evaluate((el) => getComputedStyle(el).boxShadow);
  const holding = await page.locator('[data-case="slider-hundred"] .slider').evaluate((el) =>
    el.classList.contains('is-holding')
  );
  await page.mouse.up();
  await page.waitForTimeout(500);
  const home = await readout.boundingBox();

  if (holding) ok('a finger on the thumb puts the whole control into its held state');
  else fail('a finger on the thumb puts the control into its held state', 'is-holding never appeared');

  const travelled = parked.x - held.x;
  if (travelled > 40)
    ok(`the readout travels from the edge to the thumb while held (${Math.round(travelled)}px)`);
  else fail('the readout travels to the thumb while held', `moved ${Math.round(travelled)}px`);

  const overThumb = Math.abs(held.x + held.width / 2 - (box.x + box.width / 2));
  if (overThumb < 6) ok(`the readout lands centred over the thumb (${overThumb.toFixed(1)}px off)`);
  else fail('the readout lands centred over the thumb', `${overThumb.toFixed(1)}px off`);

  /* And goes home on release, which is the half a one-way check would miss. */
  if (Math.abs(home.x - parked.x) < 1) ok('and goes back to the edge when the finger comes off');
  else fail('the readout goes back to the edge on release', `${(home.x - parked.x).toFixed(1)}px off`);

  if (/0px 0px 0px 9px/.test(ring)) ok('the held thumb carries its ring rather than a scale');
  else fail('the held thumb carries its ring', ring);

  /* The segmented control's pill is one element that crosses the set, and it
     is measured in JavaScript because a segment is as wide as its word. A pill
     that never moves is the failure this catches. */
  const pill = page.locator('[data-case="segmented"] .segment-pill').first();
  await pill.scrollIntoViewIfNeeded();
  const pillBefore = await pill.boundingBox();
  await page.locator('[data-case="segmented"] [data-segment="year"]').click();
  await page.waitForTimeout(500);
  const pillAfter = await pill.boundingBox();
  const slid = pillAfter.x - pillBefore.x;
  if (slid > 20) ok(`the segmented pill crosses to the chosen segment (${Math.round(slid)}px)`);
  else fail('the segmented pill crosses to the chosen segment', `moved ${Math.round(slid)}px`);
  const settled = await pill.evaluate((el) => getComputedStyle(el).scale);
  if (settled === 'none' || settled === '1' || settled === '1 1')
    ok(`and it settles back to its own width rather than staying stretched (${settled})`);
  else fail('the pill settles back to its own width', settled);

  /* One ruler mark per stop, which is the claim the coarser step rests on. */
  const marks = await page.evaluate(() => ({
    hundred: document.querySelectorAll('[data-case="slider-hundred"] .slider-tick').length,
    ten: document.querySelectorAll('[data-case="slider-ten"] .slider-tick').length,
    here: document.querySelectorAll('[data-case="slider-hundred"] .slider-tick.is-here').length
  }));
  if (marks.hundred === 21 && marks.ten === 11)
    ok('the ruler draws one mark per stop (21 on 0-100, 11 on 0-10)');
  else fail('the ruler draws one mark per stop', JSON.stringify(marks));
  if (marks.here === 1) ok('exactly one mark is the one the thumb is standing on');
  else fail('exactly one mark is the one the thumb is standing on', `${marks.here} of them`);

  /* And the reduced-motion substitute, which is a token rather than a list of
     selectors precisely so that this can be one assertion. */
  const reduced = await page.evaluate(() => {
    document.documentElement.dataset.a11yMotion = 'reduce';
    const cs = getComputedStyle(document.documentElement);
    const depths = ['--press-depth', '--press-depth-wide', '--press-depth-add'].map((t) =>
      cs.getPropertyValue(t).trim()
    );
    delete document.documentElement.dataset.a11yMotion;
    return depths;
  });
  if (reduced.every((d) => d === '1'))
    ok('reduced motion takes all three press depths to 1, so no control moves');
  else fail('reduced motion takes all three press depths to 1', JSON.stringify(reduced));
});

// --- Phase 5 audit ticket 03: what a grid of photos actually reads ---------
await block('phase 5 audit ticket 03 thumbnail grid', 5, async () => {
  await page.setViewportSize({ width: 400, height: 600 });
  const thumbs = await load('/thumbs.html', 'thumbs');
  if (thumbs.error) throw new Error(thumbs.error);

  const { onMount, atBottom, backAtTop } = thumbs;

  /* The claim the ticket is about: a tile far below the fold has not been
     read, so the screen costs a screenful rather than a journal. */
  if (!thumbs.lastTileReadOnMount && onMount.names.length < thumbs.tiles)
    ok(`only tiles near the viewport read on mount (${onMount.names.length} of ${thumbs.tiles})`);
  else
    fail(
      'only tiles near the viewport read on mount',
      `${onMount.names.length} of ${thumbs.tiles} read, last tile read: ${thumbs.lastTileReadOnMount}`
    );

  /* And they leave together. One observer callback, one Svelte flush, one
     readMany - the same property the Node tier counts against a fake, here
     against a real layout crossing a real margin. */
  if (onMount.batches === 1) ok('the whole screenful leaves as a single readMany');
  else fail('the whole screenful leaves as a single readMany', `${onMount.batches} batches`);

  /* The photo whose file is gone still draws: a placeholder, not a gap. */
  if (onMount.drawn === onMount.names.length - 1 && onMount.placeholders >= 1)
    ok('a photo with no stored file still renders as a placeholder');
  else
    fail(
      'a photo with no stored file still renders as a placeholder',
      `${onMount.drawn} images, ${onMount.placeholders} placeholders, ${onMount.names.length} read`
    );

  if (atBottom.names.length > onMount.names.length)
    ok(`scrolling down reads the tiles it reaches (${atBottom.names.length} of ${thumbs.tiles})`);
  else fail('scrolling down reads the tiles it reaches', `still ${atBottom.names.length}`);

  /* No leak, and no unbounded growth either: a tile scrolled well past
     revokes its URL, so a pass over the whole grid ends where it began. */
  if (backAtTop.live === onMount.live)
    ok(`a scroll through the grid and back leaves the blob URLs where they were (${backAtTop.live})`);
  else
    fail(
      'a scroll through the grid and back leaves the blob URLs where they were',
      `${onMount.live} on mount, ${atBottom.live} at the bottom, ${backAtTop.live} back at the top`
    );
});

// --- Phase 5 audit deepening ticket 03: a read declares what it computes --
try {
  const live = await load('/live-reads.html', 'live-reads-probe');
  if (live.error) throw new Error(live.error);

  /* The streak-goal screen's read, against the write it used to miss.
     `['entry']` was its declaration and `journaling_pause` is the other
     table the streak reads, so the number stayed as it was for as long as
     the screen was open. */
  if (live.streak.after === 2 && live.streak.before === 1)
    ok('declaring a journaling pause re-reads the streak the streak-goal screen shows (1 -> 2)');
  else
    fail(
      'declaring a journaling pause re-reads the streak the streak-goal screen shows',
      live.streak.error ?? `before ${live.streak.before}, after ${live.streak.after}`
    );

  // The stock screen's read, against the write it used to miss: a projection
  // reads the episode history through regimen.getEpisodes().
  if (live.projection.runsAfter > live.projection.runsBefore)
    ok('editing a regimen episode re-reads the stock projection the stock screen shows');
  else
    fail(
      'editing a regimen episode re-reads the stock projection the stock screen shows',
      live.projection.error ?? `still ${live.projection.runsAfter} run(s)`
    );

  // And the one deliberate narrowing still narrows, in both directions.
  if (live.narrowed.afterMilestone === live.narrowed.runsBefore)
    ok('a narrowed query ignores a write to a table it deliberately does not watch');
  else
    fail(
      'a narrowed query ignores a write to a table it deliberately does not watch',
      `${live.narrowed.runsBefore} run(s) before the milestone, ${live.narrowed.afterMilestone} after`
    );

  if (live.narrowed.afterEntry > live.narrowed.afterMilestone)
    ok('a narrowed query still re-runs for the table it does watch');
  else
    fail(
      'a narrowed query still re-runs for the table it does watch',
      live.narrowed.error ?? `still ${live.narrowed.afterEntry} run(s)`
    );
} catch (e) {
  fail('phase 5 audit deepening ticket 03 live reads', e.message ?? String(e));
}

// --- Phase 5 audit deepening ticket 09: a dependent read waits for its record
await block('ticket 09 detail draft', 3, async () => {
  const detail = await load('/detail-draft.html', 'detail-draft-probe');
  if (detail.error) throw new Error(detail.error);

  /* The race itself, still there in the raw reading: the entries read has
     nothing to look up while the tryout is undefined, so it answers with
     nothing and the gate reads that as the empty state. If this ever stops
     being true the check below is asserting nothing. */
  if (detail.rawEmptyBeforeRecord)
    ok('a read that hangs off a record does answer empty before the record lands');
  else
    fail(
      'a read that hangs off a record does answer empty before the record lands',
      `branches were ${detail.rawBranches?.join(' -> ')}`
    );

  // And what detailDraft.ts's answersFor puts in its place: an answer read
  // for anything but the record on screen is still loading.
  if (detail.gatedEmptyBeforeRecord === false)
    ok('waiting on the record shows the placeholder over that gap, never the empty state');
  else
    fail(
      'waiting on the record shows the placeholder over that gap, never the empty state',
      `branches were ${detail.gatedBranches?.join(' -> ')}`
    );

  if (detail.entriesFound > 0) ok('the entries in the tryout range arrive either way');
  else fail('the entries in the tryout range arrive either way', 'no entries found in range');
});

// --- Phase 5 audit deepening ticket 10: a field cannot render a control
// without an association - Field.svelte mints the id when a screen has no
// reason to name one, and hands the same string to the label and the
// control either way.
await block('phase 5 audit deepening ticket 10 field association', 5, async () => {
  await page.goto(`http://localhost:${port}/controls.html`, { waitUntil: 'networkidle' });
  await page.waitForSelector('body[data-controls-ready]', { state: 'attached' });

  const fields = await page.evaluate(() => {
    const card = document.querySelector('[data-case="fields"]');
    const labels = [...card.querySelectorAll('label.field-label[for]')].map((l) => {
      const forId = l.getAttribute('for');
      return { for: forId, hasTarget: !!(forId && card.querySelector(`#${CSS.escape(forId)}`)) };
    });
    const legends = [...card.querySelectorAll('span.field-label[id]')].map((s) => s.id);
    const mintedInputs = [...card.querySelectorAll('input[placeholder^="No id given"]')].map((i) => i.id);
    return { labels, legends, mintedInputs };
  });

  if (fields.labels.length >= 2 && fields.labels.every((l) => l.hasTarget))
    ok('every field label carries a for that names a real id inside the same field');
  else fail('every field label carries a for that names a real id inside the same field', JSON.stringify(fields.labels));

  if (fields.legends.length >= 1 && fields.legends.every((id) => !!id))
    ok('a legend field still mints an id, for the group beneath it to point an aria-labelledby at');
  else fail('a legend field still mints an id for its group', JSON.stringify(fields.legends));

  if (
    fields.mintedInputs.length === 2 &&
    fields.mintedInputs[0] &&
    fields.mintedInputs[1] &&
    fields.mintedInputs[0] !== fields.mintedInputs[1]
  )
    ok('two fields given no id mint two different ones rather than colliding');
  else fail('two fields given no id mint two different ones', JSON.stringify(fields.mintedInputs));

  const explicit = await page.evaluate(
    () => !!document.querySelector('#c-name') && !!document.querySelector('label[for="c-name"]')
  );
  if (explicit) ok('a field given an explicit id uses it verbatim rather than minting over it');
  else fail('a field given an explicit id uses it verbatim rather than minting over it', 'not found');

  const hiddenField = await page.evaluate(() => {
    const label = document.querySelector('label[for="c-hidden"]');
    const input = document.querySelector('#c-hidden');
    if (!label || !input) return null;
    const rect = label.getBoundingClientRect();
    return { hasClass: label.classList.contains('visually-hidden'), offscreen: rect.width <= 1 || rect.height <= 1 };
  });
  if (hiddenField?.hasClass && hiddenField.offscreen)
    ok('a hidden field still gives its control a real for/id pair, just off screen');
  else fail('a hidden field still gives its control a real for/id pair, just off screen', JSON.stringify(hiddenField));
});

/* Phase 5 deepening ticket 21. "A section with no rows renders no DOM" is
   an acceptance criterion, and it is a DOM fact about the real component
   rather than anything the node tier can see - dayRows.ts imports paraglide
   and $lib, neither of which resolves under vitest.config.ts. The gallery
   fixture already mounts DayRecords.svelte against the real cascade, so
   this drives it. */
await block('phase 5 deepening ticket 21 day composition', 8, async () => {
  await page.goto(`http://localhost:${port}/day.html`, { waitUntil: 'networkidle' });
  await page.waitForSelector('body[data-day-ready]', { state: 'attached' });

  const shape = async (name) => {
    await page.selectOption('select[aria-label="Day"]', name);
    await page.waitForTimeout(120);
    return page.evaluate(() => {
      /* The overflow sheet holds a second copy of the list and is in the DOM
         whether or not it is open, so everything here counts inside the card
         rather than across the document. */
      const card = document.querySelector('[data-list-card]');
      const rowsIn = (root) => (root ? [...root.querySelectorAll('[data-day-row]')] : []);
      return {
        dayCards: document.querySelectorAll('[data-day-card]').length,
        listCards: document.querySelectorAll('[data-list-card]').length,
        headings: document.querySelectorAll('[data-section-heading]').length,
        rows: rowsIn(card).length,
        keys: rowsIn(card).map((r) => r.getAttribute('data-day-row')),
        more: document.querySelectorAll('[data-day-more]').length,
        moreLabel: document.querySelector('[data-day-more] .kit-row-title')?.textContent ?? null,
        sheetOpen: document.querySelectorAll('[data-sheet]').length
      };
    });
  };

  const sparse = await shape('sparse');
  if (sparse.dayCards === 1 && sparse.listCards === 0 && sparse.headings === 0 && sparse.rows === 0)
    ok('a day with only an entry draws the day card and nothing else at all');
  else fail('a day with only an entry draws the day card and nothing else at all', JSON.stringify(sparse));

  const typical = await shape('typical');
  if (typical.dayCards === 1 && typical.listCards === 1 && typical.headings === 1)
    ok('a day with other records adds exactly one heading and one card, however many kinds it holds');
  else
    fail(
      'a day with other records adds exactly one heading and one card, however many kinds it holds',
      JSON.stringify(typical)
    );

  /* Four rows on the typical day, which is under the cap, so it is not
     truncated and offers nothing to expand. */
  if (typical.rows === 4 && typical.more === 0)
    ok('a day inside the cap shows every row it has and offers no overflow');
  else fail('a day inside the cap shows every row it has and offers no overflow', JSON.stringify(typical));

  const maximal = await shape('maximal');
  if (maximal.listCards === 1 && maximal.headings === 1)
    ok('a maximal day is still one heading and one card, not a section per area');
  else fail('a maximal day is still one heading and one card, not a section per area', JSON.stringify(maximal));

  if (maximal.rows === 5 && maximal.more === 1)
    ok('a day past the cap shows five rows and one way to the rest');
  else fail('a day past the cap shows five rows and one way to the rest', JSON.stringify(maximal));

  /* The count on that row is what is hidden, not what exists: 24 rows, 5
     shown, so 19 more. */
  if (maximal.moreLabel && maximal.moreLabel.includes('19'))
    ok('the overflow row counts what is hidden rather than what the day holds');
  else fail('the overflow row counts what is hidden rather than what the day holds', String(maximal.moreLabel));

  await page.click('[data-day-more]');
  await page.waitForTimeout(320);
  const opened = await page.evaluate(() => {
    const sheet = document.querySelector('[data-sheet]');
    return {
      open: !!sheet,
      rows: sheet ? sheet.querySelectorAll('[data-day-row]').length : 0,
      keys: sheet ? [...sheet.querySelectorAll('[data-day-row]')].map((r) => r.getAttribute('data-day-row')) : []
    };
  });
  if (opened.open && opened.rows === 24) ok('the overflow opens a sheet holding the whole list, all 24 rows');
  else fail('the overflow opens a sheet holding the whole list, all 24 rows', JSON.stringify(opened));

  /* Photographs collapse and records do not, checked on the full list now
     that the card only carries the first five: three hair photos are one row,
     two doses are two rows. */
  const hairRows = opened.keys.filter((k) => k.startsWith('hair-photos')).length;
  const doseRows = opened.keys.filter((k) => k.startsWith('dose-')).length;
  if (hairRows === 1 && doseRows === 2) ok('three hair photos are one row and two doses are two rows');
  else fail('three hair photos are one row and two doses are two rows', `${hairRows} photo rows, ${doseRows} dose rows`);
});

// --- Phase 5 deepening ticket 15: the voice benchmark engine ---------------
await block('phase 5 deepening ticket 15 voice benchmark engine', 6, async () => {
  const r = await load('/voice-benchmark.html', 'voice-benchmark-probe');
  if (r.error) throw new Error(r.error);

  /* The claim the node tier cannot make: opus, a webm container and a
     resample down to the analysis rate leave the measurement alone. The
     oscillator is at 185 Hz, so anything outside a hertz or two of that is
     the round trip having changed the answer. */
  if (r.medianHz !== null && Math.abs(r.medianHz - 185) <= 2)
    ok(`a recorded, stored and decoded take still measures its own pitch (${r.medianHz.toFixed(2)} Hz against 185)`);
  else fail('a stored and decoded take still measures its own pitch', `${r.medianHz} Hz`);

  if (r.sampleRate === 16000 && Math.abs(r.decodedSeconds - 4) < 0.6)
    ok(`decodeTake resamples to 16 kHz and keeps the take's length (${r.decodedSeconds.toFixed(2)}s)`);
  else fail("decodeTake resamples to 16 kHz and keeps the take's length", `${r.sampleRate} Hz, ${r.decodedSeconds}s`);

  if (r.storedBytes > 0)
    ok(`what gets stored is a real file rather than an empty one (${(r.storedBytes / 1024).toFixed(1)}KB)`);
  else fail('what gets stored is a real file', `${r.storedBytes} bytes`);

  if (r.passageFailed.length === 0 && r.semitoneSd !== null && r.semitoneSd < 0.6)
    ok('a steady take clears the gate after the round trip, and reads as steady');
  else fail('a steady take clears the gate after the round trip', `${JSON.stringify(r.passageFailed)}, sd ${r.semitoneSd}`);

  /* The gauge is the other half of the flow: it has to have seen the take
     arrive in pieces and agree with the gate about it, or the screen would
     be encouraging a take the save then rejects. */
  if (r.liveFrames > 100 && r.liveVoicedSeconds > 1.5 && r.liveFailedWhileSteady.length === 0)
    ok(`the live gauge tracked the same take frame by frame and agreed (${r.liveVoicedSeconds.toFixed(2)}s held)`);
  else
    fail(
      'the live gauge tracked the same take and agreed',
      `${r.liveFrames} frames, ${r.liveVoicedSeconds}s, ${JSON.stringify(r.liveFailedWhileSteady)}`
    );

  if (r.loudPeak >= 0.98 && r.loudFailed.includes('clipping'))
    ok(`a take pushed into the rails is caught while it is happening (peak ${r.loudPeak.toFixed(3)})`);
  else fail('a take pushed into the rails is caught while it is happening', `peak ${r.loudPeak}, ${JSON.stringify(r.loudFailed)}`);
});

// --- Phase 8 features ticket 28: the chain a take was recorded through ----
await block('phase 8 features ticket 28 capture chain', 2, async () => {
  const r = await load('/voice-benchmark.html', 'voice-benchmark-probe');
  if (r.error) throw new Error(r.error);

  /* The one thing only a browser can answer: what a real MediaStreamTrack
     says about itself. The shape is the device, the microphone and one
     token per constraint (audio/captureChain.ts). */
  if (/^[^|]+\| [^|]+\| ec=(on|off|\?) ns=(on|off|\?) agc=(on|off|\?)$/.test(r.captureChain ?? ''))
    ok(`a take records the chain it was made through (${r.captureChain})`);
  else fail('a take records the chain it was made through', String(r.captureChain));

  /* And the three flags are read back off the track rather than restated
     from what was requested: the same device opened with the browser's
     voice-call processing left on is a different chain. This is what has to
     be true for a device that refuses the unprocessed request and opens
     anyway, which is ADR-0061's case. */
  const { unprocessed, processed } = r.openedChains ?? {};
  if (unprocessed && processed && unprocessed !== processed)
    ok(`the flags come off the track: unprocessed (${unprocessed}) is not the processed path (${processed})`);
  else fail('the flags come off the track rather than from the request', `${unprocessed} against ${processed}`);
});

// --- Phase 8 features ticket 09: the stored track, and the figure drawn on
//     the absolute axis, both off a real recording -------------------------
await block('phase 8 features ticket 09 voice figure', 8, async () => {
  const r = await load('/voice-benchmark.html', 'voice-benchmark-probe');
  if (r.error) throw new Error(r.error);
  const f = r.figure;

  /* Four seconds of oscillator at four points a second, less the frames at
     the end that YIN needs the samples after to compute. A track much
     shorter than that means the downsampling lost most of the take. */
  if (r.storedPoints >= 13 && r.storedPoints <= 17 && r.storedVoicedPoints === r.storedPoints)
    ok(`a real recording stores a track of its whole passage (${r.storedPoints} points over ${r.storedSpanSeconds.toFixed(2)}s)`);
  else
    fail(
      'a real recording stores a track of its whole passage',
      `${r.storedPoints} points, ${r.storedVoicedPoints} voiced, ${r.storedSpanSeconds}s`
    );

  /* The point of storing it: what comes back out is the take, not a
     smoothed version of it. The oscillator is at 185 Hz and the median of
     four frames cannot move that by more than the tracker's own error. */
  if (r.storedWorstHzError !== null && r.storedWorstHzError <= 2)
    ok(`the stored track reads back as the take it came from (worst point off by ${r.storedWorstHzError.toFixed(2)} Hz)`);
  else fail('the stored track reads back as the take it came from', `worst error ${r.storedWorstHzError} Hz`);

  /* The axis is absolute. On the old relative axis a steady voice sat in
     the middle of the box whatever it was, so the one assertion that tells
     the two apart is where 185 Hz landed: the figure has to draw it where
     bands.ts puts it on the fixed 70-330 Hz axis, not in the middle of the
     box wherever the voice happens to be. */
  if (f.traceMeanY !== null && Math.abs(f.traceMeanY - f.expectedY) < 2)
    ok(`the live trace lands where the axis puts 185 Hz (y ${f.traceMeanY.toFixed(1)} against ${f.expectedY.toFixed(1)})`);
  else fail('the live trace lands where the axis puts 185 Hz', `y ${f.traceMeanY} against ${f.expectedY}`);

  if (f.traceRuns >= 1 && f.tracePoints > 100)
    ok(`the trace is drawn from the frames the microphone delivered (${f.tracePoints} points in ${f.traceRuns} run(s))`);
  else fail('the trace is drawn from the frames the microphone delivered', JSON.stringify(f));

  /* Both cited ranges, the region between them with its own fill and its
     own two bounds, and the comfort bracket's spine plus its two ticks. */
  const bandsRight =
    f.bands.join(',') === 'cisMan,cisWoman,between' &&
    f.middleEdges === 2 &&
    f.middleFills === 1 &&
    f.comfortMarks === 3;
  if (bandsRight)
    ok('the figure carries both cited ranges, the region between them bounded and filled, and the comfort bracket');
  else
    fail(
      'the figure carries both cited ranges, the region between them, and the comfort bracket',
      `${JSON.stringify(f.bands)}, ${f.middleEdges} edges, ${f.middleFills} fills, ${f.comfortMarks} bracket marks`
    );


  /* The take drawn afterwards: the trace from the stored track, the median
     and the p10-p90 pair. */
  if (r.take.traceRuns >= 1 && r.take.hasMedian === 1 && r.take.spanEdges === 2 && r.take.saysNoTrack === 0)
    ok('a finished take draws its stored track with the median and the p10-p90 pair');
  else fail('a finished take draws its stored track with the median and the span', JSON.stringify(r.take));

  /* And the one state no benchmark can be moved out of: taken before the
     column existed, so there is nothing to draw and the screen says it. */
  const bare = r.takeWithoutTrack;
  if (bare.saysNoTrack === 1 && bare.traceRuns === 0 && bare.hasMedian === 0)
    ok('a benchmark from before the column says so instead of drawing an empty field');
  else fail('a benchmark from before the column says so rather than drawing an empty field', JSON.stringify(bare));

  /* ADR-0059 permits these bands only with their figures, their source and
     the sentence about averages. Checked on the rendered figure, because
     that is where the permission has to hold. */
  const cited =
    f.bandFigures.length === 3 &&
    f.bandFigures.every((count) => count === 2) &&
    f.sourceText.length > 20 &&
    f.caveatText.length > 20;
  if (cited)
    ok('every band prints its two Hz figures, and the source line and the caveat are both there');
  else
    fail(
      'every band prints its two Hz figures, with the source line and the caveat',
      `figures ${JSON.stringify(f.bandFigures)}, source ${f.sourceText.length} chars, caveat ${f.caveatText.length} chars`
    );
});

// --- Ticket 16 (phase 8 deepening): the draft mirror's stale-removal repro,
//     and that clearing it on save (EntryEditor.svelte's fix) closes it.
await block('ticket 16 browser tier', 10, async () => {
  const r = await load('/draft-mirror.html', 'draft-mirror-probe');
  if (r.error) throw new Error(r.error);
  const { before, after } = r;

  // --- before the fix: an unmount skipped after a successful save makes
  //     the next save throw. ---
  if (before.photoGoneAfterFirstSave) ok('the first save really removes the photo from the journal');
  else fail('the first save really removes the photo from the journal', JSON.stringify(before));

  if (!before.mirrorClearedBySave) ok('a successful save does not clear the draft mirror by itself, before the fix');
  else fail('a successful save does not clear the draft mirror by itself, before the fix', JSON.stringify(before));

  if (before.mirrorMatchedTheResumedRoute) ok('draftMatchesRoute re-associates the surviving mirror on resume');
  else fail('draftMatchesRoute re-associates the surviving mirror on resume', JSON.stringify(before));

  if (before.staleRemovalReapplied)
    ok('applyPersistedDraft reapplies the already-actioned removal onto the resumed draft');
  else
    fail(
      'applyPersistedDraft reapplies the already-actioned removal onto the resumed draft',
      JSON.stringify(before)
    );

  if (before.resaveThrewUnknownPhoto)
    ok(`the sequence reproduces: the re-save throws (${before.resaveError})`);
  else fail('the sequence reproduces: the re-save throws', JSON.stringify(before));

  // --- after the fix: the mirror exists only for work that has not been
  //     saved, and a re-save after a killed process does not throw. ---
  if (after.photoGoneAfterFirstSave) ok('the first save still really removes the photo, after the fix');
  else fail('the first save still really removes the photo, after the fix', JSON.stringify(after));

  if (after.mirrorClearedBySave) ok('the fix clears the mirror the moment the save that made it stale lands');
  else fail('the fix clears the mirror the moment the save that made it stale lands', JSON.stringify(after));

  if (!after.mirrorMatchedTheResumedRoute)
    ok('with no mirror left to find, resume has nothing to reapply');
  else fail('with no mirror left to find, resume has nothing to reapply', JSON.stringify(after));

  if (!after.staleRemovalReapplied) ok('the resumed draft carries no stale removal id');
  else fail('the resumed draft carries no stale removal id', JSON.stringify(after));

  if (after.resaveError === null) ok('the re-save no longer throws');
  else fail('the re-save no longer throws', after.resaveError);
});

/* --- Ticket 27 (phase 8 features): the metric reference, and that the
       sentence under a figure lands on that figure's own section. --- */
await block('ticket 27 browser tier', 7, async () => {
  const r = await load('/voice-metrics.html', 'voice-metrics-probe');
  if (r.error) throw new Error(r.error);
  const { registered, figures, landings, listLink, route, sections, reviewed } = r;

  const listed = figures.map((f) => f.key);
  if (JSON.stringify(listed) === JSON.stringify(registered))
    ok(`every registered figure is in the list a take shows (${listed.join(', ')})`);
  else fail('every registered figure is in the list a take shows', JSON.stringify(listed));

  const blank = figures.filter((f) => f.stated.length === 0);
  if (blank.length === 0 && listLink?.href === route && listLink.text.length > 0)
    ok(`the list states seven figures and one way in (${listLink.text})`);
  else fail('the list states seven figures and one way in', JSON.stringify({ blank, listLink }));

  /* The claim only a browser can answer: every fragment metricHref builds,
     resolved against the rendered reference screen and read back through
     `:target`. The compare view renders two of these against its own
     labels; nothing but a rendered document can say they land. */
  const stray = landings.filter((l) => l.landsOn !== l.key);
  if (stray.length === 0)
    ok('every figure\'s own fragment lands on its own section of the reference screen');
  else
    fail(
      "every figure's own fragment lands on its own section of the reference screen",
      JSON.stringify(stray.map((l) => [l.key, l.href, l.landsOn]))
    );

  const halfExplained = sections.filter((s) => s.fields !== 7);
  if (sections.length === registered.length && halfExplained.length === 0)
    ok('all seven sections render all seven fields, none omitted');
  else
    fail(
      'all seven sections render all seven fields, none omitted',
      JSON.stringify(sections.map((s) => [s.key, s.fields]))
    );

  const pitch = sections.find((s) => s.key === 'pitch');
  const banded = sections.filter((s) => s.bandedLanguages.length > 0).map((s) => s.key);
  if (
    pitch?.tier === 'referenced' &&
    JSON.stringify(banded) === '["pitch"]' &&
    JSON.stringify(pitch.bandedLanguages) === '["en","pl"]' &&
    pitch.citations === 2
  )
    ok('only the Referenced figure states published ranges, one citation per language');
  else
    fail(
      'only the Referenced figure states published ranges, one citation per language',
      JSON.stringify({ banded, pitch })
    );

  /* Read differently rather than merely both rendered: an own-series
     section says in its own words that no dependable range exists and how
     far its number travels, which is the whole point of field 7. */
  const spread = sections.find((s) => s.key === 'spread');
  if (
    spread?.tier === 'ownSeries' &&
    spread.bandedLanguages.length === 0 &&
    spread.tierText.length > 20 &&
    spread.tierText !== pitch?.tierText &&
    spread.typicalText !== pitch?.typicalText
  )
    ok('an Own-series section reads differently from the Referenced one, in words');
  else fail('an Own-series section reads differently from the Referenced one, in words', JSON.stringify(spread));

  if (/\d/.test(reviewed)) ok(`the whole table carries one reviewed-on date (${reviewed})`);
  else fail('the whole table carries one reviewed-on date', JSON.stringify(reviewed));
});

/* --- Ticket 29 (phase 8 features): the own-series trends, and that a
       change of capture chain arrives as a break with a reason in it. --- */
await block('ticket 29 browser tier', 6, async () => {
  const r = await load('/voice-own-series.html', 'voice-own-series-probe');
  if (r.error) throw new Error(r.error);
  const { offered, registered, figures, single, neverMeasured } = r;

  if (JSON.stringify(offered) === JSON.stringify(registered))
    ok(`the card offers every Own-series figure and nothing else (${offered.join(', ')})`);
  else fail('the card offers every Own-series figure and nothing else', JSON.stringify(offered));

  /* Five takes, three on one phone and two on another. What only a render
     can say: the history came out as two runs with a plot for each, every
     plot carrying a line, and what sits between them is words rather than
     a dotted join.

     A figure written as two numbers on two scales draws a plot per line
     rather than two lines on one, so its count is twice the runs - the
     resonances are the case, and the reason is that a pair placed against
     two ranges loses the value gutter and would leave the card with no
     hertz on it at all. */
  const perLine = { resonance: 2 };
  const drewBoth = registered.filter((key) => {
    const f = figures[key];
    return f.plots === 2 * (perLine[key] ?? 1) && f.lines.every((count) => count >= 1);
  });
  if (drewBoth.length === registered.length)
    ok('every figure draws the history as two runs, every plot with a line on it');
  else
    fail(
      'every figure draws the history as two runs, every plot with a line on it',
      JSON.stringify(registered.map((key) => [key, figures[key].plots, figures[key].lines]))
    );

  const named = registered.filter((key) => {
    const [gap, ...rest] = figures[key].breaks;
    return rest.length === 0 && gap?.reason === 'device' && gap.text.length > 40;
  });
  if (named.length === registered.length)
    ok(`the break between them names the phone as the reason ("${figures[registered[0]].breaks[0].text.slice(0, 48)}...")`);
  else fail('the break between them names the phone as the reason', JSON.stringify(registered.map((key) => [key, figures[key].breaks])));

  /* ADR-0060's negative, checked on the rendered card rather than in the
     arithmetic: the pitch figure next door draws bands out of this same
     kit, so what stops one appearing here is the markup. */
  const banded = registered.filter((key) => figures[key].bandLike > 0);
  if (banded.length === 0) ok('no band, target region or heat ramp is drawn on any of the six');
  else fail('no band, target region or heat ramp is drawn on any of the six', JSON.stringify(banded));

  /* Native units, on the plot itself rather than under a finger: every
     plot has to carry the ends of its own scale, written in the figure's
     own unit (ADR-0012). A scrub readout would not do - a card that says
     nothing until it is touched is the axis-free strip ticket 09 already
     rejected. */
  const units = {
    span: /Hz/,
    spread: /semitone/,
    rate: /words/,
    resonance: /Hz/,
    room: /dB/,
    // The factor's own unit is the × it is written with, which is what
    // tells it apart from a bare 0-to-1 axis with no unit on it at all.
    scale: /×/
  };
  const wrongUnit = registered.filter((key) => {
    const f = figures[key];
    const printed = f.gutters.join(' ');
    /* A gutter per plot, not one on the card: what would fail here is a
       plot placed against a range whose numbers are printed somewhere
       else, or nowhere. */
    return !units[key].test(printed) || /\b0\.\d\b/.test(printed) || f.gutters.length !== f.plots;
  });
  if (wrongUnit.length === 0)
    ok(`every plot prints its own unit down its own side and no 0-to-1 axis (${figures.span.gutters[0]}; ${figures.resonance.gutters[0]})`);
  else
    fail(
      'every plot prints its own unit down its own side and no 0-to-1 axis',
      JSON.stringify(registered.map((key) => [key, figures[key].plots, figures[key].gutters]))
    );

  /* The two ends of the journal: one benchmark, and a figure nothing has
     ever measured. Both have to say which of the two they are rather than
     drawing an empty box. */
  if (single.plots === 0 && single.empty.length > 10 && neverMeasured.plots === 0 && neverMeasured.empty.length > 10 && single.empty !== neverMeasured.empty)
    ok('one benchmark and a figure never measured read as two different empty cards');
  else
    fail(
      'one benchmark and a figure never measured read as two different empty cards',
      JSON.stringify({ single: [single.plots, single.empty], neverMeasured: [neverMeasured.plots, neverMeasured.empty] })
    );
});

await browser.close();
await server.close();

const failures = finish('ALL BROWSER-TIER CHECKS PASS');
process.exit(failures ? 1 : 0);
