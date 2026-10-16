import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { launchChromium } from '../browser-harness.mjs';

const server = await createServer({ configFile: 'tests/retained-door-cost/control.vite.config.ts', server: { port: 0 } });
let browser;
try {
  await server.listen();
  browser = await launchChromium();
  const page = await browser.newPage();
  await page.goto(server.resolvedUrls.local[0]);
  await page.waitForFunction(() => window.__retainedDoorStage === 'awaiting-quiet' || window.__retainedDoorResult, null, { timeout: 120000 });
  await page.evaluate(() => { window.__retainedDoorQuietGranted = true; });
  await page.waitForFunction(() => !!window.__retainedDoorResult, null, { timeout: 120000 });
  const result = await page.evaluate(() => window.__retainedDoorResult);
  assert.equal(result.error, undefined, result.error);
  assert.equal(result.samples.length, 12);
  assert.deepEqual([...new Set(result.samples.map(sample => sample.mode))].sort(), ['bounded', 'current']);
  assert(result.samples.every(sample => sample.immediateDirtyRevisit.freshNotes));
  console.log('PASS short desktop observer control: bounded hidden refresh, immediate dirty revisit freshness, retained DOM and lock cleanup');
} finally {
  await browser?.close();
  await server.close();
}
