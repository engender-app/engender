/* The late-reads block of the browser tier on its own (last-audit UI
   ticket 20): Good moments and Tryouts with their second read held, then
   a save and deletes, every animation frame sampled. Prints each check,
   then each run's tracked elements: the frame each first and last
   appeared on and the painted share (opacity times unclipped height) it
   had there, so a pass can be read as numbers rather than taken on
   trust. Run: node tests/late-reads-check.mjs */
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { launchChromium } from './browser-harness.mjs';
import { readyAttr, resultGlobal } from './probe-handshake.mjs';

const server = await createServer({ configFile: 'tests/browser-tier/browser-tier.vite.config.ts', server: { port: 0 } });
await server.listen();
const browser = await launchChromium();
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${server.resolvedUrls.local[0]}screen-mount.html?late-reads=1`);
  await page.waitForSelector(`body[${readyAttr('screen-mount')}]`, { state: 'attached', timeout: 60000 });
  const result = await page.evaluate((key) => window[key], resultGlobal('screen-mount'));
  const runs = await page.evaluate(() => window.__lateReadsFrames ?? {});
  for (const [name, tracks] of Object.entries(runs)) {
    console.log(name);
    for (const t of tracks) {
      const first = t.shares[0];
      const last = t.shares.at(-1);
      console.log(`  frames ${t.first}-${t.last} of ${t.end}: ${first} on the first, ${last} on the last, ${t.ramp} between`);
    }
  }
  assert.equal(result.lateReads?.length, 9, JSON.stringify(result));
  for (const check of result.lateReads) {
    console.log(`${check.passed ? 'PASS' : 'FAIL'} ${check.name}`);
    assert.ok(check.passed, check.error);
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  await server.close();
}
