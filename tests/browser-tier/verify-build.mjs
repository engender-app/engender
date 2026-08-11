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
   `npm run build`. */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { preview } from 'vite';
import { createReporter, launchChromium } from '../browser-harness.mjs';

function emittedJavaScript() {
  const dir = 'build/_app/immutable';
  const files = [];
  const walk = (path) => {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const full = join(path, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.js')) files.push(full);
    }
  };
  walk(dir);
  return files.map((f) => readFileSync(f, 'utf8')).join('\n');
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

  // Give boot() (started from +layout.svelte) time to open the database
  // and load the SQLocal worker/wasm - the whole point of this check.
  await page.waitForFunction(
    () => document.querySelector('.app-viewport') !== null,
    null,
    { timeout: 10000 }
  );
  await page.waitForTimeout(1000);

  // Confirms boot() actually ran and fetched SQLocal's wasm/worker, rather
  // than the zero-external-requests check above passing vacuously because
  // nothing loaded at all.
  if (allRequests.some((u) => u.includes('.wasm'))) ok("boot() loads SQLocal's wasm build from the app's own origin");
  else fail("boot() loads SQLocal's wasm build from the app's own origin", `no .wasm request seen; requests were: ${allRequests.join(', ')}`);

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
  const bundle = emittedJavaScript();
  const persona = ['Alice', 'Coffee with Marta', 'Voice workshop weekend'].filter((s) => bundle.includes(s));
  if (persona.length === 0) ok('production build contains no demo persona');
  else fail('production build contains no demo persona', `found ${persona.join(', ')}`);

  const demoBar = ['Demo controls', 'Jump to screen', 'Reset demo state'].filter((s) => bundle.includes(s));
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
await server.close();

const failures = finish('BUILD VERIFICATION PASSES');
process.exit(failures ? 1 : 0);
