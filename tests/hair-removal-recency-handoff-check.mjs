/* The recency rows lead to their own area (pre-production UI/UX ticket 28).
   Real-browser half of the ticket's verification: the node tier reads the
   contract off the source (tests/hair-removal-recency-handoff.test.ts,
   ADR-0016); this one proves the three acceptance behaviours on the real
   screen - two areas with different histories open their own prefilled
   context, nothing saves until Save, and closing returns to the overview
   where it was. The custom-area fixture is rejected at the data seam: the
   closed vocabulary is the rule an imported key meets, so no custom row can
   ever join the overview.

   Run: node tests/hair-removal-recency-handoff-check.mjs
   (a throwaway dev server; screenshots land in
   .claude/hair-removal-recency-shots, gitignored). */

import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { createServer } from 'vite';
import { launchChromium, settlePage } from './browser-harness.mjs';
import { PALETTES } from './palettes.mjs';

const outDir = '.claude/hair-removal-recency-shots';
await mkdir(outDir, { recursive: true });

const server = await createServer({
  cacheDir: '.svelte-kit/hair-removal-recency-vite',
  server: { port: 0, fs: { allow: [process.cwd(), realpathSync('node_modules')] } }
});
await server.listen();

const browser = await launchChromium();
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  reducedMotion: 'reduce'
});
page.setDefaultTimeout(15000);

const errors = [];
page.on('pageerror', (err) => errors.push(err.message));

/* CONTEXT: epoch day is the device's local day, never a UTC one - so the
   fixture computes it here once and hands it to the page, rather than
   letting three evaluate blocks each derive (a possibly UTC) day. */
const today = Math.floor((Date.now() - new Date().getTimezoneOffset() * 60000) / 86400000);

const count = () => page.evaluate(async () => {
  const { journal } = await import('/src/lib/data/live/journal.svelte.ts');
  return (await journal.hairRemoval.getSessions()).length;
});

async function settleMotion() {
  await page.waitForFunction(() => !document.querySelector('.screen')?.getAnimations({ subtree: true })
    .some((animation) => animation.playState === 'running'));
}

try {
  await settlePage(page, server.resolvedUrls.local[0], 'body/hair-removal', 'light');
  const toggle = page.locator('[data-hair-removal-areas] [data-disclosure-toggle]');
  await toggle.waitFor();
  assert.equal(await count(), 0, 'the empty journal contains no sessions');
  assert.equal(await page.locator('[data-add]').isVisible(), true, 'the first-session control is visible');
  await toggle.click();
  await page.locator('[data-recency="upper_lip"]').click();
  assert.equal(await page.locator('#hair-removal-area').inputValue(), 'upper_lip', 'an empty journal can start with its chosen area');
  await page.locator('[data-close-record]').click();
  await page.locator('#hair-removal-area').waitFor({ state: 'detached' });
  assert.equal(await toggle.getAttribute('aria-expanded'), 'true', 'closing the editor retains the area disclosure');
  await toggle.click();
  await page.locator('#hair-removal-areas').waitFor({ state: 'detached' });
  await page.screenshot({ path: `${outDir}/00-empty-setup.png` });

  // Fixture: two areas with different histories, one never used.
  await page.evaluate(async (today) => {
    const { journal } = await import('/src/lib/data/live/journal.svelte.ts');
    await journal.hairRemoval.upsertSession({
      epochDay: today - 10, area: 'chin', method: 'laser', painRating: 2, cost: '', provider: 'Clinic A'
    });
    await journal.hairRemoval.upsertSession({
      epochDay: today - 30, area: 'legs', method: 'electrolysis', painRating: 4, cost: '', provider: ''
    });
  }, today);
  assert.equal(await count(), 2, 'fixture seeded two sessions');

  // Custom-area fixture: the closed vocabulary rejects it at the data seam,
  // so the overview can never grow a row the current build cannot name.
  const rejection = await page.evaluate(async (today) => {
    try {
      const { journal } = await import('/src/lib/data/live/journal.svelte.ts');
      await journal.hairRemoval.upsertSession({
        epochDay: today - 1, area: 'nape_custom', method: 'laser', painRating: 1, cost: '', provider: ''
      });
      return null;
    } catch (err) {
      return String(err?.message ?? err);
    }
  }, today);
  assert.match(rejection ?? '', /invalid hair-removal area/, 'a custom area key is rejected by the closed vocabulary');
  assert.equal(await count(), 2, 'the rejected custom area stored nothing');

  await page.evaluate(() => {
    const link = document.createElement('a');
    link.href = '/body/hair-removal';
    link.id = 'recency-test-link';
    link.textContent = 'Open';
    document.body.append(link);
  });
  await page.locator('#recency-test-link').click();
  await page.evaluate(() => document.querySelector('#recency-test-link')?.remove());
  await page.waitForURL((url) => url.pathname === '/body/hair-removal');
  await page.waitForSelector('[data-hair-removal-session]');
  assert.equal(await toggle.getAttribute('aria-expanded'), 'false', 'areas start collapsed');
  assert.equal(await toggle.getAttribute('aria-controls'), 'hair-removal-areas', 'the toggle names its area list');
  const recent = await page.locator('[data-hair-removal-session]').first().boundingBox();
  const controls = await toggle.boundingBox();
  assert.ok(recent.y < controls.y, 'the latest logged week precedes area controls');
  assert.ok(await page.locator('[data-hair-removal-session]').first().innerText().then((text) => text.includes('Chin')),
    'the latest session remains visible even outside the current week');
  await toggle.click();
  await page.waitForSelector('[data-recency="chin"]');
  assert.equal(await toggle.getAttribute('aria-expanded'), 'true', 'expanded state is announced');
  const openingWeek = await page.locator('[data-strip-week]').innerText();
  await page.locator('[data-strip-earlier]').click();
  await settleMotion();
  assert.notEqual(await page.locator('[data-strip-week]').innerText(), openingWeek, 'earlier history remains reachable');
  await page.locator('[data-strip-later]').click();
  await settleMotion();
  assert.equal(await page.locator('[data-strip-week]').innerText(), openingWeek, 'later history returns to the opening week');

  // The all-area overview is retained: one row per closed-vocabulary area,
  // and the untouched area still says nothing is logged.
  assert.equal(await page.locator('[data-recency]').count(), 10, 'all ten areas keep their recency row');
  assert.match(
    await page.locator('[data-recency="upper_lip"]').innerText(),
    /no sessions logged/i,
    'a never-used area keeps its no-sessions line'
  );

  // Area history, own context: the chin row opens the add-session form with
  // chin chosen, not chin's old session and not another area.
  await page.locator('[data-recency="chin"]').click();
  await page.waitForSelector('#hair-removal-area');
  assert.equal(await page.locator('#hair-removal-area').inputValue(), 'chin', 'the chin row prefills chin');
  await page.screenshot({ path: `${outDir}/01-chin-prefilled.png` });
  await page.locator('[data-close-record]').click();
  await page.waitForSelector('#hair-removal-area', { state: 'detached' });

  // Nothing saved by opening and dismissing.
  assert.equal(await count(), 2, 'opening a recency row stores nothing');

  // Same proof on the second history, in the same overview position - and
  // the close through Escape, the key that shares the overlay owner native
  // Back consults (overlayLock.ts), landing back on the overview where it
  // was. (Whether the Android Back key reaches that owner is the Android
  // tier's evidence, not a browser's.)
  const scroll = page.locator('[data-app-scroll-region]');
  const legs = page.locator('[data-recency="legs"]');
  await legs.scrollIntoViewIfNeeded();
  const before = await scroll.evaluate((el) => el.scrollTop);
  assert.ok(before > 0, 'the area handoff starts from a scrolled screen');
  await legs.click();
  await page.waitForSelector('#hair-removal-area');
  assert.equal(await page.locator('#hair-removal-area').inputValue(), 'legs', 'the legs row prefills legs');
  await page.keyboard.press('Escape');
  await page.waitForSelector('#hair-removal-area', { state: 'detached' });
  assert.equal(await scroll.evaluate((el) => el.scrollTop), before, 'closing returns to the overview where it was');
  assert.equal(await legs.evaluate((el) => el === document.activeElement), true, 'closing restores the area opener focus');

  // Prefilled session: the save lands only when the person confirms it.
  await page.locator('[data-recency="chin"]').click();
  await page.waitForSelector('#hair-removal-area');
  await page.locator('#hair-removal-provider').fill('Clinic B');
  await page.screenshot({ path: `${outDir}/02-chin-before-save.png` });
  await page.locator('[data-save-hair-removal-session]').click();
  await page.waitForSelector('#hair-removal-area', { state: 'detached' });
  assert.equal(await count(), 3, 'the session saved once the person confirmed it');

  await page.screenshot({ path: `${outDir}/03-overview-after-save.png` });

  for (const locale of ['en', 'pl']) {
    const copy = JSON.parse(await readFile(`messages/${locale}.json`, 'utf8'));
    await page.evaluate(async (locale) => {
      const { prefs } = await import('/src/lib/data/prefs/store.svelte.ts');
      const { setLocale } = await import('/src/lib/paraglide/runtime.js');
      prefs.language = locale;
      setLocale(locale, { reload: false });
    }, locale);
    await settlePage(page, server.resolvedUrls.local[0], 'body/hair-removal', 'light');
    assert.equal(await toggle.innerText(), copy.hair_removal_areas_title, 'the disclosure uses the locale catalogue');
    for (const motion of ['reduce', 'no-preference']) for (const zoom of [1, 2]) {
      await page.emulateMedia({ reducedMotion: motion });
      await page.evaluate((zoom) => { document.documentElement.style.zoom = String(zoom); }, zoom);
      if (await toggle.getAttribute('aria-expanded') === 'false') await toggle.click();
      await page.locator('[data-recency="chin"]').waitFor();
      await settleMotion();
      await page.locator('[data-recency="bikini_line"] [data-row-title]').evaluate((el) => {
        el.textContent = 'Bardzo długa nazwa obszaru depilacji bezskróconejnazwyobszaru';
      });
      assert.equal(await scroll.evaluate((el) => el.scrollWidth <= el.clientWidth), true, `${locale}/${motion}/${zoom}: no horizontal overflow`);
      assert.ok(await toggle.evaluate((el) => parseFloat(getComputedStyle(el).minHeight)) >= 48, 'the disclosure keeps its 48px touch target');
      await page.locator('[data-recency="bikini_line"]').screenshot({ path: `${outDir}/${locale}-${motion}-${zoom}x-long.png` });
      await scroll.evaluate((el) => { el.scrollTop = 0; });
      const week = await page.locator('[data-strip-week]').innerText();
      await settleMotion();
      await toggle.focus();
      const beforeToggle = await scroll.evaluate((el) => el.scrollTop);
      await page.keyboard.press('Enter');
      await page.locator('#hair-removal-areas').waitFor({ state: 'detached' });
      assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
      assert.equal(await toggle.evaluate((el) => el === document.activeElement), true, 'collapse retains toggle focus');
      await page.keyboard.press('Enter');
      await page.locator('[data-recency="chin"]').waitFor();
      await settleMotion();
      assert.equal(await page.locator('[data-strip-week]').innerText(), week, 'collapse and reopen retain the selected week');
      assert.equal(await scroll.evaluate((el) => el.scrollTop), beforeToggle, 'collapse and reopen retain the screen position');
      await page.screenshot({ path: `${outDir}/${locale}-${motion}-${zoom}x.png` });
    }
    await page.evaluate(() => { document.documentElement.style.zoom = '1'; });
    for (const palette of PALETTES) for (const theme of ['light', 'dark']) {
      await page.evaluate(async ({ palette, theme }) => {
        const { prefs } = await import('/src/lib/data/prefs/store.svelte.ts');
        prefs.palette = palette; prefs.theme = theme; prefs.disguise = false;
      }, { palette, theme });
      await scroll.evaluate((el) => { el.scrollTop = 0; });
      await page.screenshot({ path: `${outDir}/${locale}-${palette}-${theme}.png` });
    }
  }
  assert.equal(await count(), 3, 'disclosure and layout checks leave session data unchanged');
  assert.equal(errors.length, 0, `Page errors encountered: ${errors.join(', ')}`);
  console.log('PASS hair-removal recency area handoff real-browser check');
} finally {
  await browser.close();
  await server.close();
}
