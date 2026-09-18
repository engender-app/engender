import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import { launchChromium } from './browser-harness.mjs';
import { PALETTES } from './palettes.mjs';

const server = await createServer({ server: { port: 0, fs: { allow: [process.cwd(), realpathSync('node_modules')] } } });
await server.listen();
const browser = await launchChromium();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
page.setDefaultTimeout(10000);
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const room = '/health/appointments/in-the-room';
async function visit(href) {
  await page.evaluate((href) => {
    const link = document.createElement('a');
    link.href = href;
    link.id = 'room-proof-link';
    link.textContent = 'Open';
    document.body.append(link);
  }, href);
  await page.locator('#room-proof-link').click();
  await page.evaluate(() => document.querySelector('#room-proof-link')?.remove());
}
async function choose(id) {
  await page.locator('[data-room-visit]').click();
  await page.locator(`[data-visit-pick="${id}"]`).click();
  await page.locator('[data-room-answer]').waitFor();
}
async function checkDebrief(id, answer, excluded) {
  await page.locator('[data-room-done]').click();
  await page.waitForFunction((answer) => document.querySelector('#ed-note')?.value.includes(answer), answer);
  assert.equal(new URL(page.url()).searchParams.get('debriefFor'), id);
  assert.ok(!(await page.locator('#ed-note').inputValue()).includes(excluded));
  await page.goBack();
  await page.locator('[data-room-answer]').waitFor();
  assert.equal(await page.locator('[data-room-answer]').inputValue(), answer);
}
try {
  await page.goto(server.resolvedUrls.local[0], { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]');
  if (await page.locator('[data-leave-setup]').count()) {
    await page.locator('[data-leave-setup]').click();
    await page.waitForSelector('[data-home-hello]');
  }
  const ids = await page.evaluate(async () => {
    const { journal: j } = await import('/src/lib/data/live/journal.svelte.ts');
    const { todayEpochDay } = await import('/src/lib/data/epochDay.ts');
    await j.checklists.addToStandaloneChecklist('Ask about bloods');
    const input = { epochDay: todayEpochDay(), procedureId: null, place: 'Clinic', note: null };
    return [await j.appointments.upsertAppointment({ ...input, kind: 'Morning' }),
      await j.appointments.upsertAppointment({ ...input, kind: 'Afternoon' })];
  });
  await visit('/health/appointments');
  await page.locator('[data-list-row="in-the-room"]').click();
  await page.locator('[data-room-visit]').waitFor();
  assert.equal(await page.locator('[data-room-answer]').count(), 0);
  await choose(ids[0]);
  await page.locator('[data-room-answer]').fill('Morning answer');
  await choose(ids[1]);
  assert.equal(await page.locator('[data-room-answer]').inputValue(), '');
  await page.locator('[data-room-answer]').fill('Afternoon answer');
  await checkDebrief(ids[1], 'Afternoon answer', 'Morning answer');
  await choose(ids[0]);
  assert.equal(await page.locator('[data-room-answer]').inputValue(), 'Morning answer');
  await checkDebrief(ids[0], 'Morning answer', 'Afternoon answer');

  if (process.argv.includes('--gallery')) {
    await mkdir('.claude/room-choice-shots', { recursive: true });
    for (const palette of PALETTES) for (const theme of ['light', 'dark']) {
      await page.evaluate(({ palette, theme }) => {
        document.documentElement.dataset.palette = palette;
        document.documentElement.dataset.theme = theme;
      }, { palette, theme });
      await page.locator('[data-room-visit]').click();
      await page.locator(`[data-visit-pick="${ids[1]}"]`).waitFor();
      await page.screenshot({ path: `.claude/room-choice-shots/${palette}-${theme}.png` });
      await page.keyboard.press('Escape');
    }
  }

  await page.evaluate(async (id) => {
    const { journal } = await import('/src/lib/data/live/journal.svelte.ts');
    await journal.appointments.deleteAppointment(id);
  }, ids[0]);
  await page.locator('[data-room-answer]').waitFor({ state: 'detached' });
  assert.equal(new URL(page.url()).searchParams.get('appointment'), ids[0]);
  await choose(ids[1]);
  assert.equal(await page.locator('[data-room-answer]').inputValue(), 'Afternoon answer');

  await visit('/health/appointments');
  await page.locator('[data-list-row="in-the-room"]').click();
  await page.locator('[data-room-answer]').waitFor();
  assert.equal(await page.locator('[data-room-visit]').count(), 0, 'one visit needs no choice');
  assert.equal(await page.locator('[data-room-answer]').inputValue(), 'Afternoon answer');
  await page.evaluate(async (id) => {
    const { journal } = await import('/src/lib/data/live/journal.svelte.ts');
    await journal.appointments.deleteAppointment(id);
  }, ids[1]);
  await page.locator('[data-room-answer]').waitFor({ state: 'detached' });
  await visit('/health/appointments');
  await page.locator('[data-list-row="in-the-room"]').click();
  await page.locator('[data-room-question]').waitFor();
  assert.equal(await page.locator('[data-room-answer]').count(), 0, 'rehearsal accepts no answer');
  await page.locator('[data-room-done]').click();
  await page.waitForURL('**/health/appointments');
  assert.deepEqual(errors, []);
  console.log('PASS: two visits, separate debriefs, back/return, deletion, one visit, rehearsal');
} finally {
  await browser.close();
  await server.close();
}
