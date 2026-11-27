import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { createServer } from 'vite';
import { fillDate, fillTime, launchChromium, settlePage, dateValue, fieldValue } from '../browser-harness.mjs';
import { PALETTES } from '../palettes.mjs';

const gallery = process.argv.includes('--gallery');
const out = '.claude/appointment-entry-shots';
if (gallery) await mkdir(out, { recursive: true });

const server = await createServer({
  cacheDir: '.svelte-kit/appointment-entry-vite',
  server: { port: 0, fs: { allow: [process.cwd(), realpathSync('node_modules')] } }
});
await server.listen();
const browser = await launchChromium();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
page.setDefaultTimeout(10000);
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));

async function close() {
  await page.locator('[data-close-record]').click();
  await page.waitForSelector('[data-sheet]', { state: 'detached' });
}
/* Each appointment opens its own screen. Back returns to the list. */
async function openScreen(row) {
  await row.click();
  await page.waitForSelector('[data-appointment-screen]');
}
async function back() {
  await page.locator('[data-screen-back]').click();
  await page.waitForURL((url) => url.pathname === '/health/appointments');
  await page.waitForSelector('[data-appointment-screen]', { state: 'detached' });
}
async function navigate(path) {
  await page.evaluate((path) => {
    const link = document.createElement('a');
    link.href = path;
    document.body.append(link);
    link.click();
    link.remove();
  }, path);
  await page.waitForURL((url) => url.pathname === path);
}
async function valuesMatch() {
  for (const [id, value] of Object.entries({
    'appointment-kind': 'Follow-up', 'appointment-place': 'Clinic',
    'appointment-note': 'Ask about bloods', 'appointment-date': '2024-03-12'
  })) assert.equal(await fieldValue(page.locator(`#${id}`)), value, id);
}

async function fieldOrder() {
  // Who answers the kind, so its chips follow
  // the kind's; the time follows the day it belongs to.
  const controls = [page.locator('#appointment-kind'), ...await page.locator('[data-kind]').all(),
    ...await page.locator('[data-who]').all(), page.locator('[data-who-new]'),
    ...['appointment-place', 'appointment-note', 'appointment-cost', 'appointment-cost-currency'].map((id) => page.locator(`#${id}`)),
    // The cost follows the note: an amount beside its currency, then Refunded.
    page.locator('[data-sheet] [role="switch"]'),
    ...['appointment-date', 'appointment-time'].map((id) => page.locator(`#${id}`))];
  const positions = [];
  for (const control of controls) {
    positions.push(await control.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      return { top: rect.top, left: rect.left };
    }));
  }
  for (let i = 1; i < positions.length; i++) {
    const previous = positions[i - 1], current = positions[i];
    assert.ok(current.top > previous.top || (current.top === previous.top && current.left > previous.left),
      'Kind, its suggestions, who, place, note and cost precede day and time in reading order');
  }
  await controls[0].focus();
  for (const control of controls.slice(1)) {
    await page.keyboard.press('Tab');
    assert.equal(await control.evaluate((el) => document.activeElement === el), true, 'Keyboard follows reading order');
  }
}

async function capture(name, zoom) {
  const sheet = page.locator('[data-sheet]');
  assert.equal(await sheet.evaluate((el) => el.scrollWidth <= el.clientWidth), true, `${name}: no horizontal overflow`);
  for (const control of await sheet.locator('input, textarea, button').all()) {
    const box = await control.boundingBox();
    const overlay = await control.evaluate((el) => {
      const after = getComputedStyle(el, '::after');
      return after.content !== 'none' && after.position === 'absolute'
        ? { width: parseFloat(after.width) || 0, height: parseFloat(after.height) || 0 }
        : { width: 0, height: 0 };
    });
    assert.ok(Math.max(box.width / zoom, overlay.width) >= 48 && Math.max(box.height / zoom, overlay.height) >= 48,
      `${name}: 48px touch target`);
  }
  assert.equal(await page.locator('#appointment-date').evaluate((input) => {
    const style = getComputedStyle(input);
    const context = document.createElement('canvas').getContext('2d');
    context.font = `${style.fontSize} ${style.fontFamily}`;
    return context.measureText(input.value).width + parseFloat(style.paddingLeft) + parseFloat(style.paddingRight) <= input.clientWidth;
  }), true, `${name}: readable day`);
  if (gallery) {
    await sheet.evaluate((el) => { el.scrollTop = 0; });
    await sheet.screenshot({ path: `${out}/${name}.png` });
    if (await sheet.evaluate((el) => el.scrollHeight > el.clientHeight)) {
      await sheet.evaluate((el) => { el.scrollTop = el.scrollHeight; });
      await sheet.screenshot({ path: `${out}/${name}-bottom.png` });
    }
  }
}

try {
  await settlePage(page, server.resolvedUrls.local[0], 'health/appointments', 'light');
  await page.evaluate(async () => {
    const { journal } = await import('/src/lib/data/live/journal.svelte.ts');
    for (const appointment of [...await journal.appointments.getAppointments(), ...await journal.appointments.getWaiting()])
      await journal.appointments.deleteAppointment(appointment.id);
    for (const provider of await journal.appointments.getProviders()) await journal.appointments.deleteProvider(provider.id);
  });
  await page.locator('[data-appointment]').waitFor({ state: 'detached' });
  await page.locator('[data-add]').click();
  await page.locator('#appointment-kind').waitFor();
  await fieldOrder();
  assert.equal(await page.locator('[data-kind]').count(), 0, 'No suggestions before naming a kind');
  const today = await page.evaluate(() => new Date().toLocaleDateString('sv-SE'));
  assert.equal(await dateValue(page.locator('#appointment-date')), today);
  assert.equal(await page.locator('[data-save-appointment]').isEnabled(), true, 'Kind, place and note remain optional');
  console.log('PASS appointment content and context precede day in reading and keyboard order');
  assert.equal(await page.locator('[data-add-to-calendar]').count(), 0, 'Calendar action needs a committed appointment');
  await page.locator('#appointment-kind').fill('Follow-up');
  await page.locator('#appointment-place').fill('Clinic');
  await page.locator('#appointment-note').fill('Ask about bloods');
  await fillDate(page, '#appointment-date', '2024-03-12');
  await page.locator('[data-save-appointment]').click();
  await page.waitForSelector('[data-sheet]', { state: 'detached' });
  const row = page.locator('[data-past] [data-appointment]').filter({ hasText: 'Follow-up' });
  const rowId = await row.getAttribute('data-appointment');
  assert.equal(await row.getAttribute('href'), `/health/appointments/${rowId}`, 'The row is a link to its own screen');
  await openScreen(row);
  await valuesMatch();
  await page.locator('[data-kind="Follow-up"]').waitFor();
  await page.locator('#appointment-kind').fill('');
  await page.locator('[data-kind="Follow-up"]').click();
  assert.equal(await page.locator('#appointment-kind').inputValue(), 'Follow-up');
  await fillDate(page, '#appointment-date', '2024-03-14');
  await page.locator('[data-add-to-calendar]').click();
  const [download] = await Promise.all([
    page.waitForEvent('download'), page.locator('[data-share-to-calendar]').click()
  ]);
  const ics = await readFile(await download.path(), 'utf8');
  assert.ok(ics.includes('DTSTART;VALUE=DATE:20240312'), 'Calendar handoff uses saved day, not changed draft');
  assert.ok(!ics.includes('Clinic') && !ics.includes('Ask about bloods'), 'Handoff keeps journal context private');
  await page.locator('#calendar-handoff-title').waitFor({ state: 'detached' });
  console.log('PASS calendar handoff uses committed appointment while draft day differs');
  assert.equal(await dateValue(page.locator('#appointment-date')), '2024-03-14', 'Handoff retains draft');
  await page.locator('#appointment-note').fill('Unsaved questions');
  await page.locator('[data-screen-back]').click();
  await page.locator('[data-keep-editing]').click();
  await page.locator('[data-keep-editing]').waitFor({ state: 'detached' });
  assert.equal(new URL(page.url()).pathname, `/health/appointments/${rowId}`, 'Keep editing stays on the screen');
  assert.equal(await page.locator('#appointment-note').inputValue(), 'Unsaved questions');
  await page.locator('[data-screen-back]').click();
  await page.locator('[data-discard-record]').click();
  await page.waitForURL((url) => url.pathname === '/health/appointments');
  await openScreen(row);
  await valuesMatch();
  /* The note saves on its own, and the day saves with the details: each
     button writes only its own half. */
  await page.locator('#appointment-note').fill('Ask about bloods, and the scan');
  await fillDate(page, '#appointment-date', '2024-03-14');
  await page.locator('[data-save-appointment-note]').click();
  await page.waitForFunction(() => document.querySelector('[data-save-appointment-note]') && !document.querySelector('[data-save-appointment-note]').disabled);
  await page.locator('[data-screen-back]').click();
  await page.locator('[data-discard-record]').click();
  await page.waitForURL((url) => url.pathname === '/health/appointments');
  await openScreen(row);
  assert.equal(await page.locator('#appointment-note').inputValue(), 'Ask about bloods, and the scan', 'The note saved');
  assert.equal(await dateValue(page.locator('#appointment-date')), '2024-03-12', 'and the unsaved day did not');
  await page.locator('#appointment-note').fill('Ask about bloods');
  await page.locator('[data-save-appointment-note]').click();
  await page.waitForFunction(() => !document.querySelector('[data-save-appointment-note]').disabled);
  await back();
  console.log('PASS create/reopen retains all fields; suggestions fill kind; discard preserves saved record; note and details save apart');

  /* Waiting lists: an appointment saved with no
     day waits, says how long as a fact, collects dated updates, and later
     takes a day without becoming another record. */
  async function clearDate(selector) {
    await page.locator(selector).click();
    await page.locator('[data-date-picker] [data-date-picker-clear]').click();
    await page.locator('[data-date-picker]').waitFor({ state: 'detached' });
  }
  await page.locator('[data-add]').click();
  await page.locator('#appointment-kind').fill('Gender clinic');
  await page.locator('#appointment-place').fill('Charing Cross');
  await clearDate('#appointment-date');
  await fillDate(page, '#appointment-referred', '2024-01-10');
  await page.locator('[data-save-appointment]').click();
  await page.waitForSelector('[data-sheet]', { state: 'detached' });
  const waitRow = page.locator('[data-waiting] [data-waiting-appointment]').filter({ hasText: 'Gender clinic' });
  await waitRow.waitFor();
  const waitId = await waitRow.getAttribute('data-waiting-appointment');
  const waitText = await waitRow.innerText();
  assert.match(waitText, /Waiting \d+ (years?|months?)[^\n]*, since 10 Jan 2024/, `elapsed time stated: ${waitText}`);
  const screenText = await page.locator('main, body').first().innerText();
  assert.ok(!/\b(left to wait|expected|estimate|likely|remaining)\b|in \d+ (days?|months?|years?)[^)]*Gender clinic/i.test(screenText),
    'No prediction appears on the screen');
  await openScreen(waitRow);
  assert.equal(await page.locator('[data-add-to-calendar]').count(), 0, 'A wait has nothing to hand to a calendar');
  await page.locator('#appointment-update').fill('Letter came');
  await fillDate(page, '#appointment-update-date', '2024-02-01');
  await page.locator('[data-add-status-update]').click();
  await page.locator('[data-status-update]').waitFor();
  assert.equal(await page.locator('#appointment-update').inputValue(), '', 'The update field empties once added');
  await back();
  assert.ok((await waitRow.innerText()).includes('1 Feb: Letter came'), 'The row quotes the latest update');
  await page.locator('[data-add-waiting]').click();
  assert.equal(await dateValue(page.locator('#appointment-date')), '', 'A new wait opens with no day');
  assert.equal(await dateValue(page.locator('#appointment-referred')), today, 'and today as its referred-on day');
  await close();
  console.log('PASS a referral saves with no day, states its wait as elapsed time only, and collects dated updates');

  await navigate('/day/2024-01-10');
  await page.locator(`[data-list-row="appointment-referred-${waitId}"]`).waitFor();
  assert.equal(await page.locator(`a[href="/health/appointments/${waitId}"]`).count(), 1, 'The referral row opens its appointment');
  await navigate('/day/2024-02-01');
  assert.ok((await page.locator('[data-list-row^="appointment-status-"]').innerText()).includes('Letter came'));
  await page.locator(`[data-list-row^="appointment-status-"]`).click();
  await page.waitForURL((url) => url.pathname === `/health/appointments/${waitId}`);
  await page.waitForSelector(`[data-appointment-screen="${waitId}"]`);
  await navigate('/health/appointments');
  await openScreen(waitRow);
  await fillDate(page, '#appointment-date', '2024-03-20');
  await page.locator('[data-save-appointment]').click();
  await page.waitForSelector('[data-appointment-screen][data-state="past"]');
  await back();
  await page.locator('[data-waiting]').waitFor({ state: 'detached' });
  await openScreen(page.locator(`[data-past] [data-appointment="${waitId}"]`));
  assert.equal(await dateValue(page.locator('#appointment-referred')), '2024-01-10', 'The referred-on day stays');
  assert.equal(await page.locator('[data-status-update]').count(), 1, 'and so do its updates');
  await back();
  console.log('PASS the referral and its update show in the day view on their dates, and it later takes a day as the same record');

  /* A time and a who: somebody made from
     inside the editor is attached to it, the time is kept, and the calendar
     hand-off uses it without asking. */
  await openScreen(row);
  await page.locator('[data-who-new]').click();
  await page.locator('#provider-name').fill('Dr Nowak');
  await page.locator('#provider-contact').fill('22 123 45 67');
  await page.locator('[data-competence="good"]').click();
  await page.locator('#provider-impressions').fill('Listened, no gatekeeping');
  await page.locator('[data-save-provider]').click();
  await page.locator('#provider-name').waitFor({ state: 'detached' });
  const who = page.locator('[data-who]').filter({ hasText: 'Dr Nowak' });
  assert.equal(await who.getAttribute('aria-pressed'), 'true', 'Someone made from the editor is picked in it');
  await fillTime(page, '#appointment-time', '14:30');
  await page.locator('[data-save-appointment]').click();
  await page.waitForFunction(() => document.querySelector('[data-appointment-screen] [data-section-heading]')?.textContent.includes('14:30'));
  await back();
  const rowText = await row.innerText();
  assert.ok(rowText.includes('14:30') && rowText.includes('Dr Nowak'), `The row states the time and who: ${rowText}`);
  await openScreen(row);
  assert.equal(await page.locator('#appointment-time').inputValue(), '14:30', 'The time is kept');
  await page.locator('[data-add-to-calendar]').click();
  await page.locator('#calendar-handoff-title').waitFor();
  assert.equal(await page.locator('#calendar-handoff-time').count(), 0, 'A stored time is not asked for again');
  assert.ok((await page.locator('[data-calendar-handoff-day]').innerText()).includes('14:30'), 'The hand-off states the time it will use');
  const [timed] = await Promise.all([page.waitForEvent('download'), page.locator('[data-share-to-calendar]').click()]);
  const timedIcs = await readFile(await timed.path(), 'utf8');
  assert.ok(timedIcs.includes('DTSTART:20240312T143000'), 'The calendar file carries the stored time');
  assert.ok(!timedIcs.includes('Nowak'), 'and nothing about who it is with');
  await page.locator('#calendar-handoff-title').waitFor({ state: 'detached' });
  await back();
  console.log('PASS a provider made in the editor is attached, the time is kept, and the hand-off uses it without asking');

  const providerRow = page.locator('[data-providers] [data-provider]').filter({ hasText: 'Dr Nowak' });
  assert.ok((await providerRow.innerText()).includes('Trans competence: good'), 'The provider row states the competence');
  await providerRow.click();
  assert.equal(await page.locator('#provider-impressions').inputValue(), 'Listened, no gatekeeping');
  await page.locator('#provider-name').fill('Dr Anna Nowak');
  await page.locator('[data-save-provider]').click();
  await page.waitForSelector('[data-sheet]', { state: 'detached' });
  await page.waitForFunction(() =>
    [...document.querySelectorAll('[data-past] [data-appointment]')].some((el) => el.textContent?.includes('Dr Anna Nowak')));
  await page.locator('[data-providers] [data-provider]').filter({ hasText: 'Dr Anna Nowak' }).click();
  await page.locator('[data-delete-provider]').click();
  await page.locator('[data-confirm-delete-provider]').click();
  await page.locator('[data-providers] [data-provider]').filter({ hasText: 'Nowak' }).waitFor({ state: 'detached' });
  await page.waitForSelector('[data-sheet]', { state: 'detached' });
  assert.ok(!(await row.innerText()).includes('Nowak'), 'Deleting the provider leaves the appointment with nobody named');
  assert.ok((await row.innerText()).includes('14:30'), 'and keeps the appointment itself');
  console.log('PASS a provider is edited from the list, renaming redraws its appointment, and deleting it leaves the appointment');

  const linked = await page.evaluate(async () => {
    const { journal } = await import('/src/lib/data/live/journal.svelte.ts');
    const procedureId = await journal.procedures.upsertProcedure({ name: 'Fixture journey' });
    return journal.appointments.upsertAppointment({ epochDay: 30000, procedureId, kind: 'Consultation', place: null, note: null });
  });
  const linkedRow = page.locator(`[data-appointment="${linked}"]`);
  await page.locator(`[data-visit-lead][data-appointment="${linked}"]`).waitFor();
  /* The opening is a <button>, and a button takes the browser's own face unless told
     otherwise. Its lines read in the body face; the gap alone keeps the display face. */
  const leadFaces = await page.locator('[data-visit-lead]').evaluate((lead) => {
    const face = (value) => {
      const probe = document.createElement('span');
      probe.style.fontFamily = value;
      document.body.append(probe);
      const family = getComputedStyle(probe).fontFamily;
      probe.remove();
      return family;
    };
    return {
      body: face('var(--font-body)'),
      display: face('var(--font-display)'),
      lines: [...lead.querySelector('.visit-lead-lines').children].filter((line) => !line.hasAttribute('data-visit-gap'))
        .map((line) => getComputedStyle(line).fontFamily),
      gap: getComputedStyle(lead.querySelector('[data-visit-gap]')).fontFamily
    };
  });
  assert.ok(leadFaces.lines.length >= 2, 'The opening has lines beside its gap');
  for (const line of leadFaces.lines) assert.equal(line, leadFaces.body, 'The opening reads in the body face');
  assert.equal(leadFaces.gap, leadFaces.display, 'The opening gap keeps the display face');
  console.log('PASS the opening reads in the body face and its gap in the display face');
  await openScreen(linkedRow);
  assert.equal(await page.locator('[data-add-prep]').count(), 1, 'An upcoming visit carries What to raise');
  await page.locator('#appointment-kind').fill('Consultation updated');
  await fillDate(page, '#appointment-date', '2024-03-13');
  await page.locator('[data-save-appointment]').click();
  await page.waitForSelector('[data-appointment-screen][data-state="past"]');
  await page.locator('[data-add-prep]').waitFor({ state: 'detached' });
  await back();
  const linkedPast = page.locator(`[data-past] [data-appointment="${linked}"]`);
  assert.ok((await linkedPast.innerText()).includes('Fixture journey'), 'Procedure link survives editing');
  await openScreen(linkedPast);
  assert.equal(await page.locator('#appointment-kind').inputValue(), 'Consultation updated');
  assert.equal(await dateValue(page.locator('#appointment-date')), '2024-03-13');
  await page.locator('[data-appointment-procedure]').click();
  await page.locator(`[data-consult="${linked}"]`).waitFor();
  await navigate('/health/appointments');
  await page.locator('[data-list-row="in-the-room"]').waitFor();
  await page.locator('[data-screen-back]').click();
  await page.waitForURL((url) => url.pathname.startsWith('/health/surgery/'));
  await navigate('/health/appointments');
  console.log('PASS procedure-linked appointment moves from future to past, stays on surgery journey, preserves prep and return context');

  for (const locale of ['en', 'pl']) {
    const copy = JSON.parse(await readFile(`messages/${locale}.json`, 'utf8'));
    await page.evaluate(async (locale) => {
      const { prefs } = await import('/src/lib/data/prefs/store.svelte.ts');
      const { setLocale } = await import('/src/lib/paraglide/runtime.js');
      prefs.language = locale;
      setLocale(locale, { reload: false });
    }, locale);
    await settlePage(page, server.resolvedUrls.local[0], 'health/appointments', 'light');
    await page.locator('[data-add]').click();
    await page.locator('#appointment-kind').waitFor();
    for (const key of ['appointments_kind_label', 'appointments_place_label', 'note_label', 'appointments_day_label']) {
      assert.equal(await page.getByRole('textbox', { name: copy[key], exact: true }).count(), 1, `${locale} ${key}`);
    }
    for (const zoom of [1, 2]) {
      await page.evaluate(async (zoom) => {
        document.documentElement.style.zoom = String(zoom);
        const { prefs } = await import('/src/lib/data/prefs/store.svelte.ts');
        prefs.disguise = zoom === 2;
      }, zoom);
      await fieldOrder();
      await capture(`${locale}-${zoom}x-disguise-${zoom === 2}`, zoom);
    }
    await page.evaluate(() => { document.documentElement.style.zoom = '1'; });
    if (gallery) {
      for (const palette of PALETTES) for (const theme of ['light', 'dark']) {
        await page.evaluate(async ({ palette, theme }) => {
          const { prefs } = await import('/src/lib/data/prefs/store.svelte.ts');
          prefs.palette = palette; prefs.theme = theme; prefs.disguise = false;
        }, { palette, theme });
        await capture(`${locale}-${palette}-${theme}`, 1);
      }
    }
    await close();
    console.log(`PASS ${locale} accessible labels, reading and keyboard order, 48px targets and readable day at 390px and 200% zoom`);
  }
  const polish = JSON.parse(await readFile('messages/pl.json', 'utf8'));
  await openScreen(linkedRow);
  await page.locator('[data-delete-appointment]').click();
  await page.locator('[data-confirm-delete-appointment]').waitFor();
  assert.ok((await page.getByRole('dialog', { name: polish.appointments_delete_sheet, exact: true }).innerText()).includes('2024'), 'Deletion identifies saved day');
  await page.getByRole('button', { name: polish.keep_it, exact: true }).click();
  await page.waitForSelector('[data-sheet]', { state: 'detached' });
  await page.locator('[data-delete-appointment]').click();
  await page.locator('[data-confirm-delete-appointment]').click();
  await page.waitForURL((url) => url.pathname === '/health/appointments');
  await linkedRow.waitFor({ state: 'detached' });
  await page.waitForSelector('[data-sheet]', { state: 'detached' });
  console.log('PASS deletion confirmation identifies appointment; cancellation keeps it; confirmation removes it');
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  await server.close();
}
