/* The shipped-bytes ratchet (phase 9 audit ticket 01). Between 27 August and
   6 September the first-load graph grew from 224KB gzip/81 files to
   296KB/111 files - honest growth, six real features landing in ten days -
   and nothing in the repository would have said so: tests/long-journal/
   budgets.json watches statements and bytes at the driver seam, never what
   a first visit actually downloads. This is that measurement.

   Reads the emitted build rather than the source: every /_app/immutable URL
   build/index.html asks for, gzipped the way the August audit measured it.

   File count is exactly reproducible - five straight rebuilds of one commit
   with no source change all emitted 111 files - so its budget is the
   baseline itself, no headroom, the same rule the mount-* statement counts in
   tests/long-journal/budgets.json use. Bytes are not: those same five
   rebuilds gzipped to 295868-295884B, a ~16B spread with no commit in
   between - Vite/Rollup's content hashing is not fully deterministic run to
   run. GZIP_WOBBLE_FLOOR_BYTES absorbs exactly that, the same job FLOOR_MS
   does for the timing budgets - a fixed floor rather than a percentage,
   because the noise is a small constant amount unrelated to bundle size, and
   a percentage of 296KB would swallow the small regressions this exists to
   catch.

   Also reports the on-demand set - the OCR engine and the standard PDF
   fonts, the largest things the app can ask for after the first visit - but
   does not gate on it: it is not what tickets 02/03 are narrowing, and a
   number recorded is worth more than a number nobody knows.

   Run with `node scripts/check-first-load-budget.mjs` after `npm run
   build`, which is what `npm run check:first-load-budget` does. With
   --record it prints the budget block in the shape
   scripts/first-load-budget.json wants and fails on nothing. */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BUILD_DIR = 'build';
const BUDGET_FILE = new URL('./first-load-budget.json', import.meta.url);

/** Comfortably above the ~16B run-to-run spread measured above, and tiny
    next to anything a new dependency actually adds. */
const GZIP_WOBBLE_FLOOR_BYTES = 1024;

/**
 * @param {{ files: number; gzipBytes: number }} baseline
 * @returns {{ filesBudget: number; gzipBytesBudget: number }}
 */
export function firstLoadBudgetFor(baseline) {
  return { filesBudget: baseline.files, gzipBytesBudget: baseline.gzipBytes + GZIP_WOBBLE_FLOOR_BYTES };
}

/**
 * Every /_app/immutable URL a document asks for, de-duplicated - a
 * modulepreload link's href names most of them, but the two entry chunks
 * (SvelteKit's kit and app modules) are named only inside the bootstrap
 * script's own `import("...")` calls, never in a src= or href= attribute, so
 * this matches any quoted string rather than one tied to an attribute name.
 * @param {string} html
 * @returns {string[]}
 */
export function firstLoadUrls(html) {
  const urls = new Set();
  for (const m of html.matchAll(/"(\/_app\/immutable\/[^"]+)"/g)) urls.add(m[1]);
  return [...urls].sort();
}

/**
 * @param {Buffer[]} buffers
 * @returns {number}
 */
export function gzipTotal(buffers) {
  return buffers.reduce((sum, buf) => sum + gzipSync(buf).length, 0);
}

/**
 * @param {{ files: number; gzipBytes: number }} measured
 * @param {{ filesBudget: number; gzipBytesBudget: number }} budget
 * @returns {string[]}
 */
export function budgetFailures(measured, budget) {
  const failures = [];
  if (measured.gzipBytes > budget.gzipBytesBudget)
    failures.push(
      `first-load gzip total is ${measured.gzipBytes}B, over the ${budget.gzipBytesBudget}B budget`
    );
  if (measured.files > budget.filesBudget)
    failures.push(`first-load file count is ${measured.files}, over the ${budget.filesBudget} budget`);
  return failures;
}

/**
 * Every file under `dir`, as paths relative to it.
 * @param {string} dir
 * @returns {string[]}
 */
function filesUnder(dir) {
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .map((name) => join(dir, name))
    .filter((path) => statSync(path).isFile());
}

function measureFirstLoad() {
  const html = readFileSync(join(BUILD_DIR, 'index.html'), 'utf8');
  const urls = firstLoadUrls(html);
  const buffers = urls.map((url) => readFileSync(join(BUILD_DIR, url)));
  return { files: urls.length, gzipBytes: gzipTotal(buffers) };
}

/** The OCR engine (tests/browser-tier/verify-build.mjs's OCR_ASSETS names
    the same directory) and the standard PDF fonts - both on-demand, neither
    gated here. */
function measureOnDemand() {
  const buffers = [...filesUnder(join(BUILD_DIR, 'tesseract')), ...filesUnder(join(BUILD_DIR, 'pdf-fonts'))].map(
    (path) => readFileSync(path)
  );
  return { files: buffers.length, gzipBytes: gzipTotal(buffers) };
}

/** @param {number} bytes */
const kb = (bytes) => `${(bytes / 1024).toFixed(1)}KB`;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const recording = process.argv.includes('--record');
  const budget = JSON.parse(readFileSync(BUDGET_FILE, 'utf8'));

  const firstLoad = measureFirstLoad();
  const onDemand = measureOnDemand();

  console.log(
    `first-load: ${firstLoad.files} files, ${firstLoad.gzipBytes}B gzip (${kb(firstLoad.gzipBytes)})` +
      (recording ? '' : `  budget ${budget.firstLoad.filesBudget} files, ${budget.firstLoad.gzipBytesBudget}B`)
  );
  console.log(
    `on-demand (not gated): ${onDemand.files} files, ${onDemand.gzipBytes}B gzip (${kb(onDemand.gzipBytes)})`
  );

  if (recording) {
    const today = new Date().toISOString().slice(0, 10);
    console.log('\nscripts/first-load-budget.json measurements, seeded at today\'s numbers:\n');
    console.log(
      JSON.stringify(
        {
          firstLoad: {
            what: budget.firstLoad.what,
            recordedOn: today,
            filesBaseline: firstLoad.files,
            gzipBytesBaseline: firstLoad.gzipBytes,
            ...firstLoadBudgetFor(firstLoad)
          },
          onDemand: {
            what: budget.onDemand.what,
            recordedOn: today,
            files: onDemand.files,
            gzipBytes: onDemand.gzipBytes
          }
        },
        null,
        2
      )
    );
    process.exit(0);
  }

  const failures = budgetFailures(firstLoad, budget.firstLoad);
  for (const failure of failures) console.log('FAIL', failure);
  if (failures.length) process.exit(1);
  console.log('PASS first-load payload is within budget');
}
