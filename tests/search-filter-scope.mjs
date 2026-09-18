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
page.on('pageerror', error => errors.push(error.message));
async function visit(path) {
  await page.goto(`${server.resolvedUrls.local[0]}${path.slice(1)}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]');
  await page.evaluate(async () => {
    document.querySelector('.demo-bar')?.style.setProperty('display', 'none');
    const { toasts } = await import('/src/lib/stores/toasts.svelte.ts');
    toasts.splice(0);
  });
}
async function counts(entries, other) {
  await page.waitForFunction(([entries, other]) =>
    document.querySelector('[data-search-entry-count]')?.textContent.includes(String(entries)) &&
    document.querySelector('[data-search-other-count]')?.textContent.includes(String(other)), [entries, other]);
}
try {
  await visit('/');
  if (await page.locator('[data-leave-setup]').count()) await page.locator('[data-leave-setup]').click();
  await page.evaluate(async () => {
    const { journal } = await import('/src/lib/data/live/journal.svelte.ts');
    const { clearJournal } = await import('/src/lib/data/demo/journal-seed.ts');
    await clearJournal(journal);
    await journal.entries.upsertEntry({ epochDay: 20000, mood: 3, note: 'scopeprobe appointment' });
    await journal.documents.addDocument({ epochDay: 20000, title: 'scopeprobe document' }, { pdfBytes: new TextEncoder().encode('%PDF-1.4\n%%EOF') });
  });
  for (const locale of ['en', 'pl']) {
    await page.evaluate(async locale => {
      const { setLocale } = await import('/src/lib/paraglide/runtime.js');
      setLocale(locale, { reload: false });
    }, locale);
    await visit('/search');
    await page.locator('#q').fill('scopeprobe');
    await counts(1, 1);
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
    await page.locator('[data-filter-mood="1"]').click();
    await page.keyboard.press('Escape');
    await counts(0, 1);
    assert.match(await toggle.innerText(), /1/);
    await page.locator('[data-search-scope]').waitFor({ state: 'visible' });
    assert.equal(await page.locator('[data-search-hit="documents"]').count(), 1);
    await page.locator('[data-search-save]').click();
    const title = locale === 'en' ? 'My long personal question about appointments and the papers I want to find again' : 'Moje długie osobiste pytanie o wizyty i dokumenty, do których chcę jeszcze wrócić';
    await page.locator('#saved-question-name').fill(title);
    await page.locator('[data-saved-question-save-confirm]').click();
    await page.locator('[data-saved-question-save-confirm]').waitFor({ state: 'hidden' });
    await page.locator('[data-filter-clear]').click();
    await counts(1, 1);
    await page.locator('#q').fill('');
    await page.locator('[data-search-idle]').waitFor();
    await page.getByRole('link', { name: title, exact: true }).click();
    await counts(0, 1);
    const summary = page.locator('[data-saved-question-criteria]');
    await summary.focus();
    await page.keyboard.press('Enter');
    await page.locator('[data-saved-question-definition]').waitFor({ state: 'visible' });
    assert.match(await page.locator('[data-saved-question-definition]').innerText(), /scopeprobe/);
    await page.locator('[data-search-scope]').waitFor({ state: 'visible' });
    for (const width of [320, 390, 430, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      assert.ok((await summary.boundingBox()).height >= 48);
    }
    const storedLabels = await page.evaluate(async title => {
      const { journal } = await import('/src/lib/data/live/journal.svelte.ts');
      const { m } = await import('/src/lib/paraglide/messages.js');
      const { dateInputValueFromEpochDay } = await import('/src/lib/data/epochDay.ts');
      const { moodName } = await import('/src/lib/data/vocabulary/labels.ts');
      const { vocabulary } = await import('/src/lib/data/vocabulary/vocabulary.ts');
      const question = (await journal.savedQuestions.getSavedQuestions()).find(q => q.name === title);
      const tag = vocabulary.tags[0];
      await journal.savedQuestions.upsertSavedQuestion({ ...question, tagIds: [tag.id], moods: [2], startEpochDay: 19999, endEpochDay: 20001, hasNote: true, hasPhoto: true });
      return [m.saved_question_tag({ tag: tag.label }), m.search_filter_mood_chip({ mood: moodName(2) }),
        m.search_filter_start_chip({ date: dateInputValueFromEpochDay(19999) }),
        m.search_filter_end_chip({ date: dateInputValueFromEpochDay(20001) }), m.search_filter_has_note(), m.search_filter_has_photo()];
    }, title);
    for (const label of storedLabels) await page.locator('[data-saved-question-definition]').getByText(label, { exact: true }).waitFor();
    await counts(0, 1);
    if (process.argv.includes('--gallery')) {
      await mkdir('.claude/u23-shots', { recursive: true });
      await page.setViewportSize({ width: 390, height: 844 });
      for (const palette of PALETTES) for (const theme of ['light', 'dark']) {
        await page.evaluate(async ({ palette, theme }) => {
          const { prefs } = await import('/src/lib/data/prefs/store.svelte.ts');
          prefs.palette = palette;
          prefs.theme = theme;
        }, { palette, theme });
        await page.locator('[data-saved-question-criteria]').scrollIntoViewIfNeeded();
        await page.screenshot({ path: `.claude/u23-shots/${locale}-${palette}-${theme}.png` });
      }
    }
    await page.evaluate(async () => {
      const { prefs } = await import('/src/lib/data/prefs/store.svelte.ts');
      prefs.disguise = true;
    });
    await summary.waitFor({ state: 'visible' });
    if (process.argv.includes('--gallery')) await page.screenshot({ path: `.claude/u23-shots/${locale}-disguise.png` });
    await page.evaluate(async () => {
      const { prefs } = await import('/src/lib/data/prefs/store.svelte.ts');
      prefs.disguise = false;
    });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 });
    assert.equal(await page.evaluate(() => visualViewport.scale), 2);
    await summary.focus();
    await page.keyboard.press('Enter');
    assert.equal(await summary.getAttribute('aria-expanded'), 'false');
    await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });
    await cdp.detach();
    await visit('/search');
    await page.locator('#q').fill('nothingmatchesu23');
    await page.locator('[data-notice="search-none"]').waitFor();
    await page.locator('#q').fill('');
    await page.locator('[data-search-idle]').waitFor();
  }
  assert.deepEqual(errors, []);
  console.log('PASS: mixed-area filtering, clear, save/reopen criteria, empty states, EN/PL and narrow layouts');
} catch (error) {
  console.error('FAILED AT', page.url(), (await page.locator('body').innerText()).slice(0, 2500));
  throw error;
} finally {
  await browser.close();
  await server.close();
}
