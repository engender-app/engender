/* The ten-year benchmark (phase 2 ticket 20). Run with
   `npm run benchmark:long-journal`.

   Its own script rather than another block in tests/browser-tier/run.mjs,
   because generating a decade of Journal takes minutes and nobody should
   pay that to check FTS5 folding. CI runs it as its own job for the same
   reason.

   Two modes. By default it measures and fails on anything over budget,
   which is what CI wants. With --record it prints the numbers in the shape
   budgets.json wants and fails on nothing, which is what re-baselining on
   new hardware wants. */
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { launchChromium } from '../browser-harness.mjs';
import { breaches, budgets, overTarget } from './budgets.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const recording = process.argv.includes('--record');

const server = await createServer({
  configFile: `${here}/long-journal.vite.config.ts`,
  server: { port: 0 }
});
await server.listen();
const port = server.config.server.port;

/* --enable-precise-memory-info stops performance.memory rounding to the
   nearest 100KB, and --expose-gc lets the probe collect before it samples.
   Without both the probe reports no memory rather than a number that means
   nothing. */
const browser = await launchChromium({
  args: ['--enable-precise-memory-info', '--js-flags=--expose-gc']
});
const page = await (await browser.newContext()).newPage();
page.on('console', (message) => {
  if (message.type() === 'error') console.log('  browser error:', message.text());
});

console.log('Generating ten years of Journal and measuring it. This takes a few minutes.\n');

let result;
try {
  await page.goto(`http://localhost:${port}/`, { waitUntil: 'networkidle' });
  await page.waitForSelector('body[data-long-journal-ready]', { state: 'attached', timeout: 20 * 60_000 });
  result = await page.evaluate(() => window.__longJournalResult);
} finally {
  await browser.close();
  await server.close();
}

if (result?.error) {
  console.log('FAIL  the benchmark did not run —', result.error);
  process.exit(1);
}

const { summary, measurements, generatedInMs, photoBytes, heapSampled } = result;

console.log(
  `Fixture: ${summary.entries} entries over ${summary.lastEpochDay - summary.firstEpochDay + 1} days ` +
    `(${summary.daysWithEntries} with entries), ${summary.photos} photos (${mb(photoBytes)}), ` +
    `${summary.labResults} lab results, ${summary.milestones} milestones. ` +
    `Written in ${(generatedInMs / 1000).toFixed(0)}s.`
);
if (!heapSampled) console.log('Note: this browser did not expose heap sampling, so no memory was recorded.');
console.log('');

const pad = (text, width) => String(text).padEnd(width);
const widest = Math.max(...measurements.map((m) => m.what.length));

for (const m of measurements) {
  const budget = budgets.measurements[m.name];
  const against = budget ? `  budget ${budget.budgetMs}ms` : '  NO BUDGET';
  console.log(
    `  ${pad(m.what, widest)}  ${pad(`${Math.round(m.ms)}ms`, 9)}` +
      `${pad(m.heapBytes === null ? '' : `heap ${mb(m.heapBytes)}`, 14)}${recording ? '' : against}`
  );
  console.log(`  ${pad('', widest)}  ${m.detail}`);
}
console.log('');

if (recording) {
  /* A 3x time budget with a 100ms floor. The floor is there because half
     these measurements are single-digit milliseconds, and 3x of 4ms is a
     gate on how loaded the runner is rather than on the code. What this is
     meant to catch is work that grew with the journal, and that arrives in
     seconds. Heap comes through as a recorded baseline and no budget, for
     the reason budgets.mjs sets out. */
  console.log('budgets.json measurements, with a 3x time budget and a 100ms floor:\n');
  console.log(
    JSON.stringify(
      Object.fromEntries(
        measurements.map((m) => [
          m.name,
          {
            what: m.what,
            baselineMs: Math.round(m.ms),
            budgetMs: Math.max(100, Math.round(m.ms * 3)),
            targetMs: budgets.measurements[m.name]?.targetMs ?? null,
            heapBaselineBytes: m.heapBytes === null ? null : Math.round(m.heapBytes),
            heapBudgetBytes: null
          }
        ])
      ),
      null,
      2
    )
  );
  process.exit(0);
}

const over = breaches(measurements);
for (const line of over) console.log('FAIL ', line);

const past = overTarget();
if (past.length) {
  console.log('\nBaselines already past what a person can wait for. Each of these has a ticket:');
  for (const line of past) console.log(' ', line);
}

console.log(over.length ? `\n${over.length} MEASUREMENT(S) OVER BUDGET` : '\nEVERY MEASUREMENT IS WITHIN BUDGET');
process.exit(over.length ? 1 : 0);

function mb(bytes) {
  return `${(bytes / 1_048_576).toFixed(1)}MB`;
}
