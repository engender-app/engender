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
  await page.goto(`${server.resolvedUrls.local[0]}screen-mount.html?safe-space=1`);
  await page.waitForSelector(`body[${readyAttr('screen-mount')}]`, { state: 'attached', timeout: 60000 });
  const result = await page.evaluate((key) => window[key], resultGlobal('screen-mount'));
  assert.equal(result.safeSpace?.length, 9, JSON.stringify(result));
  for (const check of result.safeSpace) {
    console.log(`${check.passed ? 'PASS' : 'FAIL'} ${check.name}`);
    assert.ok(check.passed, check.error);
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  await server.close();
}
