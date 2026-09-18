import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { createServer } from 'vite';
import { launchChromium } from './browser-harness.mjs';
import { makeDensePdf } from './pdf-fixture.mjs';
import { PALETTES } from './palettes.mjs';

const server = await createServer({ cacheDir: '.svelte-kit/document-reader-vite', optimizeDeps: { include: ['pdfjs-dist/legacy/build/pdf.worker.mjs'] }, server: { port: 0, fs: { allow: [process.cwd(), realpathSync('node_modules')] } } });
await server.listen();
const browser = await launchChromium();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
page.setDefaultTimeout(15000);
const errors = [];
let downloads = 0;
page.on('download', () => downloads++);
page.on('pageerror', (error) => errors.push(error.message));
async function visit(href) {
  await page.evaluate((href) => {
    const link = document.createElement('a');
    link.href = href; link.id = 'reader-proof-link'; link.textContent = 'Open';
    document.body.append(link);
  }, href);
  await page.locator('#reader-proof-link').click();
  await page.evaluate(() => document.querySelector('#reader-proof-link')?.remove());
}
try {
  await page.goto(server.resolvedUrls.local[0], { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]');
  if (await page.locator('[data-leave-setup]').count()) {
    await page.locator('[data-leave-setup]').click();
    await page.waitForSelector('[data-home-hello]');
  }
  const pdf = makeDensePdf();
  const fixture = await page.evaluate(async (bytes) => {
    const { journal: j } = await import('/src/lib/data/live/journal.svelte.ts');
    const canvas = document.createElement('canvas'); canvas.width = 595; canvas.height = 842;
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg'));
    const thumb = new Uint8Array(await blob.arrayBuffer());
    const milestone = await j.milestones.upsertMilestone({ name: 'Original referral', epochDay: 20000 });
    const title = 'Referral for the September consultation with additional information from the earlier appointment';
    const first = await j.documents.addDocument({ epochDay: 20000, title }, { pdfBytes: new Uint8Array(bytes), thumb });
    const second = await j.documents.addDocument({ epochDay: 19999, title: 'Referral for the August consultation' }, { pdfBytes: new Uint8Array(bytes), thumb });
    await j.documents.setDocumentTarget(first, { kind: 'milestone', id: milestone });
    canvas.width = 1190; canvas.height = 1684;
    const fullBlob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg'));
    const image = await j.documents.addDocument({ epochDay: 20000, title: 'Image referral' }, {
      full: new Uint8Array(await fullBlob.arrayBuffer()), thumb
    });
    return { first, second, title, milestone, image };
  }, [...pdf]);
  await visit(`/media/documents/${fixture.first}`);
  await page.locator('[data-document-page-canvas="drawn"]').waitFor();
  const identity = page.locator('[data-document-identity]');
  await identity.waitFor();
  assert.equal(await identity.locator('h2').innerText(), fixture.title);
  assert.equal(await identity.locator('time').getAttribute('datetime'), '2024-10-04');
  const bounds = await identity.boundingBox();
  assert.ok(bounds.y + bounds.height <= (await page.locator('.doc-page').boundingBox()).y);
  assert.ok((await identity.locator('h2').boundingBox()).height > 48, 'long title wraps');
  assert.ok((await page.locator('#document-title').boundingBox()).y > (await page.locator('.doc-page').boundingBox()).y);
  await page.locator('#document-title').fill('Unsaved title');
  assert.equal(await identity.locator('h2').innerText(), fixture.title, 'identity uses stored metadata');
  await page.locator('#document-title').fill(fixture.title);
  await visit(`/media/documents/${fixture.second}`);
  await page.getByRole('heading', { name: 'Referral for the August consultation', exact: true }).waitFor();
  assert.equal(await identity.locator('time').getAttribute('datetime'), '2024-10-03');
  await visit(`/media/documents/${fixture.first}`);
  await page.locator('[data-document-page-canvas="drawn"]').waitFor();
  await page.getByRole('button', { name: 'Enlarge page', exact: true }).click();
  const reader = page.getByRole('region', { name: `The page of ${fixture.title}`, exact: true });
  await page.waitForFunction(() => {
    const region = document.querySelector('[data-document-reader]');
    const canvas = region?.querySelector('canvas');
    return region && canvas && canvas.width > region.clientWidth * 2 && region.scrollWidth > region.clientWidth;
  });
  await reader.focus();
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(() => document.querySelector('[data-document-reader]').scrollLeft > 0);
  await page.keyboard.press('End');
  await page.waitForFunction(() => document.querySelector('[data-document-reader]').scrollTop > 0);
  await page.locator('[data-page-forward]').click();
  await page.getByText('Page 2 of 3', { exact: true }).waitFor();
  assert.equal(await reader.evaluate((el) => el.scrollTop), 0, 'next page starts at top');
  await page.locator('[data-list-row="document-owner"]').click();
  await page.locator('#ms-name').waitFor();
  assert.equal(await page.locator('#ms-name').inputValue(), 'Original referral');
  await page.keyboard.press('Escape');
  await page.locator('[data-source-return]').click();
  await page.getByText('Page 2 of 3', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Fit page', exact: true }).waitFor();
  assert.equal(new URL(page.url()).searchParams.get('zoom'), '2', 'owner return restores enlargement');
  assert.equal(downloads, 0, 'reading and following owners never export a file');
  await page.getByText('This copies the file out of the app’s encryption.', { exact: true }).waitFor();
  const download = page.waitForEvent('download');
  await page.locator('[data-export-document]').click();
  assert.deepEqual(new Uint8Array(await readFile(await (await download).path())), pdf, 'export preserves original PDF bytes');
  await page.getByRole('button', { name: 'Fit page', exact: true }).click();
  await page.getByRole('button', { name: 'Enlarge page', exact: true }).waitFor();
  // Browser magnification remains independent of the reader's own enlargement.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 });
  assert.equal(await page.evaluate(() => visualViewport.scale), 2);
  await page.locator('[data-document-zoom]').focus();
  await page.keyboard.press('Enter');
  await page.locator('[data-page-forward]').focus();
  await page.keyboard.press('Enter');
  await page.getByText('Page 3 of 3', { exact: true }).waitFor();
  await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });
  await cdp.detach();
  const gallery = process.argv.includes('--gallery');
  if (gallery) await mkdir('.claude/document-reader-shots', { recursive: true });
  for (const language of ['en', 'pl']) {
    await page.evaluate(async (language) => {
      const { prefs } = await import('/src/lib/data/prefs/store.svelte.ts');
      prefs.language = language;
      const { setLocale } = await import('/src/lib/paraglide/runtime.js');
      setLocale(language);
    }, language);
    await page.waitForFunction((language) => document.documentElement.lang === language, language);
    await page.locator('[data-app-root][data-boot="ready"]').waitFor();
    await page.addStyleTag({ content: '.demo-bar, [data-toast] { display: none !important; }' });
    for (const width of [195, 390, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      await page.locator('[data-document-zoom]').scrollIntoViewIfNeeded();
      await page.locator('.doc-pager').waitFor();
      const geometry = await page.evaluate(() => {
        const reader = document.querySelector('[data-document-reader]');
        const pager = document.querySelector('.doc-pager');
        return {
          readerRight: reader.getBoundingClientRect().right,
          width: window.innerWidth,
          pagerRight: pager.getBoundingClientRect().right,
          controls: [...document.querySelectorAll('[data-document-zoom], [data-page-back], [data-page-forward]')].map((el) => {
            const r = el.getBoundingClientRect(); return { width: r.width, height: r.height };
          })
        };
      });
      assert.ok(geometry.readerRight <= geometry.width && geometry.pagerRight <= geometry.width, `${language} reader stays contained at ${width}px`);
      assert.ok(geometry.controls.every((r) => r.width >= 48 && r.height >= 48), `reader targets meet 48px floor: ${JSON.stringify(geometry)}`);
      await page.locator('[data-page-back]').click();
      await page.waitForURL((url) => url.searchParams.get('page') === '2');
      await page.locator('[data-document-page-canvas="drawn"]').waitFor();
      await page.locator('[data-page-forward]').click();
      await page.waitForURL((url) => url.searchParams.get('page') === '3');
      await page.locator('[data-document-page-canvas="drawn"]').waitFor();
      await page.waitForFunction(() => {
        const canvas = document.querySelector('[data-document-page-canvas]');
        return canvas && Math.max(canvas.width, canvas.height) === 2048;
      });
      if (gallery) {
        await page.waitForTimeout(300);
        await page.locator('[data-document-page-canvas="drawn"]').waitFor();
        await page.locator('.doc-pager').waitFor();
        await page.screenshot({ path: `.claude/document-reader-shots/reader-${language}-${width}.png` });
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    if (gallery) for (const disguise of [false, true]) for (const palette of PALETTES) for (const theme of ['light', 'dark']) {
      await page.evaluate(async ({ palette, theme, disguise }) => {
        const { prefs } = await import('/src/lib/data/prefs/store.svelte.ts');
        prefs.palette = palette; prefs.theme = theme; prefs.disguise = disguise;
        document.querySelector('.demo-bar').style.display = 'none';
        document.querySelector('[data-app-scroll-region]').scrollTop = 0;
      }, { palette, theme, disguise });
      await page.waitForTimeout(100);
      await page.screenshot({ path: `.claude/document-reader-shots/identity-${language}-${palette}-${theme}-${disguise}.png` });
    }
  }
  await page.evaluate(async ({ first, milestone }) => {
    const { journal: j } = await import('/src/lib/data/live/journal.svelte.ts');
    const { prefs } = await import('/src/lib/data/prefs/store.svelte.ts');
    prefs.language = 'en';
    const { setLocale } = await import('/src/lib/paraglide/runtime.js');
    setLocale('en', { reload: false });
    await j.milestones.deleteMilestone(milestone);
  }, fixture);
  await page.reload({ waitUntil: 'networkidle' });
  await identity.getByText('Not linked to anything', { exact: true }).waitFor();
  assert.equal(await identity.getByRole('link').count(), 0, 'deleted owner leaves no stale link');
  await page.evaluate(async ({ first, milestone }) => {
    const { journal: j } = await import('/src/lib/data/live/journal.svelte.ts');
    await j.documents.setDocumentTarget(first, { kind: 'milestone', id: milestone });
  }, fixture);
  await identity.getByText('Linked to something that’s gone', { exact: true }).waitFor();
  assert.equal(await identity.getByRole('link').count(), 0, 'restored dangling owner is unavailable');
  await visit(`/media/documents/${fixture.image}`);
  await page.locator('[data-document-page]').waitFor();
  await page.waitForFunction(() => document.querySelector('[data-document-page]').naturalWidth === 1190);
  await page.locator('[data-document-zoom]').click();
  await page.getByRole('button', { name: 'Fit page', exact: true }).waitFor();
  assert.equal(await page.locator('[data-export-document]').count(), 0, 'image does not acquire PDF export');
  assert.equal(await page.locator('[data-page-count]').count(), 0, 'image does not acquire PDF pages');
  assert.deepEqual(errors, []);
  console.log('PASS document identity, dense reader, owner return/deletion, explicit export, both languages, 200% magnification and responsive controls');
} finally {
  await browser.close();
  await server.close();
}
