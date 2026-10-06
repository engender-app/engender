import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { launchChromium } from './browser-harness.mjs';

const server = await createServer({
  configFile: false,
  root: process.cwd(),
  appType: 'custom',
  server: { host: '127.0.0.1', port: 0 }
});
server.middlewares.use('/device-bound-write-proof', (_request, response) => {
  response.setHeader('Content-Type', 'text/html');
  response.end('<!doctype html><title>Device-bound write proof</title>');
});
await server.listen();
const browser = await launchChromium();
try {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/device-bound-write-proof`);
  const result = await page.evaluate(async () => {
    const journal = await import('/src/lib/data/device-bound-journal.ts');
    const root = await navigator.storage.getDirectory();
    const initial = await journal.setupDeviceBoundJournal();
    const oldMetadata = journal.parseDeviceBoundMetadata(await (await (await root.getFileHandle('device-key.json')).getFile()).text());
    const replacement = crypto.getRandomValues(new Uint8Array(32));
    await journal.addDeviceBoundJournal(replacement);
    const slot = journal.browserKeySlot('journal-device-key');
    const equal = (left, right) => left.length === right.length && left.every((byte, index) => byte === right[index]);
    const reused = equal(await journal.unlockDeviceBoundMetadata(oldMetadata, slot), initial);
    const keyIsPrivate = !(await slot.load()).extractable;
    const checks = { reused, keyIsPrivate };
    for (const fault of ['write', 'close']) {
      const original = FileSystemWritableFileStream.prototype[fault];
      FileSystemWritableFileStream.prototype[fault] = async function (value) {
        if (fault === 'write') await original.call(this, value.slice(0, 10));
        throw new Error(`forced metadata ${fault} failure`);
      };
      let refused = false;
      try { await journal.addDeviceBoundJournal(crypto.getRandomValues(new Uint8Array(32))); }
      catch (error) { refused = error.message === `forced metadata ${fault} failure`; }
      finally { FileSystemWritableFileStream.prototype[fault] = original; }
      checks[fault] = refused && equal(await journal.unlockDeviceBoundJournal(), replacement);
    }
    return checks;
  });
  assert.deepEqual(result, { reused: true, keyIsPrivate: true, write: true, close: true });
  console.log('PASS device-bound key reuse, private key, failed write and failed close on real OPFS/IndexedDB');
} finally {
  await browser.close();
  await server.close();
}
