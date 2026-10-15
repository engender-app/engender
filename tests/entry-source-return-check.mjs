/* Entry Save/Delete returns through the real router. Run with node. */
import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { createServer } from 'vite';
import { launchChromium, untilSplashLets } from './browser-harness.mjs';
import { clientRoute } from './browser-tier/built-flow.mjs';

const server = await createServer({
  server: { port: 0, fs: { allow: [process.cwd(), realpathSync('node_modules')] } },
  plugins: [{ name: 'source-return-no-watch', configResolved(config) { config.server.watch = null; } }]
});
await server.listen();
const browser = await launchChromium();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: 'en-GB' });
page.setDefaultTimeout(30000);
page.on('pageerror', error => console.error('PAGE ERROR', error.message));
async function settled() { await page.waitForFunction(() => !document.documentElement.dataset.nav); }
async function go(href) { await clientRoute(page, href); await settled(); }
async function finish(action) {
  if (action === 'Delete') {
    await page.getByRole('button', { name: 'Delete entry', exact: true }).click();
    await page.locator('[data-sheet]').getByRole('button', { name: 'Delete entry', exact: true }).click();
  } else {
  await page.locator('#ed-note').fill('Source return fixture edited');
  await page.locator('[data-save]').click();
  }
  await page.locator('#ed-note').waitFor({ state: 'detached' });
  await settled();
}
try {
  await page.goto(server.resolvedUrls.local[0]);
  await page.waitForSelector('[data-app-root][data-boot="ready"]', { timeout: 90000 });
  await untilSplashLets(page);
  if (await page.locator('[data-leave-setup]').count()) await page.locator('[data-leave-setup]').click();
  const hide = page.getByRole('button', { name: 'Hide this bar', exact: true });
  if (await hide.isVisible()) await hide.click();
  const fixture = await page.evaluate(async () => {
    const { journal } = await import('/src/lib/data/live/journal.svelte.ts');
    const { todayEpochDay, startOfDayTimestamp } = await import('/src/lib/data/epochDay.ts');
    // A valid one-sample PCM WAV keeps the fixture's player independent of codecs.
    const wav = new Uint8Array(46);
    const data = new DataView(wav.buffer);
    const text = (offset, value) => [...value].forEach((c, i) => wav[offset + i] = c.charCodeAt(0));
    text(0, 'RIFF'); data.setUint32(4, 38, true); text(8, 'WAVEfmt ');
    data.setUint32(16, 16, true); data.setUint16(20, 1, true); data.setUint16(22, 1, true);
    data.setUint32(24, 8000, true); data.setUint32(28, 16000, true);
    data.setUint16(32, 2, true); data.setUint16(34, 16, true); text(36, 'data'); data.setUint32(40, 2, true);
    const day = todayEpochDay();
    await journal.regimen.upsertEpisode({ drug: 'estradiol', ester: null, dose: 2, doseUnit: 'mg', route: 'oral', interval: 'every day', startEpochDay: day - 60, endEpochDay: null, endReason: null });
    await journal.doses.upsertDose({ timestamp: startOfDayTimestamp(day - 1) + 8 * 3600000, route: 'oral', drug: 'estradiol', dose: 2, doseUnit: 'mg' });
    const ids = {};
    for (const source of ['Voice', 'Search', 'Margin', 'Question', 'Today', 'Chart', 'Day']) {
      for (const action of ['Save', 'Delete']) {
        const id = await journal.entries.upsertEntry({ epochDay: day, mood: 4, starred: true,
          note: `Source fixture ${source} ${action}`, attachRecordings: source === 'Voice' ? [wav] : [],
          bodyRegions: source === 'Chart' ? { chest: 5 } : {} });
        ids[`${source}${action}`] = id;
        if (['Margin', 'Question'].includes(source)) await journal.marginNotes.add({ entryId: id, epochDay: day, text: `privateorchid ${source} ${action}` });
      }
    }
    for (let n = 0; n < 10; n++) await journal.entries.upsertEntry({ epochDay: day - 20 - n, mood: 3, bodyRegions: { chest: 40 } });
    const question = await journal.savedQuestions.upsertSavedQuestion({ name: 'Source fixture', queryText: 'privateorchid Question', tagIds: [], moods: [], startEpochDay: null, endEpochDay: null, hasNote: false, hasPhoto: false, starred: false });
    return { ids, question, day };
  });
  for (const source of ['Voice', 'Search', 'Margin', 'Question', 'Today', 'Chart', 'Day'].filter(source => !process.env.ENTRY_SOURCE || source === process.env.ENTRY_SOURCE)) {
    for (const action of ['Save', 'Delete']) {
      await go('/more');
      const id = fixture.ids[`${source}${action}`];
      let route;
      let link;
      if (source === 'Voice') {
        // Switching from the default tab must also survive the return.
        await go('/voice');
        await page.locator('[data-segment="recordings"]').click();
        await page.locator('[data-open-entry]').first().waitFor();
        route = '/voice?tab=recordings';
        link = page.locator(`[data-open-entry][href^="/entry/${id}?"]`);
      } else if (source === 'Search' || source === 'Margin') {
        route = '/search?starred=1';
        await go(route);
        await page.locator('#q').fill(source === 'Search' ? `Source fixture Search ${action}` : `privateorchid Margin ${action}`);
        link = source === 'Search' ? page.locator(`[data-entry-card][href^="/entry/${id}?"]`) : page.locator(`[data-search-hit="marginNotes"][href^="/entry/${id}?"]`);
      } else if (source === 'Question') {
        route = `/search/questions/${fixture.question}`;
        await go(route);
        link = page.locator(`[data-search-hit="marginNotes"][href^="/entry/${id}?"]`);
      } else if (source === 'Today') {
        await page.evaluate(async ({ id, day }) => {
          const { journal } = await import('/src/lib/data/live/journal.svelte.ts');
          for (const row of await journal.revisits.getDueRevisits(day)) await journal.revisits.deleteRevisit(row.id);
          await journal.revisits.setRevisit({ entryId: id, createdEpochDay: day, targetEpochDay: day });
        }, { id, day: fixture.day });
        route = '/';
        await go(route);
        link = page.locator('[data-revisit-tile]');
      } else if (source === 'Chart') {
        await go('/care/curve');
        await page.locator('[data-segment="30"]').click();
        route = '/care/curve?days=30';
        await page.locator('[data-curve-markers-toggle]').first().click();
        link = page.locator(`[data-curve-markers-list] a[href^="/entry/${id}?"]`).first();
      } else {
        route = `/day/${fixture.day}`;
        await go(route);
        link = page.locator(`[data-entry-card][href^="/entry/${id}?"]`);
      }
      await link.click();
      await page.locator('#ed-note').waitFor();
      const entryUrl = new URL(page.url());
      assert.equal(entryUrl.searchParams.get('from'), route, `${source} link carries its source`);
      assert.ok(!page.url().includes('privateorchid'), 'typed query stays out of the entry URL');
      await finish(action);
      assert.equal(new URL(page.url()).pathname + new URL(page.url()).search, route, `${source} ${action} returns to source`);
      if (source === 'Question') await page.locator('[data-search-hit="marginNotes"]').first().waitFor();
      if (source === 'Voice') await page.locator('[data-open-entry]').first().waitFor();
      if (source === 'Chart') assert.equal(await page.locator('[data-segment="30"]').getAttribute('aria-checked'), 'true');
      if (source === 'Search' || source === 'Margin') {
        assert.equal(await page.locator('#q').inputValue(), source === 'Search' ? `Source fixture Search ${action}` : `privateorchid Margin ${action}`);
        await page.locator('[data-filter-toggle]').click();
        assert.equal(await page.locator('[data-filter-starred]').getAttribute('aria-pressed'), 'true');
        await page.keyboard.press('Escape');
        const held = await page.evaluate(async () => {
          const { takeHeldSearch } = await import('/src/lib/navigation/searchReturn.ts');
          return takeHeldSearch();
        });
        assert.equal(held, null, 'return spends the held snapshot');
      }
      if (source === 'Question' && action === 'Delete') {
        await page.evaluate(async questionId => {
          const { journal } = await import('/src/lib/data/live/journal.svelte.ts');
          const question = (await journal.savedQuestions.getSavedQuestions()).find(row => row.id === questionId);
          await journal.savedQuestions.upsertSavedQuestion({ ...question, queryText: 'privateorchid Margin Save' });
        }, fixture.question);
        await page.locator(`[data-search-hit="marginNotes"][href^="/entry/${fixture.ids.MarginSave}?"]`).waitFor();
        assert.equal(await page.locator(`[data-search-hit="marginNotes"][href^="/entry/${fixture.ids.QuestionSave}?"]`).count(), 0, 'changed criteria reject the warm answer for the old question');
        console.log('PASS changed saved-question criteria replace warm hits');
      }
      console.log(`PASS ${source} ${action}: source route, filters and query`);
    }
  }
  const privateContext = await page.evaluate(() => ({
    history: JSON.stringify(history.state),
    stored: [localStorage, sessionStorage].flatMap(storage => Object.keys(storage).map(key => storage.getItem(key))).join(' ')
  }));
  assert.ok(!privateContext.history.includes('privateorchid'));
  assert.ok(!privateContext.stored.includes('privateorchid'));
  console.log('PASS return context does not write typed queries into history state or Web Storage');

} catch (error) {
  console.error('BODY', (await page.locator('body').innerText()).slice(-5000));
  console.error('Source return failure at', page.url(), await page.locator('[data-search-hit]').evaluateAll(rows => rows.map(row => ({ href: row.getAttribute('href'), text: row.textContent }))));
  throw error;
} finally {
  await browser.close();
  await server.close();
}
