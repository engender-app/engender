import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import { PALETTES } from './palettes.mjs';
import { launchChromium } from './browser-harness.mjs';

const server = await createServer({ server: { port: 0, fs: { allow: [process.cwd(), realpathSync('node_modules')] } } });
await server.listen();
const browser = await launchChromium();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
page.setDefaultTimeout(10000);
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
async function visit(path) {
  await page.goto(`${server.resolvedUrls.local[0]}${path.slice(1)}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]');
}
try {
  await visit('/');
  if (await page.locator('[data-leave-setup]').count()) await page.locator('[data-leave-setup]').click();
  await page.evaluate(async () => {
    const { journal } = await import('/src/lib/data/live/journal.svelte.ts');
    const { clearJournal } = await import('/src/lib/data/demo/journal-seed.ts');
    await clearJournal(journal);
  });
  await mkdir('.claude/ui14-shots', { recursive: true });
  async function capture(name) {
    if (!process.argv.includes('--gallery')) return;
    await page.evaluate(async () => {
      const { toasts } = await import('/src/lib/stores/toasts.svelte.ts');
      toasts.splice(0);
      document.querySelector('.demo-bar')?.style.setProperty('display', 'none');
      document.querySelectorAll('*').forEach((element) => { element.scrollTop = 0; });
    });
    await page.screenshot({ path: `.claude/ui14-shots/${name}.png` });
  }
  for (const locale of ['en', 'pl']) {
    await page.evaluate(async (locale) => {
      const { setLocale } = await import('/src/lib/paraglide/runtime.js');
      setLocale(locale, { reload: false });
      const { journal } = await import('/src/lib/data/live/journal.svelte.ts');
      const { clearJournal } = await import('/src/lib/data/demo/journal-seed.ts');
      await clearJournal(journal);
    }, locale);
    const browseName = locale === 'en' ? 'Browse entries' : 'Przeglądaj wpisy';
    const comfortName = locale === 'en' ? 'Things that help' : 'Co pomaga';
    await visit('/stats');
    const entryAction = page.locator('[data-notice="lookback-empty"] [data-notice-action]');
    await entryAction.waitFor();
    await capture(`${locale}-empty-stats`);
    await entryAction.click();
    await page.locator('[data-fan]').waitFor();
    await page.keyboard.press('Escape');
    await visit('/doubt/evidence');
    const browse = page.getByRole('link', { name: browseName, exact: true });
    await browse.waitFor();
    await capture(`${locale}-empty-evidence`);
    await browse.click();
    await page.waitForURL('**/calendar');
    await visit('/doubt/evidence');
    await page.getByRole('link', { name: comfortName, exact: true }).click();
    await page.waitForURL('**/doubt/comfort');
    await page.setViewportSize({ width: 320, height: 568 });
    await visit('/doubt');
    /* The dev server's demo bar wraps to 407px at 320px wide and sits above
       the app, so the fold is measured without it - the bar is not part of
       the screen a person on a short phone gets. */
    await page.evaluate(() => document.querySelector('.demo-bar')?.style.setProperty('display', 'none'));
    const comfort = page.getByRole('link', { name: comfortName, exact: true });
    await capture(`${locale}-support-short`);
    await page.waitForFunction(() => {
      const el = document.querySelector('.screen-safe-space > a');
      return el && el.getBoundingClientRect().height >= 48;
    });
    const box = await comfort.boundingBox();
    assert.ok(box.height >= 48 && box.y + box.height < 568 - 80);
    assert.equal(await page.locator('[data-breathing-phase]').count(), 0);
    await comfort.focus();
    await page.keyboard.press('Enter');
    await page.waitForURL('**/doubt/comfort');
    await page.setViewportSize({ width: 390, height: 844 });
    const entry = await page.evaluate(async () => {
      const { journal } = await import('/src/lib/data/live/journal.svelte.ts');
      const { todayEpochDay } = await import('/src/lib/data/epochDay.ts');
      await journal.comfortItems.addItem('My quiet playlist');
      return journal.entries.upsertEntry({ epochDay: todayEpochDay(), mood: 2, note: 'A difficult afternoon' });
    });
    await visit('/stats');
    await page.locator('[data-lookback-thin]').waitFor();
    await capture(`${locale}-sparse-stats`);
    for (const width of [430, 1280, 195]) {
      await page.setViewportSize({ width, height: 844 });
      await capture(`${locale}-sparse-stats-${width}`);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('.screen .btn').filter({ hasText: locale === 'en' ? 'New entry' : 'Nowy wpis' }).click();
    await page.locator('[data-fan]').waitFor();
    await page.keyboard.press('Escape');
    await visit('/doubt/evidence');
    await browse.waitFor();
    assert.equal(await page.locator('[data-entry-card]').count(), 0);
    await capture(`${locale}-no-starred-evidence`);
    await browse.click();
    await page.waitForURL('**/calendar');
    await page.evaluate(async (id) => {
      const { journal } = await import('/src/lib/data/live/journal.svelte.ts');
      const { todayEpochDay } = await import('/src/lib/data/epochDay.ts');
      await journal.entries.setEntryStarred(id, true);
      await journal.entries.upsertEntry({ epochDay: todayEpochDay() - 1, mood: 4, tags: ['g-body-eu'], note: 'My tagged moment' });
    }, entry);
    await visit('/doubt/evidence');
    await page.getByText('A difficult afternoon', { exact: true }).waitFor();
    await page.getByText('My tagged moment', { exact: true }).waitFor();
    assert.equal(await page.locator('[data-entry-card]').count(), 2);
    await capture(`${locale}-populated-evidence`);
    await visit('/doubt/comfort');
    await page.getByText('My quiet playlist', { exact: true }).waitFor();
    await capture(`${locale}-populated-comfort`);
    await visit('/doubt');
    await page.locator('[data-breathing-toggle]').click();
    await page.locator('[data-breathing-phase]').waitFor();
    await page.locator('[data-breathing-toggle]').click();
    if (process.argv.includes('--gallery')) {
      for (const palette of PALETTES) for (const theme of ['light', 'dark']) {
        await page.evaluate(async ({ palette, theme }) => {
          const { prefs } = await import('/src/lib/data/prefs/store.svelte.ts');
          prefs.palette = palette; prefs.theme = theme;
        }, { palette, theme });
        await capture(`${locale}-support-${palette}-${theme}`);
      }
      await page.evaluate(async () => {
        const { prefs } = await import('/src/lib/data/prefs/store.svelte.ts');
        prefs.disguise = true;
      });
      await capture(`${locale}-support-disguise`);
      await page.evaluate(async () => {
        const { prefs } = await import('/src/lib/data/prefs/store.svelte.ts');
        prefs.disguise = false;
      });
    }
    console.log(`PASS ${locale}: empty, sparse, no-starred and populated support; navigation and optional breathing`);
  }
  assert.deepEqual(errors, []);

} finally {
  await browser.close();
  await server.close();
}
