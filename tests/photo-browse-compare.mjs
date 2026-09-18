import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import { launchChromium } from './browser-harness.mjs';

const server = await createServer({ server: { port: 0, fs: { allow: [process.cwd(), realpathSync('node_modules')] } } });
await server.listen();
const browser = await launchChromium();
const page = await browser.newPage({ viewport: { width: 320, height: 844 }, reducedMotion: 'reduce' });
page.setDefaultTimeout(10000);
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
async function visit(href) {
  await page.evaluate((href) => {
    const link = document.createElement('a');
    link.href = href; link.id = 'source-proof-link'; link.textContent = 'Open';
    document.querySelector('#source-proof-link')?.remove(); document.body.append(link);
  }, href);
  await page.locator('#source-proof-link').click();
  await page.evaluate(() => document.querySelector('#source-proof-link')?.remove());
}
try {
  await page.goto(server.resolvedUrls.local[0], { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]');
  if (await page.locator('[data-leave-setup]').count()) {
    await page.locator('[data-leave-setup]').click();
    await page.waitForSelector('[data-home-hello]');
  }
  const fixture = await page.evaluate(async () => {
    const { journal: j } = await import('/src/lib/data/live/journal.svelte.ts');
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 16;
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg'));
    const full = new Uint8Array(await blob.arrayBuffer());
    const photo = { full, thumb: full };
    const milestone = await j.milestones.upsertMilestone({ name: 'Exact milestone', epochDay: 15000 });
    const procedure = await j.procedures.upsertProcedure({ name: 'Exact procedure' });
    await j.milestones.upsertMilestone({ id: milestone, name: 'Exact milestone', epochDay: 15000, photo: { action: 'replace', photo } });
    const entry = await j.entries.upsertEntry({ epochDay: 15001, mood: 4, note: 'Exact entry', attachVideos: [new Uint8Array([1])] });
    await j.photos.attach({ entryId: entry }, photo);
    await j.hairProgress.addPhoto(15002, photo);
    const session = await j.hairRemoval.upsertSession({ epochDay: 15003, area: 'chin', method: 'laser', painRating: 2 });
    await j.hairRemoval.addPhoto(session, photo);
    const tryout = await j.tryouts.upsertTryout({ kind: 'name', label: 'Exact tryout', startEpochDay: 15004, endEpochDay: null });
    await j.tryouts.addPhoto(tryout, 15004, photo);
    await j.procedures.addPhoto(procedure, 15005, photo);
    const library = await j.photoLibrary.inJournal();
    const ownerPhotos = library.filter((p) => p.epochDay >= 15000 && p.epochDay <= 15005);
    return { ownerPhotos };
  });

  await visit('/media/photos');
  const entry = fixture.ownerPhotos.find(p => p.source === 'entry');
  const hair = fixture.ownerPhotos.find(p => p.source === 'hair');
  const tile = id => page.locator(`[data-photo-key="${id}"] [data-photo-cell]`);
  for (const photo of fixture.ownerPhotos.filter(p => p.source !== 'video')) {
    await tile(photo.id).focus();
    await page.keyboard.press('Enter');
    await page.locator('[data-photo-viewer] img').waitFor();
    assert.equal(await page.locator('[data-photo-owner]').count(), 1);
    await page.keyboard.press('Escape');
  }
  await page.locator('[data-segment="compare"]').click();
  assert.match(await page.locator('[data-compare-progress]').innerText(), /0\/2/);
  assert.equal(await page.locator('[data-compare-open]').isDisabled(), true);
  await tile(entry.id).click();
  assert.match(await page.locator('[data-compare-progress]').innerText(), /1\/2/);
  const video = fixture.ownerPhotos.find(p => p.source === 'video');
  await page.locator(`[data-photo-video="${video.id}"]`).click();
  await page.locator('video').waitFor();
  await page.keyboard.press('Escape');
  assert.match(await page.locator('[data-compare-progress]').innerText(), /1\/2/);
  await page.locator('[data-photo-chip="hair"]').click();
  await tile(hair.id).click();
  assert.match(await page.locator('[data-compare-progress]').innerText(), /2\/2/);
  const launch = page.locator('[data-compare-open]');
  await launch.focus();
  const scroll = await page.locator('[data-app-scroll-region]').evaluate(el => el.scrollTop);
  await page.keyboard.press('Enter');
  await page.locator('[data-photo-wipe]').waitFor();
  const slider = page.getByRole('slider', { name: 'Comparison divider' });
  await slider.focus();
  await slider.press('Home');
  await slider.press('ArrowRight');
  assert.equal(await slider.getAttribute('aria-valuenow'), '5');
  await page.keyboard.press('Escape');
  assert.equal(new URL(page.url()).searchParams.get('source'), 'hair');
  await page.waitForFunction(() => document.activeElement?.matches('[data-compare-open]'));
  assert.equal(await page.locator('[data-app-scroll-region]').evaluate(el => el.scrollTop), scroll);
  await page.locator(`[data-anchor-remove="${entry.id}"]`).click();
  assert.match(await page.locator('[data-compare-progress]').innerText(), /1\/2/);
  await page.locator('[data-photo-chip="everything"]').click();
  await tile(entry.id).click();
  if (process.argv.includes('--gallery')) {
    const out = process.env.PHOTO_COMPARE_SHOTS ?? '.claude/photo-compare-shots';
    await mkdir(out, { recursive: true });
    for (const language of ['en', 'pl']) for (const width of [320, 390, 430, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(async language => {
        const { prefs } = await import('/src/lib/data/prefs/store.svelte.ts');
        const { setLocale } = await import('/src/lib/paraglide/runtime.js');
        prefs.language = language;
        setLocale(language, { reload: false });
      }, language);
      await page.reload({ waitUntil: 'networkidle' });
      await page.locator('[data-app-root][data-boot="ready"]').waitFor();
      await page.evaluate(() => {
        document.querySelector('.demo-bar')?.remove();
        document.body.classList.remove('has-demo-bar');
        for (const toast of document.querySelectorAll('[data-toast]')) toast.remove();
      });
      await page.locator('[data-segment="browse"]').click();
      await page.locator('[data-segment="compare"]').click();
      await tile(entry.id).click();
      await tile(hair.id).click();
      await page.locator('[data-compare-progress]').evaluate(el => el.scrollIntoView({ block: 'start' }));
      assert.equal(await page.locator('html').getAttribute('lang'), language);
      assert.equal(await page.locator('[data-compare-open]').isEnabled(), true);
      await page.screenshot({ path: `${out}/selection-${language}-${width}.png` });
      assert.equal(await page.locator('[data-app-scroll-region]').evaluate(el => el.scrollWidth <= el.clientWidth), true);
    }
    await page.evaluate(async () => {
      const { prefs } = await import('/src/lib/data/prefs/store.svelte.ts');
      prefs.language = 'en';
      const { setLocale } = await import('/src/lib/paraglide/runtime.js');
      setLocale('en', { reload: false });
    });
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('[data-segment="browse"]').click();
    await page.locator('[data-segment="compare"]').click();
    await tile(entry.id).click();
    await tile(hair.id).click();
  }
  await page.locator('[data-compare-open]').click();
  await page.locator('[data-photo-wipe]').waitFor();
  await page.evaluate(async id => {
    const { journal } = await import('/src/lib/data/live/journal.svelte.ts');
    await journal.entries.deleteEntry(id);
  }, entry.ownerId);
  await page.getByRole('dialog').getByRole('status').filter({ hasText: 'no longer available' }).waitFor();
  assert.equal(await page.locator('[data-photo-wipe]').count(), 0);
  await page.keyboard.press('Escape');
  await page.locator('[data-anchor-unavailable]').waitFor();
  assert.equal(await page.locator('[data-compare-open]').isDisabled(), true);
  await page.locator(`[data-anchor-remove="${entry.id}"]`).click();
  await page.locator('[data-segment="browse"]').click();
  await page.evaluate(async () => {
    const { setPhotoFiles } = await import('/src/lib/stores/photoFiles.ts');
    setPhotoFiles({ read: async () => null });
  });
  await tile(hair.id).click();
  await page.getByRole('status').filter({ hasText: 'couldn’t be read' }).waitFor();
  assert.equal(await page.locator('[data-photo-viewer] img').count(), 0);
  await page.keyboard.press('Escape');
  await page.locator('[data-segment="compare"]').click();
  await tile(hair.id).click();
  await tile(fixture.ownerPhotos.find(p => p.source === 'tryout').id).click();
  await page.locator('[data-compare-open]').click();
  await page.locator('[data-wipe-unavailable]').waitFor();
  assert.equal(await page.locator('.wipe-photo').count(), 0);
  assert.deepEqual(errors, []);
  console.log('PASS Browse opens photo; explicit selection; filters; remove; deleted anchor');
} finally {
  await page.close(); await browser.close(); await server.close();
}
