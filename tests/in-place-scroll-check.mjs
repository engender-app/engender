/* A screen that rewrites its own address keeps its scroll (last-audit UI
   ticket 12, audit U11).

   Opening a photo, picking a filter chip, zooming or paging a document all
   go through `replaceRoute(url, { noScroll: true })`, which is a real
   navigation. The layout's own scroll restore ran after every one of them
   and, the navigation being a `goto` rather than a popstate, sent the scroll
   region to the top: open a photo half way down the library, close it, and
   the grid was back at its first row. This drives the photo library, which
   has both cases on one screen, and then checks the two things the fix must
   not take away: a forward visit still starts at the top, and back still
   lands where the screen was left.

   Run against the dev server (no build needed):
     node tests/in-place-scroll-check.mjs */
import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { createServer } from 'vite';
import { launchChromium } from './browser-harness.mjs';

const HAIR = 60;
const ENTRY = 12;

const server = await createServer({ server: { port: 0, fs: { allow: [process.cwd(), realpathSync('node_modules')] } } });
await server.listen();
const browser = await launchChromium();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
page.setDefaultTimeout(30000);
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));

const region = page.locator('[data-app-scroll-region]');
const scrollTop = () => region.evaluate((el) => el.scrollTop);

/** Waits until the region has held one position for 400ms - an eased
    restore, a late row, a sheet's own lock all finish first - and returns
    it. By condition, not by a fixed wait. */
async function settledScroll() {
  await page.evaluate(() => delete window.__scrollSeen);
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-app-scroll-region]');
    const now = performance.now();
    const seen = (window.__scrollSeen ??= { top: -1, since: now });
    if (el.scrollTop !== seen.top) Object.assign(seen, { top: el.scrollTop, since: now });
    return now - seen.since >= 400;
  }, undefined, { polling: 'raf' });
  return scrollTop();
}

/** A link click, so the navigation is SvelteKit's own `link` type. */
async function follow(href) {
  await page.evaluate((href) => {
    const link = document.createElement('a');
    link.href = href;
    document.body.append(link);
    link.click();
    link.remove();
  }, href);
  await page.waitForURL((url) => url.pathname === href);
}

function holds(before, after, label) {
  assert.ok(Math.abs(after - before) <= 1, `${label}: the library moved from ${before}px to ${after}px`);
  console.log(`PASS ${label}: ${before}px -> ${after}px`);
}

try {
  await page.goto(server.resolvedUrls.local[0], { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]', { timeout: 60000 });
  if (await page.locator('[data-leave-setup]').count()) {
    await page.locator('[data-leave-setup]').click();
    await page.waitForSelector('[data-home-hello]');
  }
  await page.evaluate(async ({ hair, entry }) => {
    const { journal: j } = await import('/src/lib/data/live/journal.svelte.ts');
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 16;
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg'));
    const full = new Uint8Array(await blob.arrayBuffer());
    const photo = { full, thumb: full };
    for (let day = 0; day < hair; day++) await j.hairProgress.addPhoto(16000 + day, photo);
    for (let day = 0; day < entry; day++) {
      const id = await j.entries.upsertEntry({ epochDay: 17000 + day, mood: 3, note: '' });
      await j.photos.attach({ entryId: id }, photo);
    }
  }, { hair: HAIR, entry: ENTRY });

  await follow('/media/photos');
  await page.waitForSelector('[data-photo-cell]');
  assert.equal(await settledScroll(), 0, 'a forward visit to the library opens at the top');
  console.log('PASS forward visit opens at the top');

  /* Half way down what the grid has rendered. */
  const half = await region.evaluate((el) => {
    el.scrollTop = Math.round((el.scrollHeight - el.clientHeight) / 2);
    return el.scrollTop;
  });
  assert.ok(half > 300, `the fixture library is too short to scroll: ${half}px`);
  const scrolled = await settledScroll();

  /* A tile in the middle of the viewport, so the click needs no scroll of
     its own. */
  const tile = await page.evaluate(() => {
    const el = document.querySelector('[data-app-scroll-region]');
    const middle = el.getBoundingClientRect().top + el.clientHeight / 2;
    const cell = [...document.querySelectorAll('[data-photo-cell]')].find((cell) => {
      const box = cell.getBoundingClientRect();
      return box.top > middle - 150 && box.bottom < middle + 150;
    });
    return cell?.closest('[data-photo-key]')?.getAttribute('data-photo-key') ?? null;
  });
  assert.ok(tile, 'no photo tile sits in the middle of the viewport');
  await page.locator(`[data-photo-key="${tile}"] [data-photo-cell]`).click();
  await page.waitForURL((url) => url.searchParams.get('photo') === tile);
  await page.locator('[data-photo-viewer] img').waitFor();
  holds(scrolled, await settledScroll(), 'opening a photo');
  await page.keyboard.press('Escape');
  await page.waitForURL((url) => !url.searchParams.has('photo'));
  await page.locator('[data-photo-viewer]').waitFor({ state: 'detached' });
  holds(scrolled, await settledScroll(), 'closing it again');

  /* A chip change. The row is not sticky, so the region is brought to where
     the chips are just under the top edge - scrolled, but with the chip in
     reach of a finger. */
  const nearChips = await region.evaluate((el) => {
    const chips = document.querySelector('[data-photo-chips]');
    el.scrollTop += chips.getBoundingClientRect().top - el.getBoundingClientRect().top - 8;
    return el.scrollTop;
  });
  assert.ok(nearChips > 40, `the chips sit too near the top to test a scrolled chip change: ${nearChips}px`);
  const beforeChip = await settledScroll();
  await page.locator('[data-photo-chip="hair"]').click();
  await page.waitForURL((url) => url.searchParams.get('source') === 'hair');
  await page.waitForFunction((count) => document.querySelectorAll('[data-photo-source="entry"]').length === 0 && document.querySelectorAll('[data-photo-cell]').length > 0, ENTRY);
  holds(beforeChip, await settledScroll(), 'picking a chip');
  await page.locator('[data-photo-chip="everything"]').click();
  await page.waitForURL((url) => !url.searchParams.has('source'));
  holds(beforeChip, await settledScroll(), 'picking it back');

  /* Back still restores, and forward still starts at the top. */
  const left = await region.evaluate((el) => {
    el.scrollTop = Math.round((el.scrollHeight - el.clientHeight) / 2);
    return el.scrollTop;
  });
  const leftAt = await settledScroll();
  assert.ok(left > 300);
  await follow('/more');
  assert.equal(await settledScroll(), 0, 'a forward navigation away opens its screen at the top');
  console.log('PASS forward navigation to More opens at the top');
  await page.goBack();
  await page.waitForURL((url) => url.pathname === '/media/photos');
  await page.waitForSelector('[data-photo-cell]');
  holds(leftAt, await settledScroll(), 'back to the library');
  await follow('/more');
  await settledScroll();
  await follow('/media/photos');
  await page.waitForSelector('[data-photo-cell]');
  assert.equal(await settledScroll(), 0, 'a second forward visit opens at the top again');
  console.log('PASS a second forward visit opens at the top');

  assert.deepEqual(errors, []);
  console.log('PASS no page errors');
} finally {
  await browser.close();
  await server.close();
}
