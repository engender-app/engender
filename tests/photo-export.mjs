import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import { PALETTES } from './palettes.mjs';
import { launchChromium, fillDate } from './browser-harness.mjs';

const server = await createServer({ server: { port: 0, fs: { allow: [process.cwd(), realpathSync('node_modules')] } } });
await server.listen();
const browser = await launchChromium();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
page.setDefaultTimeout(15000);
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
try {
  await page.goto(server.resolvedUrls.local[0], { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]');
  if (await page.locator('[data-leave-setup]').count()) {
    await page.locator('[data-leave-setup]').click();
    await page.waitForSelector('[data-home-hello]');
  }
  await page.evaluate(async () => {
    const { journal } = await import('/src/lib/data/live/journal.svelte.ts');
    for (const colour of ['#ff0000', '#00ff00']) {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 360;
      const ctx = canvas.getContext('2d'); ctx.fillStyle = colour; ctx.fillRect(0, 0, 360, 360);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg'));
      const full = new Uint8Array(await blob.arrayBuffer());
      await journal.hairProgress.addPhoto(10000, { full, thumb: full });
    }
    const link = document.createElement('a'); link.href = '/media/photos/export?source=hair';
    link.id = 'export-proof-link'; link.textContent = 'Open'; document.body.append(link);
  });
  await page.locator('#export-proof-link').click();
  await page.locator('[data-generate]').waitFor();
  await fillDate(page, '#pj-start', '1997-05-19');
  await fillDate(page, '#pj-end', '1997-05-19');
  await page.waitForFunction(() => document.querySelectorAll('.photo-cell').length === 2);
  const format = page.getByRole('radiogroup', { name: 'What to make' });
  assert.ok((await format.boundingBox()).y < (await page.locator('.photo-grid').boundingBox()).y, 'format precedes photos');
  assert.equal(await page.locator('[data-generate]').innerText(), 'Make collage');
  assert.match(await page.locator('[data-app-savebar]').innerText(), /Selected photos: 2/);
  await page.locator('.photo-cell').first().click();
  await page.getByRole('radio', { name: 'Timelapse', exact: true }).click();
  assert.equal(await page.locator('.photo-cell[aria-pressed="true"]').count(), 1);
  assert.equal(await page.locator('[data-generate]').innerText(), 'Make timelapse');
  await page.getByRole('radio', { name: 'Collage', exact: true }).focus();
  await page.keyboard.press('Space');
  assert.equal(await page.locator('.photo-cell[aria-pressed="true"]').count(), 1);
  await page.evaluate(() => {
    window.exportBlobs = [];
    window.deliveries = 0;
    const create = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (blob) => { window.exportBlobs.push(blob); return create(blob); };
    navigator.share = async () => { window.deliveries++; };
    navigator.canShare = () => true;
  });
  for (const output of ['collage', 'timelapse']) {
    if (output === 'timelapse') await page.getByRole('radio', { name: 'Timelapse', exact: true }).click();
    console.log('Generating', output);
    await page.locator('[data-generate]').click();
    await page.locator('[data-share]').waitFor();
    console.log('Preview ready', output);
    const result = await page.evaluate(async (output) => {
      const mime = output === 'collage' ? 'image/jpeg' : 'video/webm';
      const blob = window.exportBlobs.findLast((blob) => blob.type.startsWith(mime));
      if (!blob) throw new Error('Missing generated ' + mime);
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
      const ctx = canvas.getContext('2d');
      if (output === 'collage') {
        const image = await createImageBitmap(blob);
        ctx.drawImage(image, image.width / 2, image.height / 2, 1, 1, 0, 0, 1, 1);
        image.close();
      } else {
        const video = document.createElement('video'); video.muted = true;
        video.src = URL.createObjectURL(blob);
        const frame = new Promise((resolve, reject) => {
          video.requestVideoFrameCallback(resolve);
          setTimeout(() => reject(new Error('Video frame timeout')), 10000);
        });
        await video.play();
        await frame;
        ctx.drawImage(video, video.videoWidth / 2, video.videoHeight / 2, 1, 1, 0, 0, 1, 1);
        video.pause(); URL.revokeObjectURL(video.src);
      }
      return { colour: [...ctx.getImageData(0, 0, 1, 1).data], deliveries: window.deliveries };
    }, output);
    assert.ok(result.colour[1] > 200 && result.colour[0] < 40, 'output contains selected green photo, excludes red');
    assert.equal(result.deliveries, 0, 'generation never shares');
    await page.locator('[data-again]').click();
    assert.equal(await page.locator('.photo-cell[aria-pressed="true"]').count(), 1);
    assert.equal(await page.locator('#pj-start').inputValue(), '1997-05-19');
    assert.equal(await page.locator('#pj-end').inputValue(), '1997-05-19');
    assert.match(page.url(), /source=hair/);
    assert.equal(await page.getByRole('radio', { name: output === 'collage' ? 'Collage' : 'Timelapse', exact: true }).getAttribute('aria-checked'), 'true');
  }
  await page.locator('.photo-cell[aria-pressed="true"]').click();
  assert.equal(await page.locator('[data-generate]').isDisabled(), true);
  assert.match(await page.locator('.screen').innerText(), /Select at least one photo/);
  assert.match(await page.locator('[data-app-savebar]').innerText(), /Selected photos: 0/);
  await page.locator('.photo-cell').first().click();
  await page.getByRole('radio', { name: 'Collage', exact: true }).click();
  await page.locator('[data-generate]').click();
  await page.locator('[data-share]').click();
  assert.equal(await page.evaluate(() => window.deliveries), 1, 'only explicit sharing delivers');
  await page.locator('[data-again]').click();
  console.log('PASS formats, selected output pixels, exclusions, preview return, zero selection, explicit sharing');
  await page.evaluate(() => {
    document.querySelector('.demo-bar')?.remove();
    document.body.classList.remove('has-demo-bar');
    for (const toast of document.querySelectorAll('[data-toast]')) toast.remove();
  });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 });
  assert.equal(await page.evaluate(() => visualViewport.scale), 2);
  await page.getByRole('radio', { name: 'Timelapse', exact: true }).focus();
  await page.keyboard.press('Space');
  assert.equal(await page.locator('.photo-cell[aria-pressed="true"]').count(), 1);
  await page.getByRole('radio', { name: 'Collage', exact: true }).focus();
  await page.keyboard.press('Space');
  await page.locator('[data-generate]').focus();
  await page.keyboard.press('Enter');
  await page.locator('[data-share]').waitFor();
  await page.locator('[data-again]').focus();
  await page.keyboard.press('Enter');
  await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });
  console.log('PASS format, generate and preview return at 200% page scale');
  await page.locator('.photo-cell[aria-pressed="false"]').click();
  const gallery = process.argv.includes('--gallery');
  const out = '.claude/photo-export-shots';
  if (gallery) await mkdir(out, { recursive: true });
  for (const count of [36, 200]) {
    await page.evaluate(async (count) => {
      const { journal } = await import('/src/lib/data/live/journal.svelte.ts');
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 16;
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg'));
      const full = new Uint8Array(await blob.arrayBuffer());
      const existing = await journal.hairProgress.getPhotosOnDay(10000);
      for (let i = existing.length; i < count; i++) await journal.hairProgress.addPhoto(10000, { full, thumb: full });
    }, count);
    await page.waitForFunction((count) => document.querySelectorAll('.photo-cell').length === count, count);
    assert.match(await page.locator('[data-app-savebar]').innerText(), new RegExp('Selected photos: ' + count));
    await page.locator('.photo-cell').last().scrollIntoViewIfNeeded();
    const action = await page.locator('[data-generate]').boundingBox();
    assert.ok(action.y >= 0 && action.y + action.height <= 844, 'action remains visible at grid end');
    await page.locator('[data-segment="timelapse"]').click();
    await page.locator('[data-generate]').click();
    await page.locator('[data-progress-stop]').click();
    await page.waitForFunction(() => !document.querySelector('[data-generate]').disabled);
    assert.equal(await page.locator('[data-share]').count(), 0, 'cancel leaves no preview');
    assert.equal(await page.locator('.photo-cell[aria-pressed="true"]').count(), count);
    await page.locator('[data-segment="collage"]').click();
    if (gallery) {
      await page.evaluate(() => {
        document.querySelector('.demo-bar')?.remove();
        document.body.classList.remove('has-demo-bar');
        document.querySelector('[data-app-scroll-region]').scrollTop = 0;
      });
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${out}/${count}-photos.png` });
    }
  }
  if (gallery) {
    for (const palette of PALETTES) for (const theme of ['light', 'dark']) {
      await page.evaluate(async ({ palette, theme }) => {
        const { prefs } = await import('/src/lib/data/prefs/store.svelte.ts');
        prefs.palette = palette; prefs.theme = theme;
      }, { palette, theme });
      await page.waitForTimeout(200);
      await page.screenshot({ path: `${out}/${palette}-${theme}.png` });
    }
    for (const width of [320, 430, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      await page.screenshot({ path: `${out}/width-${width}.png` });
      const button = await page.locator('[data-generate]').boundingBox();
      assert.ok(button.height >= 48 && button.x >= 0 && button.x + button.width <= width);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(async () => {
      const { prefs } = await import('/src/lib/data/prefs/store.svelte.ts'); prefs.disguise = true;
    });
    await page.screenshot({ path: `${out}/disguise.png` });
  }
  await page.evaluate(async () => {
    const { bootState } = await import('/src/lib/stores/boot.svelte.ts');
    const { attachJournal, journalIsOpen } = await import('/src/lib/data/live/journal.svelte.ts');
    bootState.journal.photoLibrary.inJournal = async () => [];
    attachJournal(bootState.journal); journalIsOpen();
  });
  await page.waitForFunction(() => document.querySelectorAll('.photo-cell').length === 0);
  assert.equal(await page.locator('[data-generate]').isDisabled(), true);
  assert.match(await page.locator('[data-app-savebar]').innerText(), /Selected photos: 0/);
  assert.equal(await page.getByRole('radiogroup', { name: 'What to make' }).count(), 1);
  if (gallery) await page.screenshot({ path: `${out}/empty-library.png` });
  await page.evaluate(() => localStorage.setItem('PARAGLIDE_LOCALE', 'pl'));
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('[data-generate]').waitFor();
  assert.equal(await page.locator('[data-generate]').innerText(), 'Utwórz kolaż');
  assert.match(await page.locator('[data-app-savebar]').innerText(), /Wybrane zdjęcia:/);
  if (gallery) {
    await page.evaluate(() => {
      document.querySelector('.demo-bar')?.remove(); document.body.classList.remove('has-demo-bar');
      for (const toast of document.querySelectorAll('[data-toast]')) toast.remove();
    });
    await page.setViewportSize({ width: 320, height: 844 });
    await page.screenshot({ path: `${out}/polish-320.png` });
  }
  await page.addInitScript(() => { window.MediaRecorder = undefined; });
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('[data-generate]').waitFor();
  assert.equal(await page.locator('[data-segment="timelapse"]').count(), 0);
  assert.equal(await page.locator('[data-generate]').innerText(), 'Utwórz kolaż');
  console.log('PASS Polish action/count and browser without video recording');
  assert.deepEqual(errors, []);
  console.log('PASS 36/200 photos, persistent action, generation cancel, empty library');
} finally {
  await browser.close();
  await server.close();
}
