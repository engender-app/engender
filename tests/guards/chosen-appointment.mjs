import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import { continueToTheRest, launchChromium } from '../browser-harness.mjs';
import { PALETTES } from '../palettes.mjs';

const server = await createServer({ server: { port: 0, fs: { allow: [process.cwd(), realpathSync('node_modules')] } } });
await server.listen();
const browser = await launchChromium();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
page.setDefaultTimeout(30000);
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
  await page.waitForURL(new URL(href, page.url()).href);
  await page.waitForFunction(() => !document.documentElement.dataset.nav);
}
async function choose(id) {
  await page.locator('[data-room-visit]').click();
  await page.locator(`[data-visit-pick="${id}"]`).click();
  // The answer stays inert until the choice sheet finishes closing.
  await page.locator('[data-sheet]').waitFor({ state: 'detached' });
  await page.locator('[data-room-answer]').waitFor();
}
async function checkDebrief(id, answer, excluded) {
  await page.locator('[data-room-done]').click();
  // The debrief opens on the first step; its scaffold is with the note on the last.
  await continueToTheRest(page);
  await page.waitForFunction((answer) => document.querySelector('#ed-note')?.value.includes(answer), answer);
  assert.equal(new URL(page.url()).searchParams.get('debriefFor'), id);
  assert.ok(!(await page.locator('#ed-note').inputValue()).includes(excluded));
  // Each step of the new entry is its own history entry, so Back walks them first;
  // leaving the first step asks to discard the face continueToTheRest picked.
  for (let step = 0; step < 6 && !(await page.locator('[data-room-answer]').count()); step++) {
    await page.goBack();
    await page.waitForFunction(() => document.querySelector('[data-room-answer], [data-discard-record]') || document.querySelectorAll('[data-entry-step]').length === 1);
    if (await page.locator('[data-discard-record]').count()) {
      // Discard finishes the Back that asked for it; wait for it rather than pressing another.
      await page.locator('[data-discard-record]').click();
      await page.locator('[data-room-answer]').waitFor();
    }
  }
  await page.locator('[data-room-answer]').waitFor();
  assert.equal(await page.locator('[data-room-answer]').inputValue(), answer);
}
try {
  await page.goto(server.resolvedUrls.local[0], { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]', { timeout: 60000 });
  if (await page.locator('[data-leave-setup]').count()) {
    await page.locator('[data-leave-setup]').click();
    await page.waitForSelector('[data-home-hello]');
  }
  const ids = await page.evaluate(async () => {
    const { journal: j } = await import('/src/lib/data/live/journal.svelte.ts');
    const { todayEpochDay } = await import('/src/lib/data/epochDay.ts');
    const checklist = await j.checklists.getStandaloneChecklist();
    if (checklist) await j.checklists.deleteChecklist(checklist.id);
    for (const question of ['Ask about bloods', 'Ask about timing', 'Ask about follow-up']) {
      await j.checklists.addToStandaloneChecklist(question);
    }
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
  await page.locator('[data-room-next]').click();
  await page.locator('[data-room-next]').click();
  await page.locator('[data-room-answer]').fill('Third answer');
  assert.equal(await page.locator('[data-room-question]').innerText(), 'Ask about follow-up');
  await page.goBack();
  await page.locator('[data-list-row="in-the-room"]').waitFor();
  await page.goForward();
  await page.locator('[data-room-answer]').waitFor();
  assert.equal(await page.locator('[data-room-question]').innerText(), 'Ask about follow-up', 'Forward restores question three');
  assert.equal(await page.locator('[data-room-answer]').inputValue(), 'Third answer');
  console.log('PASS question three and its answer survive Back/Forward');

  await visit('/health/appointments');
  await visit(`${room}?appointment=${ids[0]}`);
  await page.locator('[data-room-answer]').waitFor();
  assert.equal(await page.locator('[data-room-question]').innerText(), 'Ask about bloods', 'a fresh visit starts at question one');
  assert.equal(await page.locator('[data-room-answer]').inputValue(), 'Morning answer');
  assert.equal(await page.locator('[data-room-previous]').isDisabled(), true);
  await page.locator('[data-room-next]').click();
  await page.locator('[data-room-answer]').fill('Second answer');
  await page.goBack();
  await page.locator('[data-list-row="in-the-room"]').waitFor();
  await page.goBack();
  await page.locator('[data-room-answer]').waitFor();
  assert.equal(await page.locator('[data-room-question]').innerText(), 'Ask about follow-up', 'the earlier visit keeps question three');
  assert.equal(await page.locator('[data-room-answer]').inputValue(), 'Third answer');
  assert.equal(await page.locator('[data-room-next]').isDisabled(), true);
  await page.goForward();
  await page.locator('[data-list-row="in-the-room"]').waitFor();
  await page.goForward();
  await page.locator('[data-room-answer]').waitFor();
  assert.equal(await page.locator('[data-room-question]').innerText(), 'Ask about timing', 'the later visit keeps question two');
  assert.equal(await page.locator('[data-room-answer]').inputValue(), 'Second answer');
  console.log('PASS fresh visits start at one; separate history visits keep their own question');
  await choose(ids[1]);
  assert.equal(await page.locator('[data-room-question]').innerText(), 'Ask about timing', 'changing appointment keeps the standing-list question');
  assert.equal(await page.locator('[data-room-answer]').inputValue(), '', 'the other appointment cannot inherit this answer');
  await page.locator('[data-room-answer]').fill('Afternoon second answer');
  await choose(ids[0]);
  assert.equal(await page.locator('[data-room-question]').innerText(), 'Ask about timing');
  assert.equal(await page.locator('[data-room-answer]').inputValue(), 'Second answer');
  console.log('PASS appointment selection keeps the question but switches to its own answers');
  await page.locator('[data-room-previous]').click();
  assert.equal(await page.locator('[data-room-answer]').inputValue(), 'Morning answer');
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
      await page.waitForTimeout(600);
      await page.evaluate(() => {
        for (const toast of document.querySelectorAll('[data-toast]')) toast.remove();
      });
      await page.screenshot({ path: `.claude/room-choice-shots/${palette}-${theme}.png` });
      await page.keyboard.press('Escape');
      await page.waitForTimeout(600);
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
  assert.equal(await page.locator('[data-room-question]').innerText(), 'Ask about bloods', 'a different appointment opens at question one');
  await page.locator('[data-room-next]').click();
  await page.locator('[data-room-next]').click();
  await page.locator('[data-room-answer]').fill('Private last answer');
  await visit('/health/appointments');
  await page.goBack();
  await page.locator('[data-room-answer]').waitFor();
  assert.equal(await page.locator('[data-room-question]').innerText(), 'Ask about follow-up');
  await page.evaluate(async () => {
    const { prefs } = await import('/src/lib/data/prefs/store.svelte.ts');
    prefs.lockAfter = 'immediately';
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    delete document.visibilityState;
  });
  await page.locator('[data-applock]').waitFor();
  assert.equal(await page.locator('[data-room-question], [data-room-answer]').count(), 0, 'lock conceals the room');
  await page.locator('#session-passphrase').fill('demo');
  await page.locator('[data-applock] button[type="submit"]').click();
  await page.locator('[data-applock]').waitFor({ state: 'detached' });
  await page.locator('[data-room-answer]').waitFor();
  assert.equal(await page.locator('[data-room-question]').innerText(), 'Ask about bloods', 'unlock forgets the question position');
  assert.equal(await page.locator('[data-room-answer]').inputValue(), '', 'unlock forgets the first answer');
  await page.locator('[data-room-next]').click();
  await page.locator('[data-room-next]').click();
  assert.equal(await page.locator('[data-room-answer]').inputValue(), '', 'unlock forgets the third answer');
  await page.goForward();
  await page.locator('[data-list-row="in-the-room"]').waitFor();
  await page.goBack();
  await page.locator('[data-room-answer]').waitFor();
  assert.equal(await page.locator('[data-room-answer]').inputValue(), '', 'history after unlock cannot revive held answers');
  console.log('PASS real web lock/unlock clears held positions and answers');
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
