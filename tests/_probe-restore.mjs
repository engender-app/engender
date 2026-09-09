/* Throwaway: the walkthrough's 13c flow on its own, saying where it stops. */
import { preview } from 'vite';
import { readFile } from 'node:fs/promises';
import { launchChromium } from './browser-harness.mjs';

const app = await preview({ preview: { port: 0 } });
const BASE = `http://localhost:${app.httpServer.address().port}`;
const browser = await launchChromium();
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
page.on('pageerror', (e) => console.error('PAGE ERROR:', e.message));
page.on('console', (m) => {
  if (m.type() === 'error') console.error('CONSOLE:', m.text().slice(0, 300));
});
page.on('crash', () => console.error('PAGE CRASHED'));

const booted = () => page.waitForSelector('[data-app-root][data-boot="ready"]', { timeout: 30000 });
const step = (s) => console.log('>>', s);

await page.goto(BASE + '/', { waitUntil: 'networkidle' });
await booted();
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });
await booted();

step('counting entries before');
await page.goto(BASE + '/calendar', { waitUntil: 'networkidle' });
await booted();
await page.waitForSelector('[data-entry-card]');
const before = await page.locator('[data-entry-card]').count();
console.log('   before =', before);

step('exporting');
await page.goto(BASE + '/settings/export', { waitUntil: 'networkidle' });
await booted();
await page.locator('#exp-pass').fill('walkthrough');
await page.locator('[data-export]').click();
const [archive] = await Promise.all([
  page.waitForEvent('download', { timeout: 120000 }),
  page.locator('[data-confirm-export]').click()
]);
const bytes = await readFile(await archive.path());
console.log('   archive =', archive.suggestedFilename(), bytes.length, 'bytes');

step('jumping to first run');
await page.goto(BASE + '/', { waitUntil: 'networkidle' });
await booted();
await page.selectOption('#demo-jump', 'first-run');
await page.waitForSelector('[data-restore-start]');
await page.locator('[data-restore-start]').click();
await page.waitForSelector('[data-restore-pick]');

step('refusing a file that is not an archive');
page.once('filechooser', (c) =>
  c.setFiles({
    name: 'not-a-backup.ttbackup',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from('this is not an archive')
  })
);
await page.locator('[data-restore-pick]').click();
await page.waitForFunction(() =>
  document.querySelector('[data-restore-file]')?.textContent.includes('not-a-backup')
);
await page.locator('#ob-restore-pass').fill('walkthrough');
await page.locator('[data-restore-check]').click();
await page.waitForSelector('[data-restore-error="not-an-archive"]', { timeout: 20000 });
console.log('   refused ok');

step('picking the real archive');
page.once('filechooser', (c) =>
  c.setFiles({
    name: archive.suggestedFilename(),
    mimeType: 'application/octet-stream',
    buffer: bytes
  })
);
await page.locator('[data-restore-pick]').click();
await page.waitForFunction(
  (n) => document.querySelector('[data-restore-file]')?.textContent.includes(n),
  archive.suggestedFilename()
);
await page.locator('#ob-restore-pass').fill('walkthrough');
await page.locator('[data-restore-check]').click();

step('waiting for the step after the restore');
await page.waitForSelector('[data-next]', { timeout: 180000 });
console.log('   name field present?', await page.locator('#ob-name').count());
console.log('   flag picker present?', await page.locator('[data-palette-pick]').count());
await page.locator('[data-next]').click();
await page.waitForSelector('[data-finish]', { timeout: 30000 });

step('finishing: the restore itself');
await page.locator('[data-finish]').click();
await page.waitForSelector('[data-home-hello]', { timeout: 180000 });
console.log('   landed on', page.url());

step('counting entries after');
await page.goto(BASE + '/calendar', { waitUntil: 'networkidle' });
await booted();
await page.waitForSelector('[data-entry-card]', { timeout: 30000 });
const after = await page.locator('[data-entry-card]').count();
console.log('   after =', after, before === after ? 'MATCH' : 'MISMATCH');

await page.close();
await context.close();
await app.close();
await browser.close();
