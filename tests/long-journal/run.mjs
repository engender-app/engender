/* The ten-year benchmark (phase 2 ticket 20). Run with
   `npm run benchmark:long-journal`.

   Its own script rather than another block in tests/browser-tier/run.mjs,
   and its own CI job. The run takes 44 seconds, most of it writing the
   fixture, and it leaves 340MB in the origin's storage - so folding it into
   the browser tier would put that alongside every other probe's SAHPool for
   the rest of that run, and add 44 seconds to a suite that answers a
   different kind of question. This one gates on timing rather than on
   correctness, so a wobble here should not turn the correctness suite red,
   and its log should be retrievable on its own. As a separate CI job it
   also runs concurrently, which costs nothing in wall clock.

   Two modes. By default it measures and fails on anything over budget,
   which is what CI wants. With --record it prints the numbers in the shape
   budgets.json wants and fails on nothing, which is what re-baselining on
   new hardware wants. */
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { createReporter, launchChromium } from '../browser-harness.mjs';
import { breaches, budgets, mb, overTarget } from './budgets.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const recording = process.argv.includes('--record');
const { fail, finish } = createReporter();

const server = await createServer({
  configFile: `${here}/long-journal.vite.config.ts`,
  server: { port: 0 }
});
await server.listen();
const port = server.config.server.port;

const browser = await launchChromium();
const page = await (await browser.newContext()).newPage();
page.on('console', (message) => {
  if (message.type() === 'error') console.log('  browser error:', message.text());
});

console.log('Generating ten years of Journal and measuring it. Around 45 seconds.\n');

let result;
try {
  await page.goto(`http://localhost:${port}/`, { waitUntil: 'networkidle' });
  await page.waitForSelector('body[data-long-journal-ready]', { state: 'attached', timeout: 5 * 60_000 });
  result = await page.evaluate(() => window.__longJournalResult);
} finally {
  await browser.close();
  await server.close();
}

if (result?.error) {
  fail('the benchmark ran', result.error);
  finish('');
  process.exit(1);
}

const { summary, measurements, generatedInMs, photoBytes } = result;

console.log(
  `Fixture: ${summary.entries} entries over ${summary.lastEpochDay - summary.firstEpochDay + 1} days ` +
    `(${summary.daysWithEntries} with entries), ${summary.photos} photos (${mb(photoBytes)}), ` +
    `${summary.labResults} lab results, ${summary.milestones} milestones. ` +
    `Written in ${(generatedInMs / 1000).toFixed(0)}s.`
);
console.log('');

const pad = (text, width) => String(text).padEnd(width);
const widest = Math.max(...measurements.map((m) => m.what.length));

for (const m of measurements) {
  const budget = budgets.measurements[m.name];
  const against = budget ? `  budget ${budget.budgetMs}ms` : '  NO BUDGET';
  console.log(`  ${pad(m.what, widest)}  ${pad(`${Math.round(m.ms)}ms`, 9)}${recording ? '' : against}`);
  console.log(`  ${pad('', widest)}  ${m.detail}`);
}
console.log('');

if (recording) {
  /* A 5x time budget with a 200ms floor, for the reason budgets.mjs sets
     out. Computed from the rounded baseline rather than the raw
     measurement, so the file reproduces its own rule when someone checks
     it. */
  console.log('budgets.json measurements, with a 5x time budget and a 200ms floor:\n');
  console.log(
    JSON.stringify(
      Object.fromEntries(
        measurements.map((m) => {
          const baselineMs = Math.round(m.ms);
          return [
            m.name,
            {
              what: m.what,
              baselineMs,
              budgetMs: Math.max(200, baselineMs * 5),
              targetMs: budgets.measurements[m.name]?.targetMs ?? null
            }
          ];
        })
      ),
      null,
      2
    )
  );
  process.exit(0);
}

for (const line of breaches(measurements)) fail('within budget', line);

const past = overTarget();
if (past.length) {
  console.log('Baselines already past what a person can wait for. Each of these has a ticket:');
  for (const line of past) console.log(' ', line);
}

const failures = finish('EVERY MEASUREMENT IS WITHIN BUDGET');
process.exit(failures ? 1 : 0);
