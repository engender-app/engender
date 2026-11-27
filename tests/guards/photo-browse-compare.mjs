import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import { launchChromium } from '../browser-harness.mjs';

const server = await createServer({ server: { port: 0, fs: { allow: [process.cwd(), realpathSync('node_modules')] } } });
await server.listen();
const browser = await launchChromium();
const page = await browser.newPage({ viewport: { width: 320, height: 844 }, reducedMotion: 'reduce' });
page.setDefaultTimeout(30000);
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
  await page.waitForSelector('[data-app-root][data-boot="ready"]', { timeout: 60000 });
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
    await j.progressPhotos.addPhoto(15002, 'hair', photo);
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
  const hair = fixture.ownerPhotos.find(p => p.source === 'progress' && p.epochDay === 15002);
  const tile = id => page.locator(`[data-photo-key="${id}"] [data-photo-cell]`);
  /* Ticket 52 (audit U44): the change-day action on an entry's or a
     milestone's photograph sat on the tile's bottom-left corner and its
     22px disc covered the first letter of the date under the photo. Every
     owner-dated tile, phone to desktop: neither the action's 48px target
     nor its disc may touch any tile's caption, every caption glyph must
     still answer a tap as its own tile, and the action must answer at its
     own centre. */
  const ownerDated = fixture.ownerPhotos.filter(p => p.source === 'entry' || p.source === 'milestone');
  assert.equal(ownerDated.length, 2);
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    for (const photo of ownerDated) {
      const wrap = page.locator(`[data-photo-key="${photo.id}"]`);
      await wrap.scrollIntoViewIfNeeded();
      // A view transition hit-tests as the root alone until it finishes.
      await page.waitForFunction(() => document.elementFromPoint(innerWidth / 2, innerHeight / 2) !== document.documentElement);
      const clash = await wrap.evaluate((el) => {
        const action = el.querySelector('[data-photo-edit-day]');
        if (!action) return 'no change-day action on an owner-dated tile';
        const target = action.getBoundingClientRect();
        const discSize = parseFloat(getComputedStyle(action, '::before').width);
        const cx = target.left + target.width / 2, cy = target.top + target.height / 2;
        const disc = { left: cx - discSize / 2, right: cx + discSize / 2, top: cy - discSize / 2, bottom: cy + discSize / 2 };
        const hit = document.elementFromPoint(cx, cy)?.closest('[data-photo-edit-day]');
        if (hit !== action) return `the action at ${cx},${cy} (viewport ${innerWidth}x${innerHeight}) answers as ${document.elementFromPoint(cx, cy)?.outerHTML.slice(0, 80)}`;
        const overlaps = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
        for (const caption of document.querySelectorAll('[data-photo-cell] .photo-date')) {
          const range = document.createRange();
          range.selectNodeContents(caption);
          const text = range.getBoundingClientRect();
          if (overlaps(target, text)) return `target ${JSON.stringify(target)} covers caption "${caption.textContent}" ${JSON.stringify(text)}`;
          if (overlaps(disc, text)) return `disc ${JSON.stringify(disc)} covers caption "${caption.textContent}" ${JSON.stringify(text)}`;
          const own = caption.closest('[data-photo-cell]');
          for (const x of [text.left + 1, text.left + text.width / 2, text.right - 1]) {
            const at = document.elementFromPoint(x, text.top + text.height / 2);
            if (at && !own.contains(at)) return `caption "${caption.textContent}" at x=${x} answers as ${at.outerHTML.slice(0, 80)}`;
          }
        }
        return null;
      });
      assert.equal(clash, null, `${width}px, ${photo.source}: ${clash}`);
      assert.equal(await wrap.locator('[data-photo-edit-day]').getAttribute('aria-label'), 'Edit day');
    }
  }
  await page.setViewportSize({ width: 320, height: 844 });
  await page.locator(`[data-photo-key="${ownerDated[0].id}"] [data-photo-edit-day]`).click();
  await page.locator('[data-photo-day-edit-save]').waitFor();
  await page.keyboard.press('Escape');
  await page.locator('[data-photo-day-edit-save]').waitFor({ state: 'detached' });
  for (const photo of fixture.ownerPhotos.filter(p => p.source !== 'video')) {
    await tile(photo.id).focus();
    await page.keyboard.press('Enter');
    await page.locator('[data-photo-viewer] img').waitFor();
    assert.equal(await page.locator('[data-photo-owner]').count(), 1);
    await page.keyboard.press('Escape');
  }
  const video = fixture.ownerPhotos.find(p => p.source === 'video');
  await page.locator(`[data-photo-video="${video.id}"]`).click();
  await page.locator('video').waitFor();
  await page.keyboard.press('Escape');
  // The library is browse-only: comparing moved to Progress photos.
  assert.equal(await page.locator('[data-segment="compare"]').count(), 0);
  assert.equal(await page.locator('[data-compare-open]').count(), 0);

  /* Progress photos, seeded only now so the library's own layout checks
     above ran on the six owners alone: comparing lives on their own screen
     since pre-release-human 12. */
  Object.assign(fixture, await page.evaluate(async () => {
    const { journal: j } = await import('/src/lib/data/live/journal.svelte.ts');
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 16;
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg'));
    const full = new Uint8Array(await blob.arrayBuffer());
    const photo = { full, thumb: full };
    const front = [];
    for (const day of [15010, 15020, 15030]) front.push(await j.progressPhotos.addPhoto(day, 'front', photo));
    const side = await j.progressPhotos.addPhoto(15015, 'side', photo);
    return { front, side };
  }));
  const shot = id => page.locator(`[data-photo-key="${id}"] [data-photo-cell]`);
  await visit('/transition/progress-photos');
  await page.locator('[data-progress-grid="front"]').waitFor();
  await page.locator('[data-segment="compare"]').click();
  assert.match(await page.locator('[data-compare-progress]').innerText(), /0\/2/);
  assert.equal(await page.locator('[data-compare-open]').isDisabled(), true);
  await shot(fixture.front[2]).click();
  assert.match(await page.locator('[data-compare-progress]').innerText(), /1\/2/);
  // A pose is its own timeline: switching it drops the selection.
  await page.locator('[data-segment="side"]').click();
  await page.locator('[data-progress-grid="side"]').waitFor();
  assert.match(await page.locator('[data-compare-progress]').innerText(), /0\/2/);
  await page.locator('[data-segment="front"]').click();
  await shot(fixture.front[2]).click();
  await shot(fixture.front[0]).click();
  assert.match(await page.locator('[data-compare-progress]').innerText(), /2\/2/);
  assert.equal(await shot(fixture.front[1]).isDisabled(), true);
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
  await page.waitForFunction(() => document.activeElement?.matches('[data-compare-open]'));
  assert.equal(await page.locator('[data-app-scroll-region]').evaluate(el => el.scrollTop), scroll);
  await page.locator(`[data-anchor-remove="${fixture.front[0]}"]`).click();
  assert.match(await page.locator('[data-compare-progress]').innerText(), /1\/2/);
  await shot(fixture.front[1]).click();
  if (process.argv.includes('--gallery')) {
    const out = process.env.PHOTO_COMPARE_SHOTS ?? '.claude/photo-compare-shots';
    await mkdir(out, { recursive: true });
    for (const width of [320, 390, 430, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await page.locator('[data-compare-progress]').evaluate(el => el.scrollIntoView({ block: 'start' }));
      await page.screenshot({ path: `${out}/progress-selection-${width}.png` });
      assert.equal(await page.locator('[data-app-scroll-region]').evaluate(el => el.scrollWidth <= el.clientWidth), true);
    }
    await page.setViewportSize({ width: 320, height: 844 });
  }
  await page.locator('[data-compare-open]').click();
  await page.locator('[data-photo-wipe]').waitFor();
  await page.evaluate(async id => {
    const { journal } = await import('/src/lib/data/live/journal.svelte.ts');
    await journal.progressPhotos.deletePhoto(id);
  }, fixture.front[1]);
  await page.getByRole('dialog').getByRole('status').filter({ hasText: 'no longer available' }).waitFor();
  assert.equal(await page.locator('[data-photo-wipe]').count(), 0);
  await page.keyboard.press('Escape');
  await page.locator('[data-anchor-unavailable]').waitFor();
  assert.equal(await page.locator('[data-compare-open]').isDisabled(), true);
  await page.locator(`[data-anchor-remove="${fixture.front[1]}"]`).click();
  await page.evaluate(async () => {
    const { setPhotoFiles } = await import('/src/lib/stores/photoFiles.ts');
    setPhotoFiles({ read: async () => null });
  });
  await shot(fixture.front[0]).click();
  await page.locator('[data-compare-open]').click();
  await page.locator('[data-wipe-unavailable]').waitFor();
  assert.equal(await page.locator('.wipe-photo').count(), 0);
  await page.keyboard.press('Escape');
  await visit('/media/photos');
  await tile(hair.id).click();
  await page.getByRole('status').filter({ hasText: 'couldn’t be read' }).waitFor();
  assert.equal(await page.locator('[data-photo-viewer] img').count(), 0);
  await page.keyboard.press('Escape');
  assert.deepEqual(errors, []);
  console.log('PASS Library browses only; progress photos select two per pose, compare, remove, deleted anchor');
} finally {
  await page.close(); await browser.close(); await server.close();
}
