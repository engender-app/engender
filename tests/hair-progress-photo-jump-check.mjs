import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import { launchChromium } from './browser-harness.mjs';

const outDir = '.claude/hair-progress-shots';
await mkdir(outDir, { recursive: true });

const server = await createServer({
  cacheDir: '.svelte-kit/hair-progress-jump-vite',
  server: { port: 0, fs: { allow: [process.cwd(), realpathSync('node_modules')] } }
});
await server.listen();

const browser = await launchChromium();
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  reducedMotion: 'reduce'
});
page.setDefaultTimeout(15000);

const errors = [];
page.on('pageerror', (err) => errors.push(err.message));

async function visit(href) {
  await page.evaluate((url) => {
    const link = document.createElement('a');
    link.href = url;
    link.id = 'jump-test-link';
    link.textContent = 'Open';
    document.body.append(link);
  }, href);
  await page.locator('#jump-test-link').click();
  await page.evaluate(() => document.querySelector('#jump-test-link')?.remove());
  await page.waitForURL((url) => url.pathname === href.split('#')[0]);
  await page.waitForTimeout(200);
}

try {
  await page.goto(server.resolvedUrls.local[0], { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]');
  if (await page.locator('[data-leave-setup]').count()) {
    await page.locator('[data-leave-setup]').click();
    await page.waitForSelector('[data-home-hello]');
  }
  // Dismiss storage notice if present
  const noticeDismiss = page.locator('[aria-label="Dismiss"], [data-notice-dismiss]');
  if (await noticeDismiss.count()) {
    try { await noticeDismiss.first().click(); } catch {}
  }

  // Seed fixture with a stage and a photo so both sections have content
  await page.evaluate(async () => {
    const { journal: j } = await import('/src/lib/data/live/journal.svelte.ts');
    await j.hairProgress.upsertStage({
      epochDay: 20000,
      scale: 'norwood_hamilton',
      stage: '3v',
      description: ''
    });

    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 400;
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg'));
    const bytes = new Uint8Array(await blob.arrayBuffer());
    await j.hairProgress.addPhoto(20000, {
      full: bytes,
      thumb: bytes
    });
  });

  // Navigate to hair-progress
  await visit('/body/hair-progress');
  await page.waitForSelector('[data-hair-jump]');
  await page.waitForSelector('#hair-staging');
  await page.waitForSelector('#hair-photos');

  // Verify initial state: active segment is staging
  const initialSegment = await page.locator('[data-hair-jump] [data-segment="staging"]').getAttribute('aria-checked');
  assert.equal(initialSegment, 'true', 'Staging segment should be active initially');

  // Take screenshot at top (Staging in view)
  await page.screenshot({ path: `${outDir}/01-staging-initial.png` });

  // Jump to photos via Segmented control
  await page.locator('[data-hair-jump] [data-segment="photos"]').click();
  await page.waitForTimeout(400);

  // Check that photos section is near the top of the viewport
  const photosRect = await page.locator('#hair-photos').boundingBox();
  assert(photosRect && photosRect.y < 300, `Photos heading should be scrolled into view, got y=${photosRect?.y}`);

  // Check active segment updated
  const photosSegment = await page.locator('[data-hair-jump] [data-segment="photos"]').getAttribute('aria-checked');
  assert.equal(photosSegment, 'true', 'Photos segment should be active after jumping');

  // Check that keyboard focus landed on Photos heading or its inner heading
  const focusedTag = await page.evaluate(() => {
    const el = document.activeElement;
    return {
      tag: el?.tagName.toLowerCase(),
      id: el?.id || el?.closest('[id]')?.id,
      text: el?.textContent?.trim()
    };
  });
  assert(
    focusedTag.id === 'hair-photos' || focusedTag.tag === 'h2',
    `Focus should land on photos heading, got tag=${focusedTag.tag} id=${focusedTag.id}`
  );

  // Take screenshot of photos view
  await page.screenshot({ path: `${outDir}/02-photos-jumped.png` });

  // Verify photo section actions are present and interactive
  assert(await page.locator('[data-add-photo]').count() > 0, 'Add photo control must be present in photos section');

  // Jump back to staging via the action button on the photo section heading
  await page.locator('[data-jump-staging]').click();
  await page.waitForTimeout(400);

  // Check that staging section is scrolled into view
  const stagingRect = await page.locator('#hair-staging').boundingBox();
  assert(stagingRect && stagingRect.y < 300, `Staging heading should be scrolled back into view, got y=${stagingRect?.y}`);

  // Check active segment reverted to staging
  const returnedSegment = await page.locator('[data-hair-jump] [data-segment="staging"]').getAttribute('aria-checked');
  assert.equal(returnedSegment, 'true', 'Staging segment should be active after jumping back');

  // Take screenshot after return
  await page.screenshot({ path: `${outDir}/03-staging-returned.png` });

  // Verify hash direct jump
  await page.evaluate(() => { window.location.hash = '#hair-photos'; });
  await page.waitForTimeout(400);
  const hashPhotosRect = await page.locator('#hair-photos').boundingBox();
  assert(hashPhotosRect && hashPhotosRect.y < 300, 'Direct hash link should scroll to photos');

  // Verify desktop layout (1024x768)
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.locator('[data-hair-jump] [data-segment="staging"]').click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${outDir}/04-desktop-staging.png` });

  assert.equal(errors.length, 0, `Page errors encountered: ${errors.join(', ')}`);
  console.log('PASS hair progress photo jump real-browser check');
} finally {
  await browser.close();
  await server.close();
}
