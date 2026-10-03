/* The one- and ten-year benchmark (phase 2 ticket 20). Run with
   `npm run benchmark:long-journal`.

   Its own script rather than another block in tests/browser-tier/run.mjs,
   and its own CI job. The run takes about 90 seconds, most of it writing the
   fixtures, and it leaves about 390MB in the origin's storage. Folding it
   into the browser tier would put that alongside every other probe's SAHPool for
   the rest of that run, and add about 90 seconds to a suite that answers a
   different kind of question. This one gates on timing rather than on
   correctness, so a wobble here should not turn the correctness suite red,
   and its log should be retrievable on its own. As a separate CI job it
   also runs concurrently, which costs nothing in wall clock.

   Two modes. By default it measures and fails on anything over budget or
   scaling limit, which is what CI wants. With --record it prints the numbers in the shape
   budgets.json wants and fails on nothing, which is what re-baselining on
   new hardware wants. */
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { createReporter, launchChromium } from '../browser-harness.mjs';
import { readyAttr, resultGlobal } from '../probe-handshake.mjs';
import { breaches, budgetFor, budgets, mb, mountBudgetsFor, overTarget } from './budgets.mjs';

const NAME = 'long-journal';

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

/* The browser tier converged on forwarding pageerror (tests/browser-tier/
   run.mjs), so a module that throws on import fails by name rather than
   running out a timeout. This runner converges too, for a sharper reason
   than the browser tier had: its timeout is 5 minutes, not 30 seconds - the
   ten-year fixture takes a while to generate - so an import-time throw here
   would otherwise sit silent for most of that before surfacing as an
   anonymous Timeout. walkthrough.test.mjs stays on its own policy
   (docs/agents/verification.md explains why: one continuous page across 48
   flows has no natural per-check boundary to attribute a pageerror to, so it
   collects them instead of racing each flow against one). */
let onPageError;
page.on('pageerror', (error) => onPageError?.(error));

console.log('Generating one year and ten years of Journal and measuring both. Around 90 seconds.\n');
const startedAt = performance.now();

let result;
try {
  const failure = new Promise((_resolve, reject) => {
    onPageError = reject;
  });
  await Promise.race([
    (async () => {
      await page.goto(`http://localhost:${port}/`, { waitUntil: 'networkidle' });
      await page.waitForSelector(`body[${readyAttr(NAME)}]`, { state: 'attached', timeout: 5 * 60_000 });
    })(),
    failure
  ]);
  result = await page.evaluate((key) => window[key], resultGlobal(NAME));
} catch (error) {
  result = { error: error?.message ?? String(error) };
} finally {
  onPageError = undefined;
  await browser.close();
  await server.close();
}

if (result?.error) {
  fail('the benchmark ran', result.error);
  finish('');
  process.exit(1);
}

const { summary, measurements, generatedInMs, photoBytes, oneYear, scaling } = result;

console.log(`One-year fixture: ${oneYear.summary.entries} entries, ${oneYear.summary.photos} photos (${mb(oneYear.photoBytes)}), written in ${(oneYear.generatedInMs / 1000).toFixed(1)}s.`);
console.log(`Size ratio: ${scaling.sizeRatio.toFixed(2)}x entries; time-growth limit ${scaling.limit.toFixed(2)}x. Desktop elapsed ${((performance.now() - startedAt) / 1000).toFixed(1)}s.`);

console.log(
  `Fixture: ${summary.entries} entries over ${summary.lastEpochDay - summary.firstEpochDay + 1} days ` +
    `(${summary.daysWithEntries} with entries), ${summary.photos} photos (${mb(photoBytes)}), ` +
    `${summary.labResults} lab results, ${summary.milestones} milestones, ` +
    `${summary.regionEuphoriaEntries} region-euphoria entries, ${summary.hairStagings} hair stagings, ` +
    `${summary.doseEvents} dose events. ` +
    `Written in ${(generatedInMs / 1000).toFixed(0)}s.`
);
console.log('Desktop query timing is not Android frame or decode performance.\n');

const pad = (text, width) => String(text).padEnd(width);
const kb = (bytes) => `${(bytes / 1024).toFixed(1)}KB`;
const widest = Math.max(...measurements.map((m) => m.what.length));

for (const m of measurements) {
  const budget = budgets.measurements[m.name];
  const against = budget ? `  budget ${budget.budgetMs}ms` : '  NO BUDGET';
  const pair = scaling.measurements.find((pair) => pair.name === m.name);
  console.log(`  ${pad(m.what, widest)}  1y ${pair.oneYearMs.toFixed(2)}ms  10y ${pair.tenYearMs.toFixed(2)}ms  ${pair.ratio.toFixed(2)}x${recording ? '' : against}`);
  console.log(`  ${pad('', widest)}  ${m.detail}`);
  /* A screen mount's own line, because time is the least of what it says:
     the statements are round trips through a serialising boundary and the
     bytes are what that boundary carries (phase 8 audit ticket 01). */
  if (m.statements != null) {
    const counts = `${m.statements} statements, ${kb(m.bytes)} across the driver seam`;
    const ceilings =
      budget?.statementBudget != null ? `  budget ${budget.statementBudget} statements, ${kb(budget.byteBudget)}` : '';
    console.log(`  ${pad('', widest)}  ${counts}${recording ? '' : ceilings}`);
  }
}
console.log('');

if (recording) {
  /* budgetFor()'s rule, for the reason budgets.mjs sets out: a 5x time
     budget with a 200ms floor, capped at the target. Computed from the
     rounded baseline rather than the raw measurement, so the file
     reproduces its own rule when someone checks it. */
  console.log('budgets.json measurements, with budgetFor()\'s rule:\n');
  console.log(
    JSON.stringify(
      Object.fromEntries(
        measurements.map((m) => {
          const baselineMs = Math.round(m.ms);
          const targetMs = budgets.measurements[m.name]?.targetMs ?? null;
          return [
            m.name,
            {
              what: m.what,
              baselineMs,
              budgetMs: budgetFor(baselineMs, targetMs),
              targetMs,
              // Only a screen mount carries these, and mountBudgetsFor()'s
              // rule is applied here for the same reason budgetFor()'s is.
              ...(m.statements == null
                ? {}
                : {
                    statementBaseline: m.statements,
                    byteBaseline: m.bytes,
                    ...mountBudgetsFor(m.statements, m.bytes)
                  })
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

for (const line of breaches(oneYear.measurements)) fail('one year within budget', line);
for (const line of breaches(measurements)) fail('ten years within budget', line);
for (const line of scaling.breaches) fail('within scaling limit', line);

const past = overTarget();
if (past.length) {
  console.log('Baselines already past what a person can wait for. Each of these has a ticket:');
  for (const line of past) console.log(' ', line);
}

const failures = finish('BOTH SIZES ARE WITHIN BUDGET AND SCALING LIMIT');
process.exit(failures ? 1 : 0);
