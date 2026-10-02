import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'vite';
import { fillDate, launchChromium, screencast } from './browser-harness.mjs';
import { PALETTES } from './palettes.mjs';

const gallery = process.argv.includes('--gallery');
const out = '.claude/tryout-save-shots';
const motionOut = '.claude/tryout-motion-shots';
const motionScenes = [];
if (gallery) await mkdir(out, { recursive: true });

const server = await createServer({ cacheDir: '.svelte-kit/tryout-save-vite', server: { port: 0, fs: { allow: [process.cwd(), realpathSync('node_modules')] } } });
await server.listen();
const browser = await launchChromium();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
page.setDefaultTimeout(10000);
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => { if (message.type() === 'error') console.error(message.text()); });
// Substitute only the public navigation boundary; the app has no fault flag.
await page.route(/\/runtime\/client\/client\.js/, async (route) => {
  const response = await route.fetch();
  const body = await response.text();
  const signature = 'function goto(url, opts = {}) {';
  assert.ok(body.includes(signature));
  await route.fulfill({ response, body: body.replace(signature, `${signature}
    if (window.tryoutNavigationFails && String(url).startsWith('/transition/tryouts/') || window.tryoutFailedDestination === new URL(url, location.href).pathname) return Promise.reject(new Error('injected navigation failure'));`) });
});
async function navigate(path) {
  await page.evaluate((path) => {
    const link = document.createElement('a');
    link.href = path;
    document.body.append(link);
    link.click();
    link.remove();
  }, path);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => setTimeout(() => requestAnimationFrame(resolve), 0))));
}
async function capture(name) {
  if (!gallery) return;
  await page.waitForFunction(() => document.getAnimations().every((animation) =>
    animation.playState !== 'running' || animation.effect?.getComputedTiming().iterations === Infinity
  ));
  await page.screenshot({ path: `${out}/${name}.png` });
}
async function feedbackMotion(action, name) {
  const record = async (frames = []) => {
    await page.evaluate(() => {
      window.feedbackHeights = [];
      window.feedbackDone = false;
      const start = performance.now();
      function sample() {
        const status = document.querySelector('[data-tryout-saved]');
        if (status) window.feedbackHeights.push(status.parentElement.getBoundingClientRect().height);
        if (performance.now() - start < 900) requestAnimationFrame(sample);
        else window.feedbackDone = true;
      }
      requestAnimationFrame(sample);
    });
    await action();
    await page.waitForFunction(() => window.feedbackDone);
    const heights = await page.evaluate(() => window.feedbackHeights);
    assert.ok(new Set(heights.map(Math.round)).size > 2, 'feedback travels through intermediate heights');
    if (gallery) {
      await mkdir(motionOut, { recursive: true });
      const written = [];
      const start = frames[0]?.at ?? 0;
      for (const [i, frame] of frames.entries()) {
        const at = Math.round(frame.at - start);
        const file = `${name}-${String(i).padStart(3, '0')}-${at}ms.png`;
        await writeFile(`${motionOut}/${file}`, Buffer.from(frame.data, 'base64'));
        written.push({ file, at });
      }
      assert.ok(written.length > 2, 'motion scene retains compositor frames');
      motionScenes.push({ name, crop: { top: 0, height: 844 }, frames: written });
      await writeFile(`${motionOut}/manifest.json`, JSON.stringify({ scenes: motionScenes }, null, 2));
    }
  };
  if (gallery) await screencast(page, record);
  else await record();
}
try {
  await page.goto(server.resolvedUrls.local[0], { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]', { timeout: 60000 });
  if (await page.locator('[data-leave-setup]').count()) await page.locator('[data-leave-setup]').click();
  await navigate('/transition/tryouts/new');
  await page.locator('#tr-label').waitFor();
  assert.equal(await page.locator('[data-save-tryout]').isDisabled(), true);
  assert.equal(await page.locator('#tr-label').getAttribute('required'), '');
  assert.equal(await page.locator('#tr-label').getAttribute('aria-invalid'), 'true');
  const help = await page.locator('#tr-label').getAttribute('aria-describedby');
  assert.match(await page.locator(`#${help}`).innerText(), /Add a label/);
  assert.match(await page.locator('[data-tryout-photo-requirement]').innerText(), /Save.*photo/);
  assert.equal(await page.locator('[data-add-photo]').count(), 0);
  console.log('PASS required label and saved-owner photo guidance');
  await page.evaluate(async () => {
    const { bootState } = await import('/src/lib/stores/boot.svelte.ts');
    const original = bootState.journal.tryouts.upsertTryout.bind(bootState.journal.tryouts);
    window.tryoutFault = { mode: 'fail', calls: 0 };
    bootState.journal.tryouts.upsertTryout = async (draft) => {
      window.tryoutFault.calls++;
      if (window.tryoutFault.mode === 'fail') throw new Error('injected tryout write failure');
      if (window.tryoutFault.mode === 'pending') await new Promise((resolve) => { window.tryoutFault.resolve = resolve; });
      const id = await original(draft);
      window.tryoutFault.id = id;
      return id;
    };
    const { attachJournal, journalIsOpen } = await import('/src/lib/data/live/journal.svelte.ts');
    attachJournal(bootState.journal);
    journalIsOpen();
  });
  await page.locator('[data-segment="style"]').click();
  await page.locator('#tr-label').fill('Retained tryout');
  await page.locator('#tr-description').fill('Complete description');
  await fillDate(page, '#tr-start', '2024-03-11');
  await fillDate(page, '#tr-end', '2024-04-12');
  await page.locator('[data-save-tryout]').click();
  await page.getByRole('alert').filter({ hasText: 'Could not save' }).waitFor();
  assert.equal(await page.locator('#tr-label').inputValue(), 'Retained tryout');
  assert.equal(await page.locator('#tr-description').inputValue(), 'Complete description');
  assert.equal(await page.locator('#tr-start').inputValue(), '2024-03-11');
  assert.equal(await page.locator('#tr-end').inputValue(), '2024-04-12');
  assert.equal(await page.locator('[data-segment="style"]').getAttribute('aria-checked'), 'true');
  assert.equal(await page.locator('[data-save-tryout]').isEnabled(), true);
  assert.equal(await page.evaluate(() => window.tryoutFault.calls), 1);
  console.log('PASS failed storage preserves complete draft and retry');
  await page.evaluate(() => { window.tryoutFault.mode = 'pending'; });
  await page.locator('[data-save-tryout]').click();
  await page.waitForFunction(() => window.tryoutFault.resolve);
  await page.locator('[data-save-tryout]').evaluate((button) => { button.click(); button.click(); });
  assert.equal(await page.locator('[data-save-tryout]').isDisabled(), true);
  for (const selector of ['#tr-label', '#tr-description', '#tr-start', '#tr-end', '[data-segment="name"]']) {
    assert.equal(await page.locator(selector).isDisabled(), true, selector);
  }
  assert.equal(await page.locator('fieldset').first().getAttribute('aria-busy'), 'true');
  await navigate('/more');
  await page.waitForTimeout(300);
  assert.equal(new URL(page.url()).pathname, '/transition/tryouts/new');
  assert.equal(await page.locator('[data-keep-editing]').count(), 0);
  await page.evaluate(() => window.tryoutFault.resolve());
  await page.waitForURL(/\/transition\/tryouts\/(?!new)[^/]+$/);
  await page.locator('[data-add-photo]').waitFor();
  const savedPath = new URL(page.url()).pathname;
  assert.equal(await page.evaluate(() => window.tryoutFault.calls), 2);
  await navigate('/transition/tryouts');
  await page.waitForURL('**/transition/tryouts');
  await page.getByRole('link', { name: /Retained tryout/ }).waitFor();
  assert.equal(await page.getByRole('link', { name: /Retained tryout/ }).count(), 1);
  await navigate(savedPath);
  await page.locator('#tr-description').waitFor();
  assert.equal(await page.locator('#tr-description').inputValue(), 'Complete description');
  assert.equal(await page.locator('#tr-start').inputValue(), '2024-03-11');
  assert.equal(await page.locator('#tr-end').inputValue(), '2024-04-12');
  console.log('PASS pending retry blocks navigation and repeated taps; creation reopens once with photo controls');
  await page.locator('#tr-label').fill('Changed tryout');
  for (const departure of ['header', 'back', 'navigation']) {
    if (departure === 'header') await page.locator('[data-screen-back]').click();
    if (departure === 'back') await page.evaluate(() => history.back());
    if (departure === 'navigation') await navigate('/more');
    await page.locator('[data-keep-editing]').click();
    await page.locator('[data-keep-editing]').waitFor({ state: 'detached' });
    assert.equal(await page.locator('#tr-label').inputValue(), 'Changed tryout');
    assert.equal(new URL(page.url()).pathname, savedPath);
  }
  await page.locator('#tr-label').fill('Retained tryout');
  await navigate('/more');
  await page.waitForURL('**/more');
  await page.locator('[data-hub-search]').waitFor();
  assert.equal(await page.locator('[data-keep-editing]').count(), 0);
  await navigate(savedPath);
  await page.locator('#tr-label').waitFor();
  await page.locator('#tr-description').fill('Discard this description');
  await navigate('/more');
  await page.locator('[data-discard-record]').click();
  await page.waitForURL('**/more');
  await page.locator('[data-hub-search]').waitFor();
  await navigate(savedPath);
  await page.locator('#tr-description').waitFor();
  assert.equal(await page.locator('#tr-description').inputValue(), 'Complete description');
  console.log('PASS changed Back and navigation preserve draft; reverted departure skips prompt; discard writes nothing');
  await page.locator('#tr-label').fill('Discard before failed navigation');
  await page.evaluate(() => { window.tryoutFailedDestination = '/more'; });
  await navigate('/more');
  await page.locator('[data-discard-record]').click();
  await page.locator('[data-discard-record]').waitFor({ state: 'detached' });
  await page.waitForTimeout(300);
  assert.equal(new URL(page.url()).pathname, savedPath);
  await page.evaluate(() => { window.tryoutFailedDestination = null; });
  await page.locator('#tr-label').fill('Protected after navigation failure');
  await navigate('/more');
  await page.locator('[data-keep-editing]').click();
  await page.locator('[data-keep-editing]').waitFor({ state: 'detached' });
  assert.equal(await page.locator('#tr-label').inputValue(), 'Protected after navigation failure');
  assert.equal(new URL(page.url()).pathname, savedPath);
  console.log('PASS failed discarded navigation cannot bypass protection on subsequent edits');
  await page.locator('#tr-label').fill('Saved edit');
  await page.locator('#tr-description').fill('Saved description');
  await page.evaluate(() => { window.tryoutFault.mode = 'ok'; });
  await page.locator('[data-save-tryout]').click();
  await page.locator('[data-tryout-saved]').waitFor();
  assert.equal(await page.getByRole('status').filter({ hasText: 'Saved.' }).count(), 1);
  assert.equal(await page.locator('[data-tryout-saved]').evaluate((el) => el === document.activeElement), true);
  assert.equal(new URL(page.url()).pathname, savedPath);
  await navigate('/more');
  await page.waitForURL('**/more');
  await page.locator('[data-hub-search]').waitFor();
  assert.equal(await page.locator('[data-keep-editing]').count(), 0);
  await navigate(savedPath);
  await page.locator('#tr-description').waitFor();
  assert.equal(await page.locator('#tr-label').inputValue(), 'Saved edit');
  assert.equal(await page.locator('#tr-description').inputValue(), 'Saved description');
  await page.locator('#tr-label').fill('Changed after save');
  await page.locator('#tr-label').fill('Saved edit');
  await navigate('/more');
  await page.waitForURL('**/more');
  await page.locator('[data-hub-search]').waitFor();
  assert.equal(await page.locator('[data-keep-editing]').count(), 0);
  console.log('PASS edit stays on detail with one focused saved outcome and updated baseline');

  await navigate('/transition/tryouts/new');
  await page.locator('#tr-label').waitFor();
  await page.locator('#tr-label').fill('Navigation retained');
  await page.evaluate(() => { window.tryoutNavigationFails = true; });
  const previousCalls = await page.evaluate(() => window.tryoutFault.calls);
  await page.locator('[data-save-tryout]').click();
  await page.locator('[data-tryout-continue]').waitFor();
  assert.equal(await page.locator('[data-tryout-saved]').evaluate((el) => el === document.activeElement), true);
  assert.match(await page.locator('[data-tryout-saved]').innerText(), /saved.*could not open/);
  assert.equal(await page.locator('[data-save-tryout]').isDisabled(), true);
  await page.locator('[data-save-tryout]').evaluate((button) => { button.click(); button.click(); });
  await page.locator('[data-tryout-continue]').click();
  assert.equal(await page.evaluate(() => window.tryoutFault.calls), previousCalls + 1);
  await page.evaluate(() => { window.tryoutNavigationFails = false; });
  await page.locator('[data-tryout-continue]').click();
  await page.waitForURL(/\/transition\/tryouts\/(?!new)[^/]+$/);
  await page.locator('[data-add-photo]').waitFor();
  const photoOwnerPath = new URL(page.url()).pathname;
  const owner = photoOwnerPath.split('/').pop();
  assert.equal(await page.locator('[data-adopt-tryout]').count(), 1);
  assert.equal(await page.evaluate(() => window.tryoutFault.calls), previousCalls + 1);
  console.log('PASS navigation failure exposes saved outcome and retry continuation without duplicate creation');
  const fixture = await page.evaluate(async () => {
    const { journal } = await import('/src/lib/data/live/journal.svelte.ts');
    const { todayEpochDay } = await import('/src/lib/data/epochDay.ts');
    const today = todayEpochDay();
    await journal.entries.upsertEntry({ epochDay: today, mood: 4, note: 'Tryout related entry' });
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 16;
    return { today, png: canvas.toDataURL('image/png').split(',')[1] };
  });
  await page.locator('[data-mood="4"]').click();
  await page.locator('#tr-feeling-note').fill('Tryout feeling');
  await page.locator('[data-add-feeling]').click();
  await page.locator('[data-feeling]').filter({ hasText: 'Tryout feeling' }).waitFor();
  await page.locator('[data-entry-note]').filter({ hasText: 'Tryout related entry' }).waitFor();
  await page.getByText('Compare with the preceding period', { exact: true }).waitFor();
  const chooser = page.waitForEvent('filechooser');
  await page.locator('[data-add-photo]').click();
  await (await chooser).setFiles({ name: 'tryout.png', mimeType: 'image/png', buffer: Buffer.from(fixture.png, 'base64') });
  const photoRow = page.locator('[data-tryout-photo]');
  await photoRow.waitFor();
  const photoId = await photoRow.getAttribute('data-tryout-photo');
  await navigate('/media/photos');
  await page.locator(`[data-photo-key="${photoId}"] [data-photo-cell]`).waitFor();
  assert.equal(await page.locator(`[data-photo-key="${photoId}"]`).getAttribute('data-photo-source'), 'tryout');
  await page.locator(`[data-photo-key="${photoId}"] [data-photo-cell]`).click();
  assert.match(await page.locator('[data-photo-owner]').getAttribute('href'), new RegExp(`${owner}`));
  await page.locator('[data-photo-owner]').click();
  await page.locator(`[data-tryout-photo="${photoId}"]`).waitFor();
  await page.locator('[data-feeling]').filter({ hasText: 'Tryout feeling' }).waitFor();
  await page.locator('[data-entry-note]').filter({ hasText: 'Tryout related entry' }).waitFor();
  const photo = await page.evaluate(async (owner) => {
    const { journal } = await import('/src/lib/data/live/journal.svelte.ts');
    return (await journal.tryouts.getPhotos(owner))[0];
  }, owner);
  assert.equal(photo.tryoutId, owner);
  assert.equal(photo.epochDay, fixture.today);
  console.log('PASS fixture photo keeps new owner and own day; library, feeling, comparison and related entries remain reachable');

  await page.locator('#tr-label').fill('Uncommitted adoption label');
  await page.locator('[data-adopt-tryout]').click();
  await page.locator('[data-adopt-without-milestone]').click();
  await page.locator('[data-adopt-tryout]').waitFor({ state: 'detached' });
  assert.equal(await page.locator('#tr-label').inputValue(), 'Uncommitted adoption label');
  await navigate('/more');
  await page.locator('[data-discard-record]').click();
  await page.waitForURL('**/more');
  await page.locator('[data-hub-search]').waitFor();
  await navigate(photoOwnerPath);
  await page.locator('#tr-label').waitFor();
  assert.equal(await page.locator('#tr-label').inputValue(), 'Navigation retained');
  assert.notEqual(await page.locator('#tr-end').inputValue(), '');
  await navigate('/more');
  await page.waitForURL('**/more');
  await page.locator('[data-hub-search]').waitFor();
  assert.equal(await page.locator('[data-keep-editing]').count(), 0);
  console.log('PASS adoption retains unrelated draft and advances only committed end date');

  {
    await navigate(photoOwnerPath);
    await page.locator('#tr-label').waitFor();
    await page.locator('#tr-label').fill('Private changed tryout');
    await navigate('/more');
    await page.locator('[data-keep-editing]').waitFor();
    await page.evaluate(async () => {
      const { bootState } = await import('/src/lib/stores/boot.svelte.ts');
      const { lockState } = await import('/src/lib/stores/lock.svelte.ts');
      window.previousAccessMode = bootState.accessMode;
      bootState.accessMode = 'passphrase';
      lockState.unlocked = false;
    });
    await page.locator('#tr-label').waitFor({ state: 'detached' });
    assert.equal(await page.locator('[data-discard-record]').count(), 0);
    await page.evaluate(async () => {
      const { bootState } = await import('/src/lib/stores/boot.svelte.ts');
      const { markUnlocked } = await import('/src/lib/stores/lock.svelte.ts');
      bootState.accessMode = window.previousAccessMode;
      markUnlocked();
    });
    await page.locator('#tr-label').waitFor();
    assert.equal(await page.locator('#tr-label').inputValue(), 'Navigation retained');
    await navigate('/more');
    await page.waitForURL('**/more');
    await page.locator('[data-hub-search]').waitFor();
  }
  console.log('PASS lock immediately conceals draft and discard prompt');
  for (const locale of ['en', 'pl']) {
    await page.evaluate(async (locale) => {
      const { prefs } = await import('/src/lib/data/prefs/store.svelte.ts');
      const { setLocale } = await import('/src/lib/paraglide/runtime.js');
      prefs.language = locale;
      setLocale(locale, { reload: false });
    }, locale);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('[data-app-root][data-boot="ready"]');
    await page.evaluate(() => { document.querySelector('.demo-bar').style.display = 'none'; });
    await navigate(photoOwnerPath);
    await page.locator('#tr-label').waitFor();
    await page.locator('[data-save-tryout]').click();
    await page.locator('[data-tryout-saved]').waitFor();
    assert.equal(await page.locator('[data-tryout-saved]').innerText(), locale === 'en' ? 'Saved.' : 'Zapisano.');
    assert.equal(await page.locator('[data-tryout-saved]').evaluate((el) => el === document.activeElement), true);
    if (gallery) {
      for (const palette of PALETTES) for (const theme of ['light', 'dark']) {
        await page.evaluate(async ({ palette, theme }) => {
          const { prefs } = await import('/src/lib/data/prefs/store.svelte.ts');
          prefs.palette = palette; prefs.theme = theme;
        }, { palette, theme });
        await capture(`${locale}-${palette}-${theme}-saved`);
        await page.locator('#tr-label').fill('Changed tryout');
        await navigate('/more');
        await page.locator('[data-keep-editing]').waitFor();
        await page.locator('[data-sheet]').last().screenshot({ path: `${out}/${locale}-${palette}-${theme}-discard.png` });
        for (const selector of ['[data-keep-editing]', '[data-discard-record]']) {
          const box = await page.locator(selector).boundingBox();
          assert.ok(box.width >= 48 && box.height >= 48);
        }
        await page.locator('[data-keep-editing]').click();
        await page.locator('[data-keep-editing]').waitFor({ state: 'detached' });
        await page.locator('#tr-label').fill('Navigation retained');
        await page.locator('[data-save-tryout]').click();
        await page.locator('[data-tryout-saved]').waitFor();
      }
    }
    for (const zoom of [1, 2]) {
      await page.evaluate(async (zoom) => {
        document.documentElement.style.zoom = String(zoom);
        const { prefs } = await import('/src/lib/data/prefs/store.svelte.ts');
        prefs.disguise = true;
      }, zoom);
      assert.equal(await page.locator('.screen').evaluate((el) => el.scrollWidth <= el.clientWidth + 1), true);
      await page.locator('[data-save-tryout]').click();
      await page.locator('[data-tryout-saved]').waitFor();
      const visible = await page.locator('[data-tryout-saved]').evaluate((el) => {
        const box = el.getBoundingClientRect();
        const app = document.querySelector('[data-app-root]').getBoundingClientRect();
        const nav = document.querySelector('[data-app-nav]')?.getBoundingClientRect();
        return el === document.activeElement && box.top >= app.top && box.bottom <= Math.min(app.bottom, nav?.top ?? app.bottom);
      });
      assert.equal(visible, true, `${locale} ${zoom}x saved result visible and focused`);
      await capture(`${locale}-${zoom}x-disguise-saved`);
      await navigate('/transition/tryouts/new');
      await page.waitForURL('**/transition/tryouts/new');
      await page.locator('#tr-label').waitFor();
      await page.waitForFunction(() => document.querySelector('#tr-label')?.value === '');
      await page.locator('[data-tryout-photo-requirement]').waitFor();
      assert.equal(await page.locator('#tr-label').getAttribute('aria-describedby'), 'tr-label-hint');
      assert.equal(await page.locator('.screen').evaluate((el) => el.scrollWidth <= el.clientWidth + 1), true);
      assert.match(await page.locator('#tr-label-hint').innerText(), locale === 'en' ? /Add a label/ : /Dodaj nazwę/);
      await page.locator('#tr-label').evaluate((el) => el.scrollIntoView({ block: 'center' }));
      await capture(`${locale}-${zoom}x-requirements`);
      await navigate(photoOwnerPath);
      await page.locator('[data-add-photo]').waitFor();
      await page.waitForFunction(() => document.querySelector('#tr-label')?.value === 'Navigation retained');
    }
    await page.evaluate(() => { document.documentElement.style.zoom = '1'; });
    await navigate('/more');
    await page.waitForURL('**/more');
    await page.locator('[data-hub-search]').waitFor();
  }
  console.log('PASS English/Polish guidance and saved focus at 390px, 200% zoom and disguise');
  await navigate(photoOwnerPath);
  await page.locator('[data-add-photo]').waitFor();
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.locator('#tr-label').fill('Motion outcome');
  await feedbackMotion(() => page.locator('[data-save-tryout]').click(), 'feedback-arrival');
  await page.locator('[data-tryout-saved]').waitFor();
  await feedbackMotion(() => page.locator('#tr-label').fill('Changed after motion'), 'feedback-removal');
  await page.locator('[data-tryout-saved]').waitFor({ state: 'detached' });
  console.log('PASS saved feedback opens and closes its height under normal motion');
  assert.deepEqual(errors, []);
} catch (error) {
  console.error(error, errors, await page.locator('body').innerText());
  throw error;
} finally {
  await browser.close();
  await server.close();
}
