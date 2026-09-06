/* End-to-end check of what the prep screen shows when the list is empty
   (phase 8 features ticket 71), driving the real demo build rather than
   trusting the markup's shape.

   Two claims, and the first is the one a unit test cannot reach: a journal
   with an appointment on record, labs drawn since the last visit and stock
   running down showed none of it to somebody who had not yet typed a
   question. So the fixture here is a full journal whose prep list is then
   emptied one row at a time through the screen's own delete control - the
   state a person is in the day they tick the last thing off.

   Not wired into any npm script. Expects a VITE_DEMO=1 build in build/.
   Run: node tests/prep-context-check.mjs */
import { preview } from 'vite';
import { resolve } from 'node:path';
import { launchChromium } from './browser-harness.mjs';

const root = resolve(import.meta.dirname, '..');

const app = await preview({ preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const browser = await launchChromium();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
page.on('pageerror', (err) => console.log('PAGE THREW:', err.message));

const goto = async (path) => {
  await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]');
};

const settle = async (path) => {
  await goto(path);
  if (await page.locator('[data-leave-setup]').count()) {
    await page.locator('[data-leave-setup]').click();
    await page.waitForSelector('[data-home-hello]');
    await goto(path);
  }
};

const sections = () =>
  page.locator('[data-section-heading] h2').allInnerTexts().then((all) => all.map((t) => t.trim()));

let failures = 0;
const check = (label, ok) => {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`);
};

try {
  /* The persona alone leaves the prep screen's reference sections empty.
     This is the jump that puts labs, side effects and stock on it, and it
     resolves by navigating to /more. */
  await settle('/');
  await page.locator('[data-fill-every-feature]').click();
  await page.waitForURL('**/more');
  await page.waitForTimeout(500);

  // A visit still ahead, so the date row has a day to name rather than
  // falling back to "Not set" - which would pass the check below for the
  // wrong reason.
  const inTwoWeeks = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
  await settle('/health/appointments');
  await page.locator('[data-add]').click();
  await page.waitForSelector('#appointment-date');
  await page.evaluate((day) => {
    document.getElementById('appointment-date')._flatpickr.setDate(day, true);
  }, inTwoWeeks);
  await page.locator('[data-save-appointment]').click();
  await page.waitForSelector('[data-appointment]');

  /* ---------- with a list ---------- */
  await settle('/health/appointment-prep');
  await page.waitForSelector('[data-appointment-item]');
  const withList = await sections();
  console.log('sections with a list:', withList.join(' / '));
  check('a list shows the way into the room', (await page.locator('[data-list-row="in-the-room"]').count()) === 1);
  check(
    'no heading claims a single visit',
    !withList.some((h) => /^For this visit$|^Na tę wizytę$/.test(h))
  );

  /* ---------- the list emptied, through the screen's own control ---------- */
  for (let guard = 0; guard < 40; guard += 1) {
    const rows = await page.locator('[data-delete-appointment-item]').count();
    if (rows === 0) break;
    await page.locator('[data-delete-appointment-item]').first().click();
    // The confirm sheet the record editor puts in front of a delete.
    const confirm = page.locator('[data-confirm-delete]');
    if (await confirm.count()) await confirm.click();
    await page.waitForFunction(
      (before) => document.querySelectorAll('[data-delete-appointment-item]').length < before,
      rows
    );
  }
  await page.waitForSelector('[data-notice="appointment-prep-empty"]');

  const emptied = await sections();
  console.log('sections with an empty list:', emptied.join(' / '));

  check(
    'an empty list still shows when the next appointment is',
    (await page.locator('[data-list-row="next-appointment"]').count()) === 1
  );
  const day = await page.locator('[data-list-row="next-appointment"]').innerText();
  // The unset strings, not a stand-in for them: this check passes for free
  // if it greps for wording the catalogues no longer carry.
  check('and shows the day rather than the unset line', !/Nothing booked yet|Nic jeszcze nie um/.test(day));
  check(
    'an empty list keeps every reference section it had',
    withList.every((heading) => emptied.includes(heading))
  );
  check(
    'an empty list does not offer the room, which would have nothing in it',
    (await page.locator('[data-list-row="in-the-room"]').count()) === 0
  );
} catch (error) {
  failures += 1;
  console.log('SCRIPT ERROR:', error.message);
  await page.screenshot({ path: resolve(root, '.claude/prep-context-failure.png') }).catch(() => {});
} finally {
  await page.close().catch(() => {});
  await browser.close().catch(() => {});
  await app.close().catch(() => {});
  console.log(failures === 0 ? '\nall checks passed' : `\n${failures} check(s) failed`);
  process.exitCode = failures === 0 ? 0 : 1;
}
