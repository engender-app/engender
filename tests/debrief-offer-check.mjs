/* End-to-end guard of the appointment debrief loop (phase 6 ticket
   08), driving the real demo build through the whole flow rather than
   trusting unit tests alone. Scheduled in the built guard tier.

   Run: node tests/debrief-offer-check.mjs (builds its demo surface) */
import { preview } from 'vite';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { createReporter, fillDate, launchChromium } from './browser-harness.mjs';

const root = resolve(import.meta.dirname, '..');

const run = (command, args, env) =>
  new Promise((done, fail) => {
    const child = spawn(command, args, { cwd: root, stdio: 'inherit', env: { ...process.env, ...env } });
    child.on('exit', (code) => (code === 0 ? done() : fail(new Error(`${command} exited ${code}`))));
  });

await run('npx', ['vite', 'build'], { VITE_DEMO: '1' });

const reporter = createReporter();
const app = await preview({ preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const browser = await launchChromium();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
page.on('pageerror', error => reporter.fail('Debrief page error', error));

const settle = async (path) => {
  await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]', { timeout: 60000 });
  if (await page.locator('[data-leave-setup]').count()) {
    await page.locator('[data-leave-setup]').click();
    await page.waitForSelector('[data-home-hello]');
    await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-app-root][data-boot="ready"]');
  }
};

const check = (label, ok) => ok ? reporter.ok(label) : reporter.fail(label, 'Condition was false');

try {
  await settle('/health/appointments');
  /* The prep list's own add, beside its heading: `[data-add]` in the screen
     header books an appointment (phase 11 all-four-doors ticket 12 put both
     on one screen). */
  await page.locator('[data-add-prep]').click();
  await page.locator('#appointment-prep-input').fill('ask about labs');
  await page.locator('[data-save-appointment-item]').click();
  // The row appearing is what says the write landed. Navigating on the click
  // alone drops it, and every check below then passes for the wrong reason:
  // an empty prep list produces no offer whatever the appointments say.
  await page.waitForSelector('[data-appointment-item]');

  // The demo persona already has a past appointment with its debrief written
  // (ticket 64's seed), so the resting state is a journal whose most recent
  // past appointment is settled - which is the state that must stay quiet.
  await settle('/');
  check(
    'no offer when the most recent past appointment already has its debrief',
    (await page.locator('[data-debrief-offer]').count()) === 0
  );

  // The prep screen's own date row is a read of the appointment record now
  // (ticket 58) - a past appointment is written on the appointments screen
  // itself, not by driving a date picker on prep.
  const writeAppointment = async (date) => {
    await settle('/health/appointments');
    await page.locator('[data-add]').click();
    await page.waitForSelector('#appointment-date');
    await fillDate(page, '#appointment-date', date);
    await page.locator('[data-save-appointment]').click();
    await page.waitForSelector('[data-appointment]');
  };

  // Back-filling an old visit offers nothing: only the most recent past
  // appointment ever does, and the seeded one is still more recent than this.
  await writeAppointment('2020-01-01');
  await settle('/');
  check(
    'back-filling an older appointment produces no offer',
    (await page.locator('[data-debrief-offer]').count()) === 0
  );

  // Yesterday's visit supersedes it, and has no debrief of its own.
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  await writeAppointment(yesterday);

  await settle('/');
  const offer = page.locator('[data-debrief-offer]');
  await offer.waitFor({ state: 'visible', timeout: 5000 });
  check('offer shows once a prep item exists for a past appointment', await offer.isVisible());

  const writeLink = page.locator('[data-debrief-offer] [data-notice-action]');
  const href = await writeLink.getAttribute('href');
  check(
    'offer links to /entry/new/today with a debriefFor param naming an appointment id',
    /\/entry\/new\/today\?debriefFor=.+/.test(href ?? '')
  );

  await writeLink.click();
  await page.waitForSelector('[data-app-root][data-boot="ready"]');
  const noteValue = await page.locator('#ed-note').inputValue();
  check('the debrief template pre-filled the note', noteValue.length > 0);

  await page.locator('[data-mood="3"]').click();
  await page.locator('[data-save]').click();
  await page.waitForSelector('[data-home-hello]', { timeout: 5000 });

  check('offer is gone once the debrief is written', (await page.locator('[data-debrief-offer]').count()) === 0);

  await settle('/health/appointments');
  const debriefRow = page.locator('[data-list-row="debrief"]');
  check('the visit screen shows the "your debrief" row', (await debriefRow.count()) > 0);
} catch (error) {
  reporter.fail('Appointment debrief flow', error);
  await page.screenshot({ path: resolve(root, '.claude/debrief-check-failure.png') }).catch(() => {});
} finally {
  await page.close().catch(error => reporter.fail('Close debrief page', error));
  await browser.close().catch(error => reporter.fail('Close debrief browser', error));
  await app.close().catch(error => reporter.fail('Close debrief server', error));
  reporter.finish('Appointment debrief checks passed');
}
