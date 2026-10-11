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
page.setDefaultTimeout(15000);
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));

async function visit(href) {
  await page.evaluate((href) => {
    const link = document.createElement('a');
    link.href = href; link.id = 'hair-actions-link'; link.textContent = 'Open'; document.body.append(link);
  }, href);
  await page.locator('#hair-actions-link').click();
  await page.evaluate(() => document.querySelector('#hair-actions-link')?.remove());
  await page.waitForURL((url) => url.pathname === href.split(/[?#]/)[0]);
}

try {
  await page.goto(server.resolvedUrls.local[0], { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]', { timeout: 60000 });
  if (await page.locator('[data-leave-setup]').count()) {
    await page.locator('[data-leave-setup]').click();
    await page.waitForSelector('[data-home-hello]');
  }
  await page.evaluate(async () => {
    const { journal } = await import('/src/lib/data/live/journal.svelte.ts');
    for (const photo of await journal.hairProgress.getPhotos()) await journal.hairProgress.deletePhoto(photo.id);
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 32;
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg'));
    const full = new Uint8Array(await blob.arrayBuffer());
    for (const day of [20000, 20001, 20002]) await journal.hairProgress.addPhoto(day, { full, thumb: full });
  });
  await page.evaluate(async () => {
    const { journal } = await import('/src/lib/data/live/journal.svelte.ts');
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 32;
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg'));
    const full = new Uint8Array(await blob.arrayBuffer());
    const session = await journal.hairRemoval.upsertSession({ epochDay: 20000, area: 'chin', method: 'laser', painRating: 1 });
    await journal.hairRemoval.addPhoto(session, { full, thumb: full });
  });
  await page.evaluate(() => {
    document.addEventListener('click', (event) => {
      if (event.target.closest('[data-hair-collage], [data-hair-timelapse]')) {
        window.hairDepartureScroll = document.querySelector('[data-app-scroll-region]').scrollTop;
      }
    }, true);
  });
  await visit('/body/hair-progress#hair-photos');
  await page.locator('[data-add-photo]').waitFor();
  assert.equal(await page.locator('[data-hair-collage]').count(), 1, 'Hair photos offer collage directly');
  await page.locator('[data-hair-compare]').click();
  assert.equal(await page.locator('[data-hair-comparison]').evaluate((node) => node === document.activeElement), true);
  await page.locator('[data-wipe-forward="left"]').click();
  const pair = await page.locator('[data-wipe-date]').allTextContents();
  await page.locator('[data-hair-collage]').scrollIntoViewIfNeeded();
  await page.locator('[data-hair-collage]').scrollIntoViewIfNeeded();
  await page.locator('[data-hair-collage]').click();
  await page.waitForURL('**/media/photos/export?**');
  assert.equal(new URL(page.url()).searchParams.get('source'), 'hair');
  assert.equal(await page.locator('[data-generate]').innerText(), 'Make collage');
  assert.equal(await page.locator('.photo-cell').count(), 3);
  assert.deepEqual(await page.locator('[data-photo-source]').evaluateAll((nodes) => nodes.map((node) => node.dataset.photoSource)), ['hair', 'hair', 'hair']);

  async function returned() {
    await page.waitForURL((url) => url.pathname === '/body/hair-progress');
    await page.locator('[data-wipe-date]').first().waitFor();
    assert.deepEqual(await page.locator('[data-wipe-date]').allTextContents(), pair, 'chosen comparison survives return');
    const expectedScroll = await page.evaluate(() => window.hairDepartureScroll);
    await page.waitForFunction((top) => Math.abs(document.querySelector('[data-app-scroll-region]').scrollTop - top) < 5, expectedScroll);
  }
  await page.locator('[data-screen-back]').click();
  await returned();
  await page.locator('[data-hair-timelapse]').scrollIntoViewIfNeeded();
  await page.locator('[data-hair-timelapse]').click();
  await page.waitForURL('**/media/photos/export?**');
  assert.equal(await page.locator('[data-generate]').innerText(), 'Make timelapse');
  await page.locator('[data-generate]').click();
  await page.locator('[data-progress-stop]').click();
  await returned();

  await page.locator('[data-hair-collage]').scrollIntoViewIfNeeded();
  await page.locator('[data-hair-collage]').click();
  await page.waitForURL('**/media/photos/export?**');
  await page.locator('[data-generate]').click();
  await page.locator('[data-journey-done]').click();
  await returned();

  await page.evaluate(() => {
    window.deliveries = 0;
    navigator.canShare = () => true;
    navigator.share = async () => { window.deliveries++; };
  });
  await page.locator('[data-hair-timelapse]').scrollIntoViewIfNeeded();
  await page.locator('[data-hair-timelapse]').click();
  await page.waitForURL('**/media/photos/export?**');
  await page.locator('[data-generate]').click();
  await page.locator('[data-share]').click();
  await returned();
  assert.equal(await page.evaluate(() => window.deliveries), 1);
  await page.evaluate(() => { navigator.share = async () => { throw new DOMException('Cancelled', 'AbortError'); }; });
  await page.locator('[data-hair-collage]').click();
  await page.waitForURL('**/media/photos/export?**');
  await page.locator('[data-generate]').click();
  await page.locator('[data-share]').click();
  await returned();
  assert.equal(new URL(page.url()).hash, '#hair-photos', 'return keeps original Hair route');
  console.log('PASS source excludes hair-removal, requested formats, compare focus, picker/encoding cancel, Done, successful delivery, scroll and pair return');

  const out = '.claude/hair-progress-photo-actions-shots';
  const gallery = process.argv.includes('--gallery');
  if (gallery) {
    await mkdir(out, { recursive: true });
    await page.evaluate(() => { document.querySelector('.demo-bar')?.remove(); document.body.classList.remove('has-demo-bar'); });
    for (const palette of PALETTES) for (const theme of ['light', 'dark']) {
      await page.evaluate(async ({ palette, theme }) => {
        const { prefs } = await import('/src/lib/data/prefs/store.svelte.ts'); prefs.palette = palette; prefs.theme = theme;
        document.querySelector('[data-hair-collage]').scrollIntoView({ block: 'start', behavior: 'instant' });
      }, { palette, theme });
      await page.screenshot({ path: `${out}/${palette}-${theme}.png` });
    }
  }
  for (const locale of ['en', 'pl']) {
    await page.evaluate((locale) => localStorage.setItem('PARAGLIDE_LOCALE', locale), locale);
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('[data-hair-collage]').waitFor();
    await page.evaluate(() => { document.querySelector('.demo-bar')?.remove(); document.body.classList.remove('has-demo-bar'); });
    for (const width of [195, 320, 390, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      await page.locator('[data-hair-collage]').scrollIntoViewIfNeeded();
      for (const action of ['compare', 'collage', 'timelapse']) {
        const box = await page.locator(`[data-hair-${action}]`).boundingBox();
        assert.ok(box.height >= 48 && box.x >= 0 && box.x + box.width <= width, `${locale} ${width}px ${action} fits and meets touch floor`);
      }
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      if (gallery) await page.screenshot({ path: `${out}/${locale}-${width}.png` });
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(async () => {
    const { prefs } = await import('/src/lib/data/prefs/store.svelte.ts'); prefs.disguise = true;
  });
  if (gallery) await page.screenshot({ path: `${out}/disguise.png` });
  await page.evaluate(async () => {
    const { journal } = await import('/src/lib/data/live/journal.svelte.ts');
    const photos = await journal.hairProgress.getPhotos();
    for (const photo of photos.slice(1)) await journal.hairProgress.deletePhoto(photo.id);
  });
  await page.waitForFunction(() => document.querySelector('[data-hair-compare]')?.disabled);
  assert.equal(await page.locator('[data-hair-collage]').isDisabled(), false);
  assert.equal(await page.locator('[data-hair-timelapse]').isDisabled(), false);
  assert.match(await page.locator('.screen').innerText(), /co najmniej dwa zdjęcia/);
  await page.locator('[data-hair-timelapse]').scrollIntoViewIfNeeded();
  await page.locator('[data-hair-timelapse]').click();
  await page.waitForURL('**/media/photos/export?**');
  await page.waitForFunction(() => document.querySelectorAll('.photo-cell').length === 1);
  await page.locator('[data-generate]').click();
  await page.locator('[data-journey-done]').click();
  await page.waitForURL((url) => url.pathname === '/body/hair-progress');
  await page.evaluate(async () => {
    const { journal } = await import('/src/lib/data/live/journal.svelte.ts');
    for (const photo of await journal.hairProgress.getPhotos()) await journal.hairProgress.deletePhoto(photo.id);
  });
  await page.waitForFunction(() => document.querySelector('[data-hair-collage]')?.disabled);
  assert.equal(await page.locator('[data-hair-timelapse]').isDisabled(), true);
  assert.match(await page.locator('.screen').innerText(), /Dodaj zdjęcie, żeby utworzyć kolaż lub film/);
  if (gallery) await page.screenshot({ path: `${out}/zero-photos.png` });
  await page.addInitScript(() => { window.MediaRecorder = undefined; });
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('[data-hair-collage]').waitFor();
  assert.equal(await page.locator('[data-hair-timelapse]').isDisabled(), true);
  assert.match(await page.locator('.screen').innerText(), /nie nagra filmu/);
  console.log('PASS one-photo timelapse, zero-photo explanation, recording capability, both locales at 195/320/390/1280px');
  assert.deepEqual(errors, []);
} catch (error) {
  await mkdir('.claude/hair-progress-photo-actions-shots', { recursive: true });
  await page.screenshot({ path: '.claude/hair-progress-photo-actions-shots/failure.png' });
  console.error('Page errors:', errors);
  console.error('Visible screen:', await page.locator('body').innerText());
  throw error;
} finally {
  await browser.close();
  await server.close();
}
