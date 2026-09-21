/* Browser-tier proof for ticket 156: a padding-only change to a field must
   still move `--blind-edge` to the new border-box height. Node-tier tests
   can only assert the `observe()` call's arguments (stepBlind.test.ts);
   whether the browser's own ResizeObserver actually fires on that box is a
   real-browser question, answered here.

   Run: node tests/blind-edge-padding-check.mjs */
import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { createServer } from 'vite';
import { launchChromium } from './browser-harness.mjs';
import { readyAttr, resultGlobal } from './probe-handshake.mjs';

const server = await createServer({
  configFile: 'tests/browser-tier/browser-tier.vite.config.ts',
  server: { port: 0, fs: { allow: [process.cwd(), realpathSync('node_modules')] } }
});
await server.listen();
const browser = await launchChromium();
const page = await browser.newPage();
page.setDefaultTimeout(15000);
page.on('pageerror', (error) => {
  console.error(error);
  process.exitCode = 1;
});

await page.goto(`http://localhost:${server.config.server.port}/blind-edge.html`);
await page.waitForSelector(`body[${readyAttr('blind-edge-probe')}]`);
const result = await page.evaluate((key) => window[key], resultGlobal('blind-edge-probe'));

const { before, afterPaddingChange } = result;
assert.equal(before.edge, `${Math.round(before.height)}px`, 'first measurement sets --blind-edge to the field\'s starting border-box height');
assert.equal(
  afterPaddingChange.edge,
  `${Math.round(afterPaddingChange.height)}px`,
  `a padding-only resize (border-box height ${afterPaddingChange.height}px) must move --blind-edge off its stale value (${before.edge}); it read ${afterPaddingChange.edge}`
);
console.log('PASS a padding-only resize moves --blind-edge to the new border-box height');

await browser.close();
await server.close();
