import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { createServer } from 'vite';
import { fillDate, launchChromium, settlePage } from './browser-harness.mjs';
import { PALETTES } from './palettes.mjs';

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
async function discard() {
  await page.locator('[data-close-record]').click();
  await page.locator('[data-discard-record]').click();
  await page.waitForSelector('[data-sheet]', { state: 'detached' });
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
  })) assert.equal(await page.locator(`#${id}`).inputValue(), value, id);
}

async function fieldOrder() {
  const controls = [page.locator('#appointment-kind'), ...await page.locator('[data-kind]').all(),
    ...['appointment-place', 'appointment-note', 'appointment-date'].map((id) => page.locator(`#${id}`))];
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
      'Kind, its suggestions, place and note precede day in reading order');
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
    for (const appointment of await journal.appointments.getAppointments()) await journal.appointments.deleteAppointment(appointment.id);
  });
  await page.locator('[data-appointment]').waitFor({ state: 'detached' });
  await page.locator('[data-add]').click();
  await page.locator('#appointment-kind').waitFor();
  await fieldOrder();
  assert.equal(await page.locator('[data-kind]').count(), 0, 'No suggestions before naming a kind');
  const today = await page.evaluate(() => new Date().toLocaleDateString('sv-SE'));
  assert.equal(await page.locator('#appointment-date').inputValue(), today);
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
  await row.click();
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
  assert.equal(await page.locator('#appointment-date').inputValue(), '2024-03-14', 'Handoff retains draft');
  await page.locator('#appointment-note').fill('Unsaved questions');
  await page.keyboard.press('Escape');
  await page.locator('[data-keep-editing]').click();
  await page.locator('[data-keep-editing]').waitFor({ state: 'detached' });
  assert.equal(await page.locator('#appointment-note').inputValue(), 'Unsaved questions');
  assert.equal(await page.locator('[data-sheet]').evaluate((el) => el.contains(document.activeElement)), true);
  await discard();
  await row.click();
  await valuesMatch();
  await close();
  assert.equal(await row.evaluate((el) => el.contains(document.activeElement)), true, 'Dismissal restores opener focus');
  console.log('PASS create/reopen retains all fields; suggestions fill kind; discard preserves saved record and restores focus');

  const linked = await page.evaluate(async () => {
    const { journal } = await import('/src/lib/data/live/journal.svelte.ts');
    const procedureId = await journal.procedures.upsertProcedure({ name: 'Fixture journey' });
    return journal.appointments.upsertAppointment({ epochDay: 30000, procedureId, kind: 'Consultation', place: null, note: null });
  });
  const linkedRow = page.locator(`[data-appointment="${linked}"]`);
  await page.locator(`[data-visit-lead][data-appointment="${linked}"]`).waitFor();
  await linkedRow.click();
  await page.locator('#appointment-kind').fill('Consultation updated');
  await fillDate(page, '#appointment-date', '2024-03-13');
  await page.locator('[data-save-appointment]').click();
  await page.waitForSelector('[data-sheet]', { state: 'detached' });
  const linkedPast = page.locator(`[data-past] [data-appointment="${linked}"]`);
  assert.ok((await linkedPast.innerText()).includes('Fixture journey'), 'Procedure link survives editing');
  await linkedPast.click();
  assert.equal(await page.locator('#appointment-kind').inputValue(), 'Consultation updated');
  assert.equal(await page.locator('#appointment-date').inputValue(), '2024-03-13');
  await close();
  await navigate('/health/surgery');
  await page.getByRole('button', { name: /Fixture journey/ }).first().click();
  await page.locator(`[data-consult="${linked}"]`).waitFor();
  await navigate('/health/appointments');
  await page.locator('[data-list-row="in-the-room"]').waitFor();
  await page.locator('[data-screen-back]').click();
  await page.waitForURL('**/health/surgery');
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
    await row.click();
    for (const key of ['appointments_kind_label', 'appointments_place_label', 'appointments_note_label', 'appointments_day_label']) {
      assert.equal(await page.getByRole('textbox', { name: copy[key], exact: true }).count(), 1);
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
  await linkedRow.click();
  await page.locator('[data-delete-appointment]').click();
  await page.locator('[data-confirm-delete-appointment]').waitFor();
  assert.ok((await page.getByRole('dialog', { name: polish.appointments_delete_sheet, exact: true }).innerText()).includes('2024'), 'Deletion identifies saved day');
  await page.getByRole('button', { name: polish.keep_it, exact: true }).click();
  await page.waitForSelector('[data-sheet]', { state: 'detached' });
  await linkedRow.click();
  await page.locator('[data-delete-appointment]').click();
  await page.locator('[data-confirm-delete-appointment]').click();
  await linkedRow.waitFor({ state: 'detached' });
  await page.waitForSelector('[data-sheet]', { state: 'detached' });
  console.log('PASS deletion confirmation identifies appointment; cancellation keeps it; confirmation removes it');
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  await server.close();
}
