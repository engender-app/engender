import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import { fillDate, launchChromium, dateValue } from './browser-harness.mjs';

const out = process.env.RANGE_SIGNOFF;
if (out) await mkdir(out, { recursive: true });
const server = await createServer({ cacheDir: '.svelte-kit/range-editors-vite', server: { port: 0, fs: { allow: [process.cwd(), realpathSync('node_modules')] } } });
await server.listen();
const browser = await launchChromium();
const errors = [];
const messages = { en: 'The end comes before the start.', pl: 'Koniec wypada przed początkiem.' };

async function settle(page) {
  await page.waitForFunction(() => document.getAnimations().every((animation) =>
    animation.playState !== 'running' || animation.effect?.getComputedTiming().iterations === Infinity));
}
async function navigate(page, path) {
  await page.evaluate((path) => {
    const link = document.createElement('a');
    link.href = path; document.body.append(link); link.click(); link.remove();
  }, path);
  await page.waitForURL((url) => url.pathname === path);
}
async function rows(page, area) {
  return page.evaluate(async (area) => {
    const { bootState } = await import('/src/lib/stores/boot.svelte.ts');
    const owner = bootState.journal[area];
    return area === 'regimen' ? owner.getEpisodes() : area === 'tryouts' ? owner.getTryouts() : owner.getPauses();
  }, area);
}
async function checkRange(page, { name, start, end, save, error, area, locale, theme }) {
  await fillDate(page, start, '2020-01-10');
  // The end picker rejects an earlier typed day without changing the draft.
  await page.locator(end).click();
  const picker = page.locator('[data-date-picker]');
  await picker.locator('[data-date-picker-entry]').fill('2020-01-09');
  await picker.locator('[data-date-picker-apply]').click();
  assert.equal(await picker.locator('[data-date-picker-entry]').evaluate((input) => input.validity.customError), true, `${name}: picker enforces start`);
  await picker.locator('[data-date-picker-entry]').fill('2020-01-10');
  await picker.locator('[data-date-picker-apply]').click();
  await picker.waitFor({ state: 'detached' });
  assert.equal(await page.locator(save).isEnabled(), true, `${name}: equal bounds allowed`);

  // Moving the start later leaves the end intact and exposes the editor guard.
  await page.evaluate((selector) => {
    window.rangeFrames = [];
    window.rangeSampling = true;
    function sample() {
      const error = document.querySelector(selector);
      if (error) {
        const moving = error.closest('.disclosed') ?? error;
        const style = getComputedStyle(moving);
        window.rangeFrames.push({ height: moving.getBoundingClientRect().height, clip: style.clipPath, opacity: Number(style.opacity) });
      }
      if (window.rangeSampling) requestAnimationFrame(sample);
    }
    requestAnimationFrame(sample);
  }, error);
  await fillDate(page, start, '2020-01-11');
  await page.locator(error).waitFor();
  await settle(page);
  const frames = await page.evaluate(() => { window.rangeSampling = false; return window.rangeFrames; });
  if (locale === 'en') assert.ok(new Set(frames.map((frame) => Math.round(frame.height * 100))).size > 2 || new Set(frames.map((frame) => frame.clip)).size > 2 || frames.some((frame) => frame.opacity > 0 && frame.opacity < 1), `${name}: feedback has intermediate frames ${JSON.stringify(frames)}`);
  assert.equal(await dateValue(page.locator(end)), '2020-01-10', `${name}: no silent date correction`);
  assert.equal(await page.locator(save).isDisabled(), true);
  assert.match(await page.locator(error).innerText(), new RegExp(messages[locale]));
  assert.equal(await page.locator(end).getAttribute('aria-invalid'), 'true');
  const before = await rows(page, area);
  // A forced button event must still hit the handler's guard.
  await page.locator(save).evaluate((button) => { button.disabled = false; button.click(); button.disabled = true; });
  await settle(page);
  assert.deepEqual(await rows(page, area), before, `${name}: inverted handler does not write`);
  if (out && locale === 'en') {
    await page.locator(save).scrollIntoViewIfNeeded();
    const dates = await page.locator(start).locator('..').boundingBox();
    const button = await page.locator(save).boundingBox();
    const errorBox = await page.locator(error).boundingBox();
    const left = Math.min(dates.x, errorBox.x, button.x);
    const top = Math.min(dates.y, errorBox.y);
    const right = Math.max(dates.x + dates.width, errorBox.x + errorBox.width, button.x + button.width);
    const bottom = Math.max(errorBox.y + errorBox.height, button.y + button.height);
    await page.screenshot({ path: `${out}/${name}-${theme}-after.png`, clip: { x: left, y: top, width: right - left, height: bottom - top } });
  }
  await fillDate(page, end, '2020-01-11');
  assert.equal(await page.locator(save).isEnabled(), true);
  await page.locator(end).click();
  await page.locator('[data-date-picker-clear]').click();
  await page.locator('[data-date-picker]').waitFor({ state: 'detached' });
  assert.equal(await dateValue(page.locator(end)), '');
  assert.equal(await page.locator(save).isEnabled(), true, `${name}: open end allowed`);
  await page.locator(save).click();
  await page.waitForFunction(async ({ area, count }) => {
    const { bootState } = await import('/src/lib/stores/boot.svelte.ts');
    const owner = bootState.journal[area];
    const values = await (area === 'regimen' ? owner.getEpisodes() : area === 'tryouts' ? owner.getTryouts() : owner.getPauses());
    return values.length === count + 1;
  }, { area, count: before.length });
  console.log(`PASS ${name} ${locale}/${theme}: picker, invalid handler, equal/open bounds, feedback`);
}

try {
  for (const locale of ['en', 'pl']) for (const theme of ['light', 'dark']) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: locale === 'en' ? 'no-preference' : 'reduce' });
    page.setDefaultTimeout(20000);
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(server.resolvedUrls.local[0], { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-app-root][data-boot="ready"]', { timeout: 60000 });
    if (await page.locator('[data-leave-setup]').count()) await page.locator('[data-leave-setup]').click();
    await page.evaluate(async ({ locale, theme }) => {
      const { prefs } = await import('/src/lib/data/prefs/store.svelte.ts');
      const { setLocale } = await import('/src/lib/paraglide/runtime.js');
      prefs.palette = 'trans'; prefs.theme = theme; prefs.language = locale;
      setLocale(locale, { reload: false });
    }, { locale, theme });
    await page.waitForFunction((motion) => document.documentElement.dataset.a11yMotion === motion, locale === 'en' ? 'normal' : 'reduce');
    const options = { locale, theme };
    await navigate(page, '/care/regimen');
    await page.locator('[data-add]').click();
    await page.locator('[data-own]').click();
    await page.locator('#regimen-drug').fill('Range proof');
    await page.locator('#regimen-dose').fill('2');
    await checkRange(page, { ...options, name: 'regimen', start: '#regimen-start', end: '#regimen-end', save: '[data-save-regimen]', error: '#regimen-episode-requirements p', area: 'regimen' });
    await page.locator('[data-sheet]').waitFor({ state: 'detached' });
    await page.locator('[data-episode]', { hasText: 'Range proof' }).click();
    await page.locator('[data-new-pause]').click();
    await checkRange(page, { ...options, name: 'dose-pause', start: '#pause-start', end: '#pause-end', save: '[data-add-pause]', error: '#regimen-pause-requirements', area: 'doses' });
    await page.locator('[data-close-regimen]').click();
    await page.locator('[data-sheet]').waitFor({ state: 'detached' });
    await navigate(page, '/transition/tryouts/new');
    await page.locator('#tr-label').fill('Range proof');
    await checkRange(page, { ...options, name: 'tryout', start: '#tr-start', end: '#tr-end', save: '[data-save-tryout]', error: '#tr-range-error', area: 'tryouts' });
    await page.close();
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  await server.close();
}
