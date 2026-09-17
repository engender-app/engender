import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { PALETTES } from './palettes.mjs';
import { createServer } from 'vite';
import { makePdf } from './pdf-fixture.mjs';
import { launchChromium } from './browser-harness.mjs';

export async function verifySourceRecordLinks({ gallery = false } = {}) {
const server = await createServer({ server: { port: 0, fs: { allow: [process.cwd(), realpathSync('node_modules')] } } });
await server.listen();
const browser = await launchChromium();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
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
  const fixture = await page.evaluate(async (pdfBytes) => {
    const { journal: j } = await import('/src/lib/data/live/journal.svelte.ts');
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 16;
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg'));
    const full = new Uint8Array(await blob.arrayBuffer());
    const photo = { full, thumb: full };
    const milestone = await j.milestones.upsertMilestone({ name: 'Exact milestone', epochDay: 15000 });
    const doc = await j.documents.addDocument({ epochDay: 20000, title: 'Source proof' }, { pdfBytes: new Uint8Array(pdfBytes), thumb: full });
    await j.documents.setDocumentTarget(doc, { kind: 'milestone', id: milestone });
    const procedure = await j.procedures.upsertProcedure({ name: 'Exact procedure' });
    const episodeInput = { drug: 'Exact episode', ester: null, dose: 2, doseUnit: 'mg', route: 'oral', interval: 'daily', startEpochDay: 14000, endEpochDay: 14001, endReason: null };
    const episode = await j.regimen.upsertEpisode(episodeInput);
    for (let i = 0; i < 75; i++) await j.regimen.upsertEpisode({ ...episodeInput, drug: `Later episode ${i}`, startEpochDay: 16000 + i });
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
    const { POLISH_PACK } = await import('/src/lib/data/roadmap.ts');
    return { milestone, doc, procedure, episode, goal: POLISH_PACK.goals.at(-1).key, ownerPhotos };
  }, [...makePdf(['First page', 'Second page'])]);
  await visit(`/media/documents/${fixture.doc}`);
  await page.locator('[data-page-forward]').click();
  await page.locator('[data-row-main="document-target"]').first().click();
  await page.locator('#ms-name').waitFor();
  assert.equal(await page.locator('#ms-name').inputValue(), 'Exact milestone');
  await page.locator('#ms-name').fill('Edited exact milestone');
  await page.locator('[data-save-milestone]').click();
  await page.locator('[data-source-return]').click();
  await page.locator('[data-row-main="document-target"]').waitFor();
  assert.match(await page.locator('[data-row-main="document-target"]').innerText(), /Edited exact milestone/);
  assert.equal(await page.locator('[data-page-forward]').isDisabled(), true, 'return restores PDF page 2');
  for (const kind of ['procedure', 'episode', 'goal']) {
    await page.evaluate(async ({ doc, kind, id }) => {
      const { journal } = await import('/src/lib/data/live/journal.svelte.ts');
      await journal.documents.setDocumentTarget(doc, { kind, id });
    }, { doc: fixture.doc, kind, id: fixture[kind] });
    await page.waitForFunction((kind) => document.querySelector('[data-row-main="document-target"]')?.getAttribute('href')?.includes(kind === 'procedure' ? 'surgery' : kind === 'episode' ? 'regimen' : 'roadmap'), kind);
    await page.locator('[data-row-main="document-target"]').click();
    if (kind === 'procedure') await page.locator(`[data-recovery-log="${fixture.procedure}"]`).waitFor();
    if (kind === 'episode') {
      assert.equal(await page.locator('[name="regimen-drug"]').inputValue(), 'Exact episode');
      await page.keyboard.press('Escape');
      await page.locator(`[data-episode="${fixture.episode}"]`).waitFor();
    }
    if (kind === 'goal') {
      await page.locator(`[data-goal-sheet-status="${fixture.goal}"]`).waitFor();
      await page.keyboard.press('Escape');
    }
    await page.locator('[data-source-return]').click();
    await page.locator('[data-row-main="document-target"]').waitFor();
  }
  await visit('/media/photos');
  await page.locator('[data-photo-cell]').nth(0).click();
  await page.locator('[data-photo-cell]').nth(1).click();
  for (const photo of fixture.ownerPhotos) {
    console.log(`Checking photo owner ${photo.source}`);
    await page.locator(`[data-photo-view="${photo.id}"]`).click();
    if (gallery && photo.source === 'milestone') {
      await page.locator('[data-photo-owner]').waitFor();
      await page.locator('[data-photo-viewer] img').waitFor();
      await page.evaluate(() => { document.querySelector('.demo-bar').style.display = 'none'; });
      await mkdir('.claude/source-record-shots', { recursive: true });
      for (const palette of PALETTES) for (const theme of ['light', 'dark']) {
        await page.evaluate(async ({ palette, theme }) => {
          const { prefs } = await import('/src/lib/data/prefs/store.svelte.ts');
          prefs.palette = palette; prefs.theme = theme;
        }, { palette, theme });
        await page.waitForTimeout(200);
        await page.screenshot({ path: `.claude/source-record-shots/viewer-${palette}-${theme}.png` });
      }
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.waitForTimeout(200);
      await page.screenshot({ path: '.claude/source-record-shots/viewer-desktop.png' });
      await page.setViewportSize({ width: 390, height: 844 });
    }
    await page.locator('[data-photo-owner]').click();
    await page.waitForURL((url) => url.pathname !== '/media/photos');
    await page.locator('[data-photo-owner]').waitFor({ state: 'detached' });
    await page.locator('[data-source-return]').waitFor();
    if (photo.source === 'milestone') await page.locator('#ms-name').waitFor();
    if (photo.source === 'procedure') await page.locator(`[data-recovery-log="${photo.ownerId}"]`).waitFor();
    if (photo.source === 'entry' || photo.source === 'video') {
      await page.locator('#ed-note').waitFor();
      assert.equal(await page.locator('#ed-note').inputValue(), photo.source === 'video' ? 'Edited exact entry' : 'Exact entry');
    }
    if (photo.source === 'hairRemoval') await page.locator('[data-save-hair-removal-session]').waitFor();
    if (photo.source === 'hair') await page.locator('[data-photo-viewer]').waitFor();
    if (photo.source === 'tryout') {
      await page.locator('[name="tr-label"]').waitFor();
      assert.equal(await page.locator('[name="tr-label"]').inputValue(), 'Exact tryout');
    }
    if (photo.source === 'entry') {
      await page.locator('#ed-note').fill('Edited exact entry');
      await page.locator('[data-save]').click();
      await page.waitForURL((url) => url.pathname === '/media/photos');
    }
    if (photo.source !== 'entry') {
      if (await page.getByRole('dialog').count()) await page.keyboard.press('Escape');
      await page.locator('[data-source-return]').click();
    }
    await page.locator('[data-photo-owner]').waitFor();
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('[data-photo-cell][aria-pressed="true"]').count(), 2);
  }
  // Provenance links retain the source record identity too.
  for (const kind of ['procedure', 'goal']) {
    await page.evaluate(async ({ milestone, kind, id }) => {
      const { journal } = await import('/src/lib/data/live/journal.svelte.ts');
      await journal.milestones.upsertMilestone({ id: milestone, name: 'Edited exact milestone', epochDay: 15000,
        procedureId: kind === 'procedure' ? id : null, roadmapGoalKey: kind === 'goal' ? id : null });
    }, { milestone: fixture.milestone, kind, id: fixture[kind] });
    await visit('/transition/milestones');
    await page.locator('[data-ms-log-toggle]').click();
    await page.locator(`[data-milestone="${fixture.milestone}"]`).click();
    await page.locator('#ms-name').waitFor();
    await page.getByRole('dialog').locator('[data-notice-action]').first().click();
    if (kind === 'procedure') await page.locator(`[data-recovery-log="${fixture.procedure}"]`).waitFor();
    else {
      await page.locator(`[data-goal-sheet-status="${fixture.goal}"]`).waitFor();
      await page.keyboard.press('Escape');
    }
    await page.locator('[data-source-return]').click();
    await page.locator('#ms-name').waitFor();
    await page.keyboard.press('Escape');
    await visit('/media/photos');
  }
  await visit('/media/photos');
  const tryoutPhoto = fixture.ownerPhotos.find((photo) => photo.source === 'tryout');
  await page.evaluate(async () => {
    const { bootState } = await import('/src/lib/stores/boot.svelte.ts');
    const j = bootState.journal;
    const readTryouts = j.tryouts.getTryouts.bind(j.tryouts);
    window.tryoutReadFails = true;
    j.tryouts.getTryouts = async () => {
      if (window.tryoutReadFails) throw new Error('injected tryout read failure');
      return readTryouts();
    };
    const { attachJournal, journalIsOpen } = await import('/src/lib/data/live/journal.svelte.ts');
    attachJournal(j); journalIsOpen();
  });
  await visit(`/transition/tryouts/${tryoutPhoto.ownerId}?returnTo=${encodeURIComponent('/media/photos')}`);
  await page.getByRole('button', { name: 'Try again', exact: true }).waitFor();
  assert.equal(await page.locator('[name="tr-label"]').count(), 0);
  await page.evaluate(() => { window.tryoutReadFails = false; });
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await page.locator('[name="tr-label"]').waitFor();
  await page.locator('[data-source-return]').click();
  const missing = '00000000-0000-4000-8000-000000000000';
  const missingRoutes = [
    `/transition/milestones?edit=${missing}`, `/health/surgery?procedure=${missing}`,
    `/care/regimen?episode=${missing}`, `/transition/roadmap?goal=${missing}`,
    `/body/hair-progress?photo=${missing}`, `/body/hair-removal?session=${missing}`,
    `/transition/tryouts/${missing}`, '/entry/2147483647'
  ];
  for (const href of missingRoutes) {
    await visit(`${href}${href.includes('?') ? '&' : '?'}returnTo=${encodeURIComponent('/media/photos')}`);
    await page.getByText('This record is unavailable', { exact: true }).waitFor();
    assert.equal(await page.locator('[data-source-return]').getAttribute('href'), '/media/photos');
    await page.locator('[data-source-return]').click();
    await page.waitForURL((url) => url.pathname === '/media/photos');
  }
  assert.deepEqual(errors, []);
  console.log('PASS exact document targets, every photo owner, and return context');
} catch (error) {
  console.error('Route:', page.url(), 'Page errors:', errors);
  await page.screenshot({ path: '/tmp/ticket11-route-failure.png' });
  throw error;
} finally {
  await browser.close();
  await server.close();
}

}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await verifySourceRecordLinks({ gallery: process.argv.includes('--gallery') });
}
