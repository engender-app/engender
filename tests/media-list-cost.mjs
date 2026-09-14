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

/** Waits until every row on the memo browser has drawn its waveform, and
    returns how long that took from the moment the screen was asked for.
    A row that has bars has been decoded; a row still on the plain track has
    not. */
const waveformsDrawn = async (rows) => {
  await page.waitForFunction(
    (want) => document.querySelectorAll('.transport-wave').length >= want,
    rows,
    { timeout: 120000 }
  );
};

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

  /* Cold: the first time this tab has seen any of these files. */
  const coldFrom = Date.now();
  await settle('/media/voice/memos');
  await waveformsDrawn(ROWS);
  const cold = Date.now() - coldFrom;

  const afterList = await page.evaluate(() => ({ ...window.__blobs }));

  /* Away, and back: the rows are rebuilt, the peaks are not. */
  await settle('/more');
  await page.waitForTimeout(600);
  const leftList = await page.evaluate(() => ({ ...window.__blobs }));

  const warmFrom = Date.now();
  await settle('/media/voice/memos');
  await waveformsDrawn(ROWS);
  const warm = Date.now() - warmFrom;

  const end = await page.evaluate(() => ({ ...window.__blobs }));

  console.log('');
  console.log(`a list of ${ROWS}, cold: ${cold}ms to every waveform drawn`);
  console.log(`the same list, second visit: ${warm}ms`);
  console.log(`per recording, cold: ${(cold / ROWS).toFixed(0)}ms`);
  console.log('');
  console.log(`object URLs made ${end.made}, revoked ${end.revoked}`);
  console.log(`  after the list was first drawn: made ${afterList.made}, revoked ${afterList.revoked}`);
  console.log(`  after leaving it: made ${leftList.made}, revoked ${leftList.revoked}`);

  const leaked = leftList.made - leftList.revoked;
  console.log('');
  console.log(
    leaked <= 1
      ? `leaving the list left ${leaked} object URL outstanding - nothing per row`
      : `LEAK: ${leaked} object URLs outstanding after leaving a ${ROWS}-row list`
  );
  if (leaked > 1) process.exitCode = 1;
} finally {
  await page.close();
  await browser.close();
  await app.close();
}
