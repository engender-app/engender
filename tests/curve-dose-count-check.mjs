/* Compiled catalogue forms and both curve-note branches. Run with node. */
import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import { launchChromium, untilSplashLets } from './browser-harness.mjs';
import { clientRoute } from './browser-tier/built-flow.mjs';

const baseline = process.env.CURVE_COPY_BASELINE === '1';
const signoff = process.env.CURVE_COPY_SIGNOFF;
if (signoff) await mkdir(signoff, { recursive: true });
const server = await createServer({
  server: { port: 0, fs: { allow: [process.cwd(), realpathSync('node_modules')] } },
  plugins: [{ name: 'curve-copy-no-watch', configResolved(config) { config.server.watch = null; } }]
});
await server.listen();
const browser = await launchChromium();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: 'en-GB' });
page.setDefaultTimeout(30000);
const errors = [];
page.on('pageerror', error => errors.push(error.message));
async function go(path) {
  await clientRoute(page, path);
  await page.waitForFunction(() => !document.documentElement.dataset.nav);
}
try {
  await page.goto(server.resolvedUrls.local[0]);
  await page.locator('[data-app-root][data-boot="ready"]').waitFor({ timeout: 90000 });
  await untilSplashLets(page);
  if (await page.locator('[data-leave-setup]').count()) await page.locator('[data-leave-setup]').click();
  const hide = page.getByRole('button', { name: 'Hide this bar', exact: true });
  if (await hide.isVisible()) await hide.click();

  const forms = await page.evaluate(async () => {
    const { m } = await import('/src/lib/paraglide/messages.js');
    return Object.fromEntries(['en', 'pl'].map(locale => [locale,
      [0, 1, 2, 5, 12, 22].map(count => m.curve_no_curve_note({ count }, { locale }))]));
  });
  console.log('Compiled catalogue:', JSON.stringify(forms));
  for (const [i, count] of [0, 1, 2, 5, 12, 22].entries()) {
    assert.match(forms.en[i], new RegExp(`^No curve for ${count} ${count === 1 && !baseline ? 'dose' : 'doses'} in this window\\.`));
    if (!baseline) assert.match(forms.pl[i], new RegExp(`^${count} ${count === 1 ? 'dawka bez krzywej' : count === 2 || count === 22 ? 'dawki bez krzywej' : 'dawek bez krzywej'} w tym przedziale\\.`));
  }

  await page.evaluate(async () => {
    const { journal } = await import('/src/lib/data/live/journal.svelte.ts');
    const { todayEpochDay } = await import('/src/lib/data/epochDay.ts');
    const day = todayEpochDay();
    await journal.regimen.upsertEpisode({ drug: 'estradiol', ester: null, dose: 2, doseUnit: 'mg', route: 'oral', interval: 'every day', startEpochDay: day - 1, endEpochDay: null, endReason: null });
    for (const dose of await journal.doses.getDoses(day - 180, day)) await journal.doses.deleteDose(dose.id);
  });
  for (const populated of [false, true]) {
    for (const count of [0, 1, 2]) {
      await go('/care');
      const result = await page.evaluate(async ({ count, populated }) => {
        const { journal } = await import('/src/lib/data/live/journal.svelte.ts');
        const { todayEpochDay, startOfDayTimestamp } = await import('/src/lib/data/epochDay.ts');
        const day = todayEpochDay();
        for (const dose of await journal.doses.getDoses(day - 180, day)) await journal.doses.deleteDose(dose.id);
        if (populated) {
          await journal.doses.upsertDose({ timestamp: startOfDayTimestamp(day) + 8 * 3600000, route: 'oral', drug: 'estradiol', dose: 2, doseUnit: 'mg' });
        }
        for (let i = 0; i < count; i++) await journal.doses.upsertDose({ timestamp: startOfDayTimestamp(day) + (9 + i) * 3600000, route: 'oral', drug: 'fixture-no-curve', dose: 1, doseUnit: 'mg' });
        const view = await journal.hormoneCurve.getCurves({ fromEpochDay: day - 89, toEpochDay: day, fitToOwnLabs: false });
        return { count: view.dosesNoCurveAnywhere, charts: view.injectable.charts.length + view.qualitative.sections.length };
      }, { count, populated });
      assert.equal(result.count, count);
      assert.equal(result.charts > 0, populated);
      await go('/care/curve');
      await page.waitForFunction(() => document.querySelector('[data-no-curve-note], [data-notice], [data-chart-card]'));
      const note = page.locator('[data-no-curve-note]');
      if (count === 0) {
        assert.equal(await note.count(), 0);
      } else {
        await note.waitFor();
        assert.equal(await note.innerText(), forms.en[count]);
        if (!populated && count === 1 && signoff) for (const theme of ['light', 'dark']) {
          await page.evaluate(async theme => {
            const { prefs } = await import('/src/lib/data/prefs/store.svelte.ts');
            prefs.theme = theme;
            prefs.palette = 'trans';
          }, theme);
          await page.waitForFunction(theme => document.documentElement.dataset.theme === theme && !document.documentElement.dataset.nav && document.getAnimations().every(a => a.effect?.getComputedTiming().iterations === Infinity || a.playState === 'finished'), theme);
          await note.screenshot({ path: `${signoff}/${baseline ? 'before' : 'after'}-${theme}.png` });
        }
      }
      console.log(`PASS ${populated ? 'populated' : 'empty'} curve: count ${count}, charts ${result.charts}`);
    }
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  await server.close();
}
