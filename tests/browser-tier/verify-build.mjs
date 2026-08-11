/* Release gate (ticket 04's acceptance: "verify it, do not assume it"):
   confirms the production build (`npm run build`) is a static SPA that
   makes zero requests off its own origin - the SQLocal .wasm/worker in
   particular, which Rive's canvas package already gets wrong by
   defaulting to a CDN. Serves build/ with `vite preview` and drives a
   real Chromium through it with Playwright. Run with
   `npm run verify:build` after `npm run build`. */
import { preview } from 'vite';
import { createReporter, launchChromium } from '../browser-harness.mjs';

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
} catch (e) {
  fail('verify-build', e.message ?? String(e));
}

await browser.close();
await server.close();

const failures = finish('BUILD VERIFICATION PASSES');
process.exit(failures ? 1 : 0);
