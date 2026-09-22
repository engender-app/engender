/* The photo grid stays bounded at scale (phase 12 final-audit ticket 13,
   audit finding P3).

   photo-browse-compare.mjs proves browsing, selection and the wipe on a
   handful of photos - everything that fixture seeds fits in the grid's
   first batch, so it cannot see whether the grid ever stopped rendering
   one node per photo. This is the other half: a library grown past what a
   decade of real use could ever hold, checked for exactly one thing - that
   the DOM never grew past a batch or two of it.

   Run against the dev server (no build needed):
     node tests/photo-grid-batching.mjs */
import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { createServer } from 'vite';
import { launchChromium } from './browser-harness.mjs';

/* Mirrors src/lib/components/kit/batchedList.ts's BATCH. Not imported: this
   is a browser-side probe with no `$lib` alias, the same reason
   batchedList.ts's own test restates it. */
const BATCH = 30;
const PHOTOS = 3000;

const server = await createServer({ server: { port: 0, fs: { allow: [process.cwd(), realpathSync('node_modules')] } } });
await server.listen();
const browser = await launchChromium();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));

try {
  await page.goto(server.resolvedUrls.local[0], { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]');
  if (await page.locator('[data-leave-setup]').count()) {
    await page.locator('[data-leave-setup]').click();
    await page.waitForSelector('[data-home-hello]');
  }

  console.log(`seeding ${PHOTOS} photos (hair progress, the lightest write path photoLibrary reads)...`);
  const libraryCount = await page.evaluate(async (total) => {
    const { journal: j } = await import('/src/lib/data/live/journal.svelte.ts');
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 16;
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg'));
    const full = new Uint8Array(await blob.arrayBuffer());
    const photo = { full, thumb: full };
    // One epoch day per photo, since hairProgress keys a stage by day and
    // the fixture wants distinct rows rather than several photos crowding
    // one day.
    for (let day = 0; day < total; day++) {
      await j.hairProgress.addPhoto(1000 + day, photo);
    }
    return (await j.photoLibrary.inJournal()).length;
  }, PHOTOS);
  assert.ok(
    libraryCount >= PHOTOS,
    `the fixture did not land the photo count it asked for: ${libraryCount} < ${PHOTOS}`
  );

  const paintStartedAt = Date.now();
  await page.goto(`${server.resolvedUrls.local[0]}media/photos`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-photo-key]');
  const paintMs = Date.now() - paintStartedAt;
  console.log(`first grid paint: ${paintMs}ms (dev server, unencrypted - not the recorded budget; see mount-photos)`);

  const renderedAtRest = await page.locator('[data-photo-key]').count();
  assert.ok(
    renderedAtRest <= BATCH * 2,
    `grid painted ${renderedAtRest} tiles for a ${PHOTOS}-photo library; expected at most ${BATCH * 2} (one batch beyond the viewport)`
  );
  assert.ok(renderedAtRest > 0, 'grid painted nothing');

  // The "more" control only shows while a batch remains unrendered - its
  // presence is itself proof the grid did not render all 3000 at once.
  await page.locator('[data-photo-grid-more]').waitFor();

  await page.locator('[data-photo-grid-more]').click();
  await page.waitForFunction(
    (before) => document.querySelectorAll('[data-photo-key]').length > before,
    renderedAtRest
  );
  const renderedAfterGrow = await page.locator('[data-photo-key]').count();
  assert.ok(
    renderedAfterGrow <= BATCH * 3,
    `grid grew past ${BATCH * 3} tiles after one "more" press: ${renderedAfterGrow}`
  );
  assert.ok(renderedAfterGrow > renderedAtRest, 'the "more" control did not grow the grid');

  const countLabel = await page.locator('[data-photo-count]').innerText();
  const countDigits = Number((countLabel.match(/[\d,. ]+/) ?? [''])[0].replace(/[^\d]/g, ''));
  assert.equal(
    countDigits,
    libraryCount,
    `photo count line did not report the full library: "${countLabel}" vs ${libraryCount}`
  );

  assert.deepEqual(errors, []);
  console.log(`PASS Grid bounded at ${PHOTOS} photos: painted ${renderedAtRest} at rest, ${renderedAfterGrow} after growing one batch`);
} finally {
  await page.close();
  await browser.close();
  await server.close();
}
