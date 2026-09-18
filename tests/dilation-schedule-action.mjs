import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { createServer } from 'vite';
import { launchChromium, settlePage } from './browser-harness.mjs';

const server = await createServer({ server: { port: 0, fs: { allow: [process.cwd(), realpathSync('node_modules')] } } });
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await launchChromium();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
page.setDefaultTimeout(10000);

async function reloadDilation() {
  await page.goto(`${base}/health/dilation`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]');
}

try {
  await settlePage(page, base, '/health/dilation', 'light');
  const noProcedure = page.locator('[data-notice="dilation-no-procedure"]');
  await noProcedure.waitFor();
  await noProcedure.getByRole('link', { name: 'Add a procedure' }).click();
  await page.waitForURL('**/health/surgery');

  const procedureId = await page.evaluate(async () => {
    const { journal } = await import('/src/lib/data/live/journal.svelte.ts');
    return journal.procedures.upsertProcedure({
      name: 'Dilation schedule test',
      surgeryEpochDay: 20000,
      kind: 'vaginoplasty'
    });
  });

  await reloadDilation();
  const noSchedule = page.locator('[data-notice="dilation-schedule-empty"]');
  await noSchedule.waitFor();
  await noSchedule.getByRole('button', { name: 'Add your schedule' }).click();
  await page.locator('[data-save-schedule]').waitFor();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await noSchedule.waitFor();

  await page.evaluate(async (id) => {
    const { journal } = await import('/src/lib/data/live/journal.svelte.ts');
    await journal.taper.upsertTaper({
      procedureId: id,
      startEpochDay: 20001,
      stages: [{ everyNDays: 1, days: 30 }]
    });
  }, procedureId);

  await reloadDilation();
  const schedule = page.locator('[data-schedule]');
  await assert.doesNotReject(schedule.getByText('Edit schedule', { exact: true }).waitFor());
  assert.ok((await schedule.innerText()).split('\n').length >= 3, 'schedule row retains procedure and surgery-day context');
  await schedule.focus();
  await page.keyboard.press('Enter');
  await page.locator('[data-save-schedule]').waitFor();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await schedule.waitFor();
  await page.evaluate(async (id) => {
    const { journal } = await import('/src/lib/data/live/journal.svelte.ts');
    await journal.procedures.deleteProcedure(id);
  }, procedureId);
  await reloadDilation();
  await noProcedure.waitFor();
  assert.equal(await page.locator('[data-schedule]').count(), 0);
  console.log('PASS: schedule edit action, keyboard editor, procedure context, no-schedule and deleted-procedure states');
} finally {
  await browser.close();
  await server.close();
}
