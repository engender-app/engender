/* One-off end-to-end check of the appointment debrief loop (phase 6 ticket
   08), driving the real demo build through the whole flow rather than
   trusting unit tests alone. Not wired into any npm script.

   Run: node tests/debrief-offer-check.mjs */
import { preview } from 'vite';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { launchChromium } from './browser-harness.mjs';

const root = resolve(import.meta.dirname, '..');

const run = (command, args, env) =>
  new Promise((done, fail) => {
    const child = spawn(command, args, { cwd: root, stdio: 'inherit', env: { ...process.env, ...env } });
    child.on('exit', (code) => (code === 0 ? done() : fail(new Error(`${command} exited ${code}`))));
  });

await run('npx', ['vite', 'build'], { VITE_DEMO: '1' });

const app = await preview({ preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const browser = await launchChromium();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
page.on('pageerror', (err) => console.log('PAGE THREW:', err.message));

const settle = async (path) => {
  await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]');
  if (await page.locator('[data-leave-setup]').count()) {
    await page.locator('[data-leave-setup]').click();
    await page.waitForSelector('[data-home-hello]');
    await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-app-root][data-boot="ready"]');
  }
};

const check = (label, ok) => console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`);

try {
  await settle('/settings/appointment-prep');
  await page.locator('[data-add]').click();
  await page.locator('#appointment-prep-input').fill('ask about labs');
  await page.locator('[data-save-appointment-item]').click();
  await page.waitForSelector('[data-appointment-date]');

  await settle('/');
  check('no offer with a prep item but no date', (await page.locator('[data-debrief-offer]').count()) === 0);

  // The date field is a flatpickr-driven text input (DatePicker.svelte),
  // not a plain <input type=date> - it does not accept typed text, so the
  // instance's own API is driven directly rather than via `.fill()`.
  await settle('/settings/appointment-prep');
  await page.evaluate(() => {
    document.getElementById('appointment-prep-date')._flatpickr.setDate('2020-01-01', true);
  });
  await page.waitForTimeout(300);

  await settle('/');
  const offer = page.locator('[data-debrief-offer]');
  await offer.waitFor({ state: 'visible', timeout: 5000 });
  check('offer shows once a prep item exists for a past date', await offer.isVisible());

  const writeLink = page.locator('[data-debrief-offer] [data-notice-action]');
  const href = await writeLink.getAttribute('href');
  check(
    'offer links to /entry/new/today with a debriefFor param',
    /\/entry\/new\/today\?debriefFor=\d+/.test(href ?? '')
  );

  await writeLink.click();
  await page.waitForSelector('[data-app-root][data-boot="ready"]');
  const noteValue = await page.locator('#ed-note').inputValue();
  check('the debrief template pre-filled the note', noteValue.length > 0);

  await page.locator('[data-mood="3"]').click();
  await page.locator('[data-save]').click();
  await page.waitForSelector('[data-home-hello]', { timeout: 5000 });

  check('offer is gone once the debrief is written', (await page.locator('[data-debrief-offer]').count()) === 0);

  await settle('/settings/appointment-prep');
  const debriefRow = page.locator('[data-list-row="debrief"]');
  check('appointment prep shows the "your debrief" row', (await debriefRow.count()) > 0);
} catch (error) {
  console.log('SCRIPT ERROR:', error.message);
  await page.screenshot({ path: resolve(root, '.claude/debrief-check-failure.png') }).catch(() => {});
} finally {
  await page.close().catch(() => {});
  await browser.close().catch(() => {});
  await app.close().catch(() => {});
}
