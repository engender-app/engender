/* What a list of twenty recordings costs (phase 10 redesign ticket 46).

   Two things the ticket asks to be measured rather than asserted:

   1. **Peaks are computed once.** A waveform's bars come from decoding the
      recording, which is the expensive half; the cache is keyed by file name
      and lives as long as the tab. So: how long twenty rows take to draw
      their waveforms the first time anybody opens the memo browser, and how
      long the same twenty take on the way back to it. If the second number
      is not a rounding error, the cache is not working.
   2. **No blob leaks.** Every player makes one object URL per file and
      revokes it on cleanup. `URL.createObjectURL` and `URL.revokeObjectURL`
      are counted here from inside the page, so leaving a twenty-row list has
      to leave the two counts equal.

   Twenty copies of one recording are imported through the app's own picker,
   which is slow (about a second each) and is the only way to get twenty real
   recordings into a demo journal whose own are random bytes.

   Run against a demo build:
     VITE_DEMO=1 npm run build && node tests/media-list-cost.mjs */
import { preview } from 'vite';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './browser-harness.mjs';
import { mediaFixtures } from './media-fixtures.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const ROWS = 20;
const media = await mediaFixtures(resolve(here, '../.claude/media-fixtures'));

const app = await preview({ preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const browser = await launchChromium();
const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
page.on('pageerror', (error) => console.error('page error:', error.message));

/* Counted from the page's own side, before the app boots: every object URL
   the app makes and every one it gives back. */
await page.addInitScript(() => {
  window.__blobs = { made: 0, revoked: 0 };
  const make = URL.createObjectURL.bind(URL);
  const revoke = URL.revokeObjectURL.bind(URL);
  URL.createObjectURL = (obj) => {
    window.__blobs.made++;
    return make(obj);
  };
  URL.revokeObjectURL = (url) => {
    window.__blobs.revoked++;
    return revoke(url);
  };
});

const settle = async (path) => {
  await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]');
  if (await page.locator('[data-leave-setup]').count()) {
    await page.locator('[data-leave-setup]').click();
    await page.waitForSelector('[data-home-hello]');
    await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-app-root][data-boot="ready"]');
  }
};

const importFile = async (trigger, file, mimeType) => {
  const chooser = page.waitForEvent('filechooser');
  await page.locator(trigger).click();
  await (await chooser).setFiles({
    name: file.split('/').pop(),
    mimeType,
    buffer: await readFile(file)
  });
};

/** Waits until `rows` waveforms have been drawn. A row that has bars has
    been decoded; a row still on the plain track has not. */
const waveformsDrawn = async (rows) => {
  await page.waitForFunction(
    (want) => document.querySelectorAll('.transport-wave').length >= want,
    rows,
    { timeout: 120000 }
  );
};

/** How many rows are near enough to the screen to have asked for their
    bars: the decode waits for that, so this is what the first screenful
    actually costs. */
const drawnNow = () => page.evaluate(() => document.querySelectorAll('.transport-wave').length);

try {
  await settle('/entry/new/today');
  await page.waitForSelector('[data-add-recording-file]');
  await page.locator('[data-mood="3"]').click();

  console.log(`importing ${ROWS} recordings through the app's own picker...`);
  for (let i = 0; i < ROWS; i++) {
    await importFile('[data-add-recording-file]', media.voice, 'audio/webm');
    await page.waitForFunction(
      (want) => document.querySelectorAll('.recording-row').length >= want,
      i + 1,
      { timeout: 20000 }
    );
  }
  await page.locator('[data-save]').click();
  await page.waitForTimeout(2500);

  /* Everything from here is one page. Every navigation is a link the app
     itself draws, never `page.goto`, which loads a new document and so
     throws away both the peaks cache and the counters installed above - a
     run that navigated that way would measure a first visit twice and
     report no leak because nothing was left to leak. */
  await settle('/more');
  const intoList = 'a[href="/media/voice/memos"]';
  await page.waitForSelector(intoList);

  /* Cold: this tab has read none of these files yet. The decode waits for a
     row to come near the screen, so what is timed is the screenful somebody
     actually lands on, and then the whole list once it has been scrolled
     through. */
  const coldFrom = Date.now();
  await page.locator(intoList).click();
  await page.waitForSelector('[data-memo-row]');
  await waveformsDrawn(1);
  await page.waitForTimeout(1200);
  const firstScreenful = await drawnNow();
  const firstScreenMs = Date.now() - coldFrom;

  /* Scrolled in steps rather than jumped to the end: a jump never brings
     the rows in the middle near the screen at all, so their bars are never
     asked for - which is the deferral working, and would read here as a
     hang. */
  for (let step = 0; step < 24; step++) {
    await page.evaluate(() => {
      const region = document.querySelector('[data-app-scroll-region]') ?? document.scrollingElement;
      region.scrollBy({ top: 400 });
    });
    await page.waitForTimeout(120);
    if ((await drawnNow()) >= ROWS) break;
  }
  await waveformsDrawn(ROWS);
  const cold = Date.now() - coldFrom;

  const afterList = await page.evaluate(() => ({ ...window.__blobs }));

  /* Away: every row unmounts, and every object URL it made has to come
     back. */
  await page.evaluate(() => {
    const region = document.querySelector('[data-app-scroll-region]') ?? document.scrollingElement;
    region.scrollTo({ top: 0 });
  });
  await page.waitForTimeout(300);
  await page.locator('.screen a[href="/more"]').first().click();
  await page.waitForSelector('[data-memo-row]', { state: 'detached', timeout: 20000 });
  await page.waitForTimeout(900);
  const leftList = await page.evaluate(() => ({ ...window.__blobs }));

  /* And back: the rows are rebuilt, the peaks are not. */
  const warmFrom = Date.now();
  await page.locator(intoList).click();
  await page.waitForSelector('[data-memo-row]');
  await waveformsDrawn(ROWS);
  const warm = Date.now() - warmFrom;

  const end = await page.evaluate(() => ({ ...window.__blobs }));

  console.log('');
  console.log(`the screenful somebody lands on: ${firstScreenful} waveforms, ${firstScreenMs}ms from the tap`);
  console.log(`all ${ROWS}, cold, after scrolling to the end: ${cold}ms from the tap`);
  console.log(`the same list, tapped into a second time: ${warm}ms`);
  console.log(`per recording, cold: ${(cold / ROWS).toFixed(0)}ms`);
  console.log('');
  console.log(`object URLs made ${end.made}, revoked ${end.revoked}`);
  console.log(`  after the list was first drawn: made ${afterList.made}, revoked ${afterList.revoked}`);
  console.log(`  after leaving it: made ${leftList.made}, revoked ${leftList.revoked}`);

  /* The cache is the point of the second number, so it is gated rather than
     printed: a regression that decoded on every mount would still print two
     numbers and, without this, still exit 0. Four times faster is far below
     the ~28x measured and far above anything a warm run could reach by
     accident. */
  if (warm * 4 > cold) {
    console.log(
      `\nCACHE: the second visit took ${warm}ms against ${cold}ms cold - the peaks are being recomputed per mount`
    );
    process.exitCode = 1;
  }

  const leaked = leftList.made - leftList.revoked;
  console.log('');
  console.log(
    leaked <= 1
      ? `leaving the list left ${leaked} object URL outstanding - nothing per row`
      : `LEAK: ${leaked} object URLs outstanding after leaving a ${ROWS}-row list`
  );
  if (leaked > 1) process.exitCode = 1;
  if (afterList.made < ROWS) {
    console.log(`(only ${afterList.made} object URLs were made for ${ROWS} rows - the counters missed something)`);
    process.exitCode = 1;
  }
} finally {
  await page.close();
  await browser.close();
  await app.close();
}
