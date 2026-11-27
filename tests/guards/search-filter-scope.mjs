import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import { launchChromium } from '../browser-harness.mjs';

const server = await createServer({ server: { port: 0, fs: { allow: [process.cwd(), realpathSync('node_modules')] } } });
await server.listen();
const browser = await launchChromium();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
page.setDefaultTimeout(30000);
const errors = [];
page.on('pageerror', error => errors.push(error.message));
async function visit(path) {
  await page.goto(`${server.resolvedUrls.local[0]}${path.slice(1)}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]', { timeout: 60000 });
  await page.evaluate(async () => {
    document.querySelector('.demo-bar')?.style.setProperty('display', 'none');
    const { toasts } = await import('/src/lib/stores/toasts.svelte.ts');
    toasts.splice(0);
  });
}
/* What the screen found, read off the rows it drew rather than off a count
   per section: ticket 16 left one count line, the total. So the rows are counted here and the
   one line is checked to state their sum in `results_count`'s own wording. */
async function counts(entries, other, photos = 0) {
  await page.waitForFunction(([entries, other, photos]) =>
    document.querySelectorAll('[data-entry-card]').length === entries &&
    document.querySelectorAll('[data-search-hit]').length === other &&
    document.querySelectorAll('[data-starred-photos] .starred-photo-cell').length === photos, [entries, other, photos]);
  const lines = await page.locator('[data-search-count]').allInnerTexts();
  const expected = await page.evaluate(async (count) => {
    const { m } = await import('/src/lib/paraglide/messages.js');
    return m.results_count({ count });
  }, entries + other + photos);
  assert.deepEqual(lines.map((line) => line.trim()), [expected], 'one count line, in one format');
  /* And no second count anywhere on the screen: the audit found "Entries:
     27" on Search. The
     screen-reader status line says the same count and is not seen. */
  const visible = await page.evaluate(() => {
    const screen = document.querySelector('[data-screen]');
    const status = screen.querySelector('[data-search-status]')?.innerText ?? '';
    return screen.innerText.replace(status, '');
  });
  const said = visible.match(/\b\d+ (results?|wynik\w*)/g) ?? [];
  assert.equal(said.length, 1, `counts on screen: ${JSON.stringify(said)}`);
}
/* Each sentence about what a filter covers is said once, in the Filters
   sheet, and nowhere on the screen behind it (ticket 16, audit U7). */
async function scopeSaidOnce(where) {
  const sentences = await page.evaluate(async () => {
    const { m } = await import('/src/lib/paraglide/messages.js');
    return [m.search_filters_entries_only()];
  });
  const text = await page.locator('body').innerText();
  for (const sentence of sentences) {
    const said = text.split(sentence).length - 1;
    assert.equal(said, where === 'sheet' ? 1 : 0, `"${sentence}" said ${said} times ${where === 'sheet' ? 'with the sheet open' : 'on the screen'}`);
  }
}
try {
  await visit('/');
  if (await page.locator('[data-leave-setup]').count()) await page.locator('[data-leave-setup]').click();
  const modeId = await page.evaluate(async () => {
    const { journal } = await import('/src/lib/data/live/journal.svelte.ts');
    const { clearJournal } = await import('/src/lib/data/demo/journal-seed.ts');
    await clearJournal(journal);
    await journal.entries.upsertEntry({ epochDay: 20000, mood: 3, note: 'scopeprobe appointment' });
    await journal.documents.addDocument({ epochDay: 20000, title: 'scopeprobe document' }, { pdfBytes: new TextEncoder().encode('%PDF-1.4\n%%EOF') });
    /* One starred photo, on an entry nothing below searches for, so only a
       Starred question brings it. */
    const canvas = Object.assign(document.createElement('canvas'), { width: 8, height: 8 });
    const jpeg = async () => new Uint8Array(await (await new Promise((done) => canvas.toBlob(done, 'image/jpeg'))).arrayBuffer());
    const owner = await journal.entries.upsertEntry({ epochDay: 19000, mood: 4 });
    const photo = await journal.photos.attach({ entryId: owner }, { full: await jpeg(), thumb: await jpeg() });
    await journal.photos.setStarred(photo, true);
    /* Two entries apart on every transition field (functional audit 10),
       under a word nothing else carries. */
    const mode = await journal.presentations.addPresentation('Probe mode', 0);
    await journal.entries.upsertEntry({ epochDay: 20001, mood: 4, note: 'filterprobe walk', presentationId: mode.id, bodyRegions: { chest: 70 }, dims: { femininity: 80 } });
    await journal.entries.upsertEntry({ epochDay: 20002, mood: 3, note: 'filterprobe rest', bodyRegions: { hips_waist: 30 }, dims: { femininity: 20 } });
    return mode.id;
  });
  for (const locale of ['en', 'pl']) {
    /* SQLite owns the language now and boot applies it over whatever the
       locale strategy holds, so the preference is what gets set. */
    await page.evaluate(async locale => {
      const { setLocale } = await import('/src/lib/paraglide/runtime.js');
      const { prefs, flushPreferences } = await import('/src/lib/data/prefs/store.svelte.ts');
      prefs.language = locale;
      await flushPreferences();
      setLocale(locale, { reload: false });
    }, locale);
    await visit('/search');
    await page.locator('#q').fill('scopeprobe');
    await counts(1, 1);
    await scopeSaidOnce('screen');
    /* Results come straight under the field: the first entry row starts
       inside the first third of a 390x844 phone, measured from the app's
       own top. */
    const firstTop = await page.evaluate(() =>
      document.querySelector('[data-entry-card]').getBoundingClientRect().top -
      document.querySelector('[data-app-root]').getBoundingClientRect().top);
    assert.ok(firstTop <= 844 / 3, `first result at ${Math.round(firstTop)}px, below the first third`);
    assert.equal(await page.evaluate(() => Object.values(localStorage).some(value => value.includes('scopeprobe'))), false);
    if (process.argv.includes('--gallery')) {
      await mkdir('.claude/u23-shots', { recursive: true });
      for (const width of [320, 390, 430, 1280]) {
        await page.setViewportSize({ width, height: 844 });
        await page.screenshot({ path: `.claude/u23-shots/${locale}-search-${width}.png` });
      }
      await page.setViewportSize({ width: 390, height: 844 });
    }
    const toggle = page.locator('[data-filter-toggle]');
    assert.match(await toggle.innerText(), locale === 'en' ? /Filters/ : /Filtry/);
    await toggle.click();
    await page.locator('[data-search-scope]').waitFor({ state: 'visible' });
    await scopeSaidOnce('sheet');
    await page.locator('[data-filter-mood="1"]').click();
    await page.keyboard.press('Escape');
    await page.waitForSelector('[data-sheet]', { state: 'detached' });
    await counts(0, 1);
    assert.match(await toggle.innerText(), /1/);
    assert.equal(await page.locator('[data-search-hit="documents"]').count(), 1);
    /* Saved questions and the random draw are cut (functional audit 10):
       the header offers neither. */
    assert.equal(await page.locator('[data-search-save], [data-search-random]').count(), 0, 'a save or random action is still offered');
    await page.locator('[data-filter-clear]').click();
    await counts(1, 1);
    /* Mode, body region and a scale's range each narrow the entries, alone
       and with the typed word, and stay on across a trip into an entry
       and back (functional audit 10). */
    const filterSheet = async (body) => {
      await toggle.click();
      await page.locator('[data-search-scope]').waitFor({ state: 'visible' });
      await body();
      await page.keyboard.press('Escape');
      await page.waitForSelector('[data-sheet]', { state: 'detached' });
    };
    await page.locator('#q').fill('filterprobe');
    await counts(2, 0);
    await filterSheet(() => page.locator(`[data-filter-mode="${modeId}"]`).click());
    await counts(1, 0);
    await page.locator('[data-filter-clear]').click();
    await counts(2, 0);
    await filterSheet(() => page.locator('[data-filter-region="hips_waist"]').click());
    await counts(1, 0);
    assert.match(await page.locator('[data-entry-card]').innerText(), /filterprobe rest/);
    await page.locator('[data-filter-clear]').click();
    await counts(2, 0);
    await filterSheet(async () => {
      await page.locator('[data-filter-scale="femininity"]').click();
      await page.locator('[data-filter-range]').waitFor({ state: 'visible' });
      // From 0 to 50 on a step-of-5 scale: the 80 stays, the 20 goes.
      const from = page.locator('[data-filter-range] [role="slider"]').first();
      await from.focus();
      for (let step = 0; step < 10; step++) await page.keyboard.press('ArrowRight');
    });
    await counts(1, 0);
    assert.match(await page.locator('[data-entry-card]').innerText(), /filterprobe walk/);
    await filterSheet(() => page.locator(`[data-filter-mode="${modeId}"]`).click());
    await counts(1, 0);
    await page.locator('[data-entry-card]').first().click();
    await page.waitForURL((url) => url.pathname.startsWith('/entry/'));
    await page.locator('[data-screen-back]').first().click();
    await page.waitForURL((url) => url.pathname === '/search');
    await counts(1, 0);
    assert.equal(await page.locator('#q').inputValue(), 'filterprobe');
    assert.equal(await page.locator('[data-active-filter-chip]').count(), 2, 'mode and scale chips survive the trip');
    await page.locator('[data-filter-clear]').click();
    await page.locator('#q').fill('scopeprobe');
    await counts(1, 1);
    /* Starred answers with the starred photo too, and counts it in the one
       total (the ticket 16 follow-up). Unstarring takes the photo off the
       screen and out of the count; starred again after, for the next
       locale's pass. */
    await visit('/search?q=scopeprobe&starred=1');
    await counts(0, 1, 1);
    await page.locator('[data-starred-photos] .starred-photo-unstar').click();
    await counts(0, 1, 0);
    await page.evaluate(async () => {
      const { journal } = await import('/src/lib/data/live/journal.svelte.ts');
      for (const photo of await journal.photos.inJournal()) await journal.photos.setStarred(photo.id, true);
    });
    await counts(0, 1, 1);
    await visit('/search');
    await page.locator('#q').fill('nothingmatchesu23');
    await page.locator('[data-notice="search-none"]').waitFor();
    await page.locator('#q').fill('');
    await page.locator('[data-search-idle]').waitFor();
  }
  /* The saved-question run's address shows the unknown-address screen. */
  await visit('/search/questions/abc');
  await page.locator('[data-error-screen="not-found"]').waitFor();
  assert.deepEqual(errors, []);
  console.log('PASS: mixed-area filtering, scope said once, results first, one count format, mode/body-region/scale filters alone and with text and across an entry trip, Starred photos counted, no saved questions or random draw, EN/PL');
} catch (error) {
  console.error('FAILED AT', page.url(), (await page.locator('body').innerText()).slice(0, 2500));
  throw error;
} finally {
  await browser.close();
  await server.close();
}
