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

  if (first.userVersion === 2) ok('boot() opens the database and migrates it to the current schema');
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

  await reload();
  const second = await load('/driver.html', 'data-driver-probe-ready', '__driverProbeResult');
  if (second.error) throw new Error(second.error);
  if (second.markerExisted === true) ok('data written before a reload is still there after boot() re-runs');
  else fail('data written before a reload is still there after boot() re-runs', 'marker entry was gone after reload');
} catch (e) {
  fail('ticket 04 browser tier', e.message ?? String(e));
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

await browser.close();
await server.close();

const failures = finish('ALL BROWSER-TIER CHECKS PASS');
process.exit(failures ? 1 : 0);
