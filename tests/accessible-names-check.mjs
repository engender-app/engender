import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { createServer } from 'vite';
import { FILL_EVERY_FEATURE_EXPRESSION } from './yank-sweep-core.mjs';
import { launchChromium } from './browser-harness.mjs';

const server = await createServer({
  cacheDir: '.svelte-kit/accessible-names-vite',
  optimizeDeps: { include: ['pdfjs-dist/legacy/build/pdf.mjs', 'pdfjs-dist/legacy/build/pdf.worker.mjs'] },
  server: { port: 0, fs: { allow: [process.cwd(), realpathSync('node_modules')] } }
});
await server.listen();
const browser = await launchChromium();
const failures = [];
const errors = [];
try {
  for (const locale of ['en', 'pl']) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(server.resolvedUrls.local[0], { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-app-root][data-boot="ready"]', { timeout: 60000 });
    if (await page.locator('[data-leave-setup]').count()) await page.locator('[data-leave-setup]').click();
    await page.evaluate(FILL_EVERY_FEATURE_EXPRESSION);
    await page.evaluate(async (locale) => {
      const { prefs } = await import('/src/lib/data/prefs/store.svelte.ts');
      const { setLocale } = await import('/src/lib/paraglide/runtime.js');
      prefs.language = locale;
      setLocale(locale, { reload: false });
    }, locale);
    const go = async (route, selector) => {
      await page.goto(new URL(route, server.resolvedUrls.local[0]).href, { waitUntil: 'networkidle' });
      await page.locator(selector).first().waitFor();
    };
    const contains = async (locator, text, surface) => {
      const name = await locator.getAttribute('aria-label');
      try {
        assert.ok(name?.includes(text), `${locale} ${surface}: ${JSON.stringify(name)} must include ${JSON.stringify(text)}`);
        assert.equal(await page.getByRole(await locator.evaluate((el) => el.tagName === 'A' ? 'link' : 'button'), { name, exact: true }).count(), 1);
      } catch (error) { failures.push(error.message); }
    };
    await go('/care/labs', '[data-lab-result]');
    for (const row of await page.locator('[data-lab-result]').all()) {
      await contains(row, (await row.locator('.lab-value').innerText()).trim(), 'lab value and unit');
      const date = (await row.locator('.kit-row-sub').first().innerText()).split(' · ')[0];
      await contains(row, date, 'lab date');
      const storedAnalyte = await row.evaluate(async (el) => {
        const { bootState } = await import('/src/lib/stores/boot.svelte.ts');
        return (await bootState.journal.labs.getResultsInRange(0, 100000)).find((result) => result.id === el.dataset.labResult)?.analyte;
      });
      assert.ok(storedAnalyte, 'Lab row has a stored analyte');
      await contains(row, storedAnalyte, 'lab analyte');
    }
    await go('/support/resources', '[data-resource] a');
    for (const link of await page.locator('[data-resource] a').all()) {
      await contains(link, (await link.innerText()).trim(), 'resource number or domain');
    }
    await go('/voice', '[data-segment="compare"]');
    await page.locator('[data-segment="compare"]').click();
    await page.locator('[data-voice-cell]').first().waitFor();
    for (const row of await page.locator('[data-voice-cell]').all()) {
      await contains(row.locator('.kit-row-main'), (await row.locator('[data-voice-row-pitch]').innerText()).trim(), 'benchmark pitch');
      await contains(row.locator('.kit-row-main'), (await row.locator('.kit-row-title').innerText()).trim(), 'benchmark date');
    }
    await page.close();
  }
  assert.deepEqual(errors, [], 'No browser errors');
  assert.deepEqual(failures, [], 'Visible values remain in accessible names');
  console.log('PASS EN/PL lab values, dates and analytes; crisis numbers and domains; voice pitch');
} finally {
  await browser.close();
  await server.close();
}
