import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import { launchChromium } from './browser-harness.mjs';

const out = process.env.DOSE_SIGNOFF;
if (out) await mkdir(out, { recursive: true });
const server = await createServer({ cacheDir: '.svelte-kit/dose-amount-vite', server: { port: 0, fs: { allow: [process.cwd(), realpathSync('node_modules')] } } });
await server.listen();
const browser = await launchChromium();
const hints = { en: 'Enter a dose amount greater than zero.', pl: 'Wpisz dawkę większą od zera.' };
async function settle(page) {
  await page.waitForFunction(() => document.getAnimations().every((animation) =>
    animation.playState !== 'running' || animation.effect?.getComputedTiming().iterations === Infinity));
}
async function doses(page) {
  return page.evaluate(async () => {
    const { bootState } = await import('/src/lib/stores/boot.svelte.ts');
    return bootState.journal.doses.getDoses(0, 99999);
  });
}
try {
  for (const locale of ['en', 'pl']) for (const theme of ['light', 'dark']) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(server.resolvedUrls.local[0], { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-app-root][data-boot="ready"]');
    if (await page.locator('[data-leave-setup]').count()) {
      await page.locator('[data-leave-setup]').click();
      await page.waitForSelector('[data-home-hello]');
    }
    await page.evaluate(async ({ locale, theme }) => {
      const { prefs } = await import('/src/lib/data/prefs/store.svelte.ts');
      const { setLocale } = await import('/src/lib/paraglide/runtime.js');
      prefs.palette = 'trans'; prefs.theme = theme; prefs.language = locale;
      setLocale(locale, { reload: false });
      const a = document.createElement('a'); a.href = '/care/doses';
      document.body.append(a); a.click(); a.remove();
    }, { locale, theme });
    await page.locator('[data-attribution-toggle]').waitFor();
    await page.locator('[data-add]').click();
    const amount = page.locator('#dose-amount');
    const save = page.locator('[data-save-dose]');
    await amount.fill('0.125');
    await page.locator('#dose-unit').fill('mg');
    await page.locator('#dose-requirements').waitFor({ state: 'detached' });
    await settle(page);
    const before = await doses(page);
    await page.evaluate(() => {
      window.doseFrames = []; window.doseSampling = true;
      function sample() {
        const el = document.querySelector('#dose-requirements');
        if (el) {
          const style = getComputedStyle(el);
          window.doseFrames.push({ height: el.getBoundingClientRect().height, clip: style.clipPath, opacity: Number(style.opacity) });
        }
        if (window.doseSampling) requestAnimationFrame(sample);
      }
      requestAnimationFrame(sample);
    });
    await amount.fill('-2');
    await page.locator('#dose-unit').focus();
    await page.locator('#dose-requirements').waitFor();
    await settle(page);
    const frames = await page.evaluate(() => { window.doseSampling = false; return window.doseFrames; });
    assert.ok(new Set(frames.map((frame) => Math.round(frame.height * 100))).size > 2 || new Set(frames.map((frame) => frame.clip)).size > 2 || frames.some((frame) => frame.opacity > 0 && frame.opacity < 1), `feedback moves: ${JSON.stringify(frames)}`);
    assert.equal(await save.isDisabled(), true);
    assert.equal(await amount.getAttribute('aria-invalid'), 'true');
    assert.equal(await amount.getAttribute('aria-describedby'), 'dose-requirements');
    assert.equal(await page.locator('#dose-requirements').innerText(), hints[locale]);
    if (out) await page.locator('[data-sheet]').screenshot({ path: `${out}/after-${locale}-${theme}.png` });
    for (const value of ['0', '1e309', '']) {
      await amount.fill(value);
      assert.equal(await save.isDisabled(), true, `${value} cannot save`);
      await save.evaluate((button) => button.click());
      assert.deepEqual(await doses(page), before);
    }
    await amount.fill('0.125');
    assert.equal(await save.isEnabled(), true, 'positive fraction can save');
    await page.locator('[data-dose-status]').click();
    await page.locator('[data-segment="changed"]').click();
    await page.locator('#dose-scheduled-amount').fill('2');
    await page.locator('[data-dose-what]').click();
    await amount.fill('-2');
    assert.equal(await save.isDisabled(), true, 'changed actual amount cannot be negative');
    await amount.fill('0.125');
    await save.click();
    await page.locator('[data-sheet]').waitFor({ state: 'detached' });
    const saved = (await doses(page)).find((row) => !before.some((old) => old.id === row.id));
    assert.equal(saved.dose, 0.125);
    assert.equal(saved.status, 'changed');
    assert.equal(saved.scheduled.dose, 2);
    assert.equal(saved.route, 'oral');
    await page.locator(`[data-dose="${saved.id}"]`).click();
    await page.locator('[data-dose-what]').click();
    await amount.fill('0');
    assert.equal(await save.isDisabled(), true, 'invalid update cannot save');
    await page.locator('[data-dose-status]').click();
    await page.locator('[data-segment="skipped"]').click();
    assert.equal(await save.isEnabled(), true, 'skipped zero keeps existing meaning');
    await save.click();
    await page.locator('[data-sheet]').waitFor({ state: 'detached' });
    const skipped = (await doses(page)).find((row) => row.id === saved.id);
    assert.equal(skipped.status, 'skipped');
    assert.equal(skipped.dose, 0);
    assert.deepEqual(errors, []);
    console.log(`PASS ${locale}/${theme}: negative, zero, overflow and blank refused; fractional changed dose saved; skipped zero preserved; feedback ${frames.length} frames`);
    await page.close();
  }
} finally {
  await browser.close();
  await server.close();
}
