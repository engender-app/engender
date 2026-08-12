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

const here = dirname(fileURLToPath(import.meta.url));
const { ok, fail, finish } = createReporter();

const server = await createServer({ configFile: `${here}/browser-tier.vite.config.ts`, server: { port: 0 } });
await server.listen();
const port = server.config.server.port;

const browser = await launchChromium();
const page = await (await browser.newContext()).newPage();

/** Loads `path`, waits for `[data-...-ready]` to appear, and reads `resultGlobal`
    off `window`. Reload the same page and call again to check persistence. */
async function load(path, readyAttr, resultGlobal) {
  await page.goto(`http://localhost:${port}${path}`, { waitUntil: 'networkidle' });
  await page.waitForSelector(`body[${readyAttr}]`, { state: 'attached' });
  return page.evaluate((key) => window[key], resultGlobal);
}
const reload = () => page.reload({ waitUntil: 'networkidle' });

// --- Ticket 03: FTS5 + OPFS mechanics, against a synthetic table -----------
try {
  const first = await load('/', 'data-probe-ready', '__probeResult');
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
  const second = await load('/', 'data-probe-ready', '__probeResult');
  if (second.error) throw new Error(second.error);
  if (second.markerExisted === true) ok('OPFS survives a full page reload');
  else fail('OPFS survives a full page reload', 'marker row was gone after reload');
} catch (e) {
  fail('ticket 03 browser tier', e.message ?? String(e));
}

// --- Ticket 04: the real driver + boot() against the real schema -----------
try {
  const first = await load('/driver.html', 'data-driver-probe-ready', '__driverProbeResult');
  if (first.error) throw new Error(first.error);

  if (first.userVersion === 3) ok('boot() opens the database and migrates it to the current schema');
  else fail('boot() opens the database and migrates it to the current schema', `user_version is ${first.userVersion}`);

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
  const second = await load('/driver.html', 'data-driver-probe-ready', '__driverProbeResult');
  if (second.error) throw new Error(second.error);
  if (second.markerExisted === true) ok('data written before a reload is still there after boot() re-runs');
  else fail('data written before a reload is still there after boot() re-runs', 'marker entry was gone after reload');
} catch (e) {
  fail('ticket 04 browser tier', e.message ?? String(e));
}

// --- Ticket 09: folded search against the WASM SQLite, via the journal ----
try {
  const r = await load('/search.html', 'data-search-probe-ready', '__searchProbeResult');
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
} catch (e) {
  fail('ticket 09 browser tier', e.message ?? String(e));
}

// --- Ticket 12: crypto primitives, and hash-wasm's no-network-fetch claim -
try {
  const requestUrls = [];
  const onRequest = (req) => requestUrls.push(req.url());
  page.on('request', onRequest);

  const result = await load('/crypto.html', 'data-crypto-probe-ready', '__cryptoProbeResult');
  page.off('request', onRequest);
  if (result.error) throw new Error(result.error);

  if (result.archiveKeyLength === 32 && result.pinKeyLength === 32) ok('Argon2id derives a 32-byte key for both the archive and PIN parameter sets');
  else fail('Argon2id derives a 32-byte key for both the archive and PIN parameter sets', `got archive=${result.archiveKeyLength} pin=${result.pinKeyLength}`);

  if (result.roundTripOk) ok('AES-256-GCM round-trips a real derived key through encrypt/decrypt');
  else fail('AES-256-GCM round-trips a real derived key through encrypt/decrypt', 'decrypted text did not match');

  const wasmRequests = requestUrls.filter((u) => u.includes('.wasm'));
  if (wasmRequests.length === 0) ok('hash-wasm makes no separate request for its WASM - it is bundled as base64, not fetched');
  else fail('hash-wasm makes no separate request for its WASM - it is bundled as base64, not fetched', wasmRequests.join(', '));
} catch (e) {
  fail('ticket 12 browser tier', e.message ?? String(e));
}

// --- Ticket 11: normalize() against a real canvas, and the OPFS store -----
try {
  const r = await load('/photos.html', 'data-photos-probe-ready', '__photosProbeResult');
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
  // the store must not be able to list the database.
  const database = r.rootNames.filter((n) => n.endsWith('.sqlite3'));
  if (r.rootNames.includes(r.photoDirectory) && database.length > 0 && !r.listed.some((n) => n.endsWith('.sqlite3')))
    ok(`photos live in ${r.photoDirectory}/, so the sweep can never see the database in the OPFS root`);
  else
    fail(
      'photos live in their own directory, so the sweep can never see the database in the OPFS root',
      `root: ${JSON.stringify(r.rootNames)}, store listed: ${JSON.stringify(r.listed)}`
    );

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

  if (r.filesAfterSweep.length === 0) ok('the boot sweep reclaims a file no row references, against real OPFS');
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
} catch (e) {
  fail('ticket 11 browser tier', e.message ?? String(e));
}

// --- Ticket 13: the archive, packed on the real platform and downloaded --
try {
  const r = await load('/archive.html', 'data-archive-probe-ready', '__archiveProbeResult');
  if (r.error) throw new Error(r.error);

  if (r.header.formatVersion === 1 && r.spansChunks)
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
    restored.builtInDimensions === 5 &&
    restored.photoBytesMatch
  )
    ok('a Replace installs the archive over SQLocal and OPFS: rows, photo bytes and the built-ins it kept by key');
  else fail('a Replace installs the archive over SQLocal and OPFS', JSON.stringify(restored));

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
  if (bytes.length === r.archiveLength && magic === 'GDIARY' && bytes.readUInt16BE(6) === 1 && headerJson.totalChunks === r.header.totalChunks)
    ok('the downloaded file is the archive, and its version, KDF parameters and salt read without a password');
  else fail('the downloaded file is the archive with a readable plaintext header', `${bytes.length} bytes, magic ${magic}`);

  /* Not covered here: the same file opening on Android. The Capacitor
     shell does not exist yet, so the acceptance line about a round trip
     between the two platforms is half-done - this is the web half, and
     the Android half has to run against the shell when it lands. */
  console.log('SKIP  an archive produced on web imports on Android: no Capacitor shell to run it against yet');
} catch (e) {
  fail('ticket 13 browser tier', e.message ?? String(e));
}

await browser.close();
await server.close();

const failures = finish('ALL BROWSER-TIER CHECKS PASS');
process.exit(failures ? 1 : 0);
