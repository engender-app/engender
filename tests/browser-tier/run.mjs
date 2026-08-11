/* Browser tier (ticket 03): the Node tier (vitest.config.ts) cannot exercise
   SQLocal, which needs a real browser's OPFS. This script serves probe.ts
   over the standalone dev server in this directory, drives a real Chromium
   through it with Playwright, and prints PASS/FAIL lines like
   tests/walkthrough.test.mjs. Run with `npm run test:browser`. */
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
let failures = 0;
const ok = (n) => console.log('PASS', n);
const fail = (n, detail) => {
  failures++;
  console.log('FAIL', n, '—', detail);
};

const server = await createServer({ configFile: `${here}/browser-tier.vite.config.ts`, server: { port: 0 } });
await server.listen();
const port = server.config.server.port;

const browser = await chromium.launch({ executablePath: '/usr/bin/chromium-browser', headless: true });
const page = await (await browser.newContext()).newPage();

async function probe() {
  await page.goto(`http://localhost:${port}/`, { waitUntil: 'networkidle' });
  await page.waitForSelector('body[data-probe-ready]', { state: 'attached' });
  return page.evaluate(() => window.__probeResult);
}

try {
  const first = await probe();
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

  const second = await probe();
  if (second.error) throw new Error(second.error);
  if (second.markerExisted === true) ok('OPFS survives a full page reload');
  else fail('OPFS survives a full page reload', 'marker row was gone after reload');
} catch (e) {
  fail('browser tier', e.message ?? String(e));
}

await browser.close();
await server.close();

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL BROWSER-TIER CHECKS PASS');
process.exit(failures ? 1 : 0);
