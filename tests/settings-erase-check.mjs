/* Settings' "Delete everything" (phase 14 ticket 15), against a plain
   build (npm run build) and real browser storage, once per access mode the
   web offers without a hardware authenticator: passphrase, PIN, and
   device-bound, the web's Unlocked - the mode with no gate, which had no
   way to be erased in the app before this row existed.

   Each mode gets a context of its own: a journal is set up, one entry is
   written, the row's sheet is opened and cancelled (nothing goes), then
   confirmed. The app has to come back at first run saying what happened,
   with no keystore left to open, and a fresh setup has to find no entry.

     npm run build && node tests/settings-erase-check.mjs */
import assert from 'node:assert/strict';
import { preview } from 'vite';
import { launchChromium } from './browser-harness.mjs';

const NOTE = 'erase-proof-7f3a';
const PASSPHRASE = 'correct horse battery';
const PIN = '1357';

const app = await preview({ preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const browser = await launchChromium();
let failed = false;

/** What this origin still holds that a journal could live in. */
const storageReport = (page) =>
  page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const files = [];
    for await (const name of root.keys()) files.push(name);
    const databases = (await indexedDB.databases()).map((d) => d.name);
    const keys = Object.keys(localStorage).filter((k) => k.startsWith('engender-'));
    /* The device key database can be opened again by the boot that
       follows (opening one creates it), so what counts is what it holds. */
    let deviceKeys = 0;
    if (databases.includes('engender-device-key')) {
      deviceKeys = await new Promise((resolve, reject) => {
        const request = indexedDB.open('engender-device-key');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const stores = [...db.objectStoreNames];
          if (!stores.length) { db.close(); return resolve(0); }
          const tx = db.transaction(stores, 'readonly');
          let total = 0;
          for (const name of stores) tx.objectStore(name).count().onsuccess = (e) => { total += e.target.result; };
          tx.oncomplete = () => { db.close(); resolve(total); };
          tx.onerror = () => reject(tx.error);
        };
      });
    }
    return { files, databases, keys, deviceKeys };
  });

async function chooseMode(page, mode) {
  await page.locator(`[data-access-modes] [data-list-row="${mode}"]`).click();
  if (mode === 'device-bound') {
    await page.locator('[data-access-submit]').click();
  } else if (mode === 'passphrase') {
    await page.locator('[data-access-continue]').click();
    await page.locator('#am-passphrase').fill(PASSPHRASE);
    await page.locator('#am-passphrase-confirm').fill(PASSPHRASE);
    await page.locator('[data-access-submit]').click();
  } else if (mode === 'pin') {
    await page.locator('[data-access-continue]').click();
    for (let round = 0; round < 2; round++) {
      for (const d of PIN) await page.locator(`[data-key="${d}"]`).click();
      await page.waitForTimeout(400);
    }
  }
}

/** First run to Today: straight to the app, the mode, and out of setup. */
async function setUp(page, mode) {
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.locator('[data-leave-setup]').click();
  await page.locator('[data-access-modes]').waitFor();
  await chooseMode(page, mode);
  for (let i = 0; i < 20 && !(await page.locator('[data-home-hello]').count()); i++) {
    if (await page.locator('[data-leave-setup]').count()) await page.locator('[data-leave-setup]').click().catch(() => {});
    else if (await page.locator('[data-skip-recovery-offer]').count()) await page.locator('[data-skip-recovery-offer]').click().catch(() => {});
    await page.waitForTimeout(500);
  }
  await page.locator('[data-home-hello]').waitFor();
}

async function writeEntry(page) {
  await page.locator('[data-nav-fab]').click();
  await page.locator('[data-fan-target="mood-3"]').click();
  await page.locator('#ed-note').fill(NOTE);
  await page.locator('[data-save]').click();
  await page.locator('[data-home-log]').waitFor();
}

/** Whether search finds the entry. A reload, so only for a journal that
    reopens without asking. */
async function findsNote(page) {
  await page.goto(`${base}/search`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]');
  await page.locator('#q').fill(NOTE);
  await page.waitForTimeout(1500);
  /* The field's own value is not text, so any match is a result row. */
  return (await page.getByText(NOTE, { exact: true }).count()) > 0;
}

async function openErase(page) {
  /* In-app, from Today's gear, the way somebody gets here. */
  await page.locator('[data-home-gear]').click();
  await page.locator('[data-list-row="erase"]').click();
  await page.locator('[data-confirm-reset]').waitFor();
}

async function check(mode) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  try {
    await setUp(page, mode);
    await writeEntry(page);
    const before = await storageReport(page);
    assert.ok(before.files.length > 0, `${mode}: a journal was written to OPFS (${JSON.stringify(before)})`);
    if (mode === 'device-bound') {
      assert.ok(before.deviceKeys > 0, `${mode}: the browser holds its key before the erase`);
      /* The control for the last check: before the erase, search finds it.
         Only in the mode that reopens without asking after a reload. */
      assert.equal(await findsNote(page), true, `${mode}: search finds the entry before the erase`);
      await page.goto(base, { waitUntil: 'networkidle' });
      await page.locator('[data-home-hello]').waitFor();
    }

    /* The row is on the first screen at 390, above the tab bar. */
    await page.locator('[data-home-gear]').click();
    const row = await page.locator('[data-list-row="erase"]').boundingBox();
    const nav = await page.locator('[data-nav-item="home"]').first().boundingBox();
    assert.ok(row && nav && row.y + row.height <= nav.y, `${mode}: the erase row sits above the tab bar (${row?.y}+${row?.height} vs ${nav?.y})`);
    await page.locator('[data-nav-item="home"]').first().click();
    await page.locator('[data-home-hello]').waitFor();

    await openErase(page);
    await page.keyboard.press('Escape');
    await page.locator('[data-sheet]').waitFor({ state: 'hidden' });
    assert.deepEqual((await storageReport(page)).files, before.files, `${mode}: cancelling leaves every file`);
    console.log(`PASS ${mode}: cancelling the sheet erases nothing`);

    await page.locator('[data-list-row="erase"]').click();
    await page.locator('[data-confirm-reset]').click();
    await page.waitForURL('**/onboarding?erased=1');
    await page.locator('[data-erased-result]').waitFor();
    assert.match(await page.locator('[data-erased-result]').innerText(), /Everything on this device was deleted/);
    assert.equal(await page.locator('[data-restore-start]').count(), 1, `${mode}: lands on the welcome, at first run`);
    const after = await storageReport(page);
    assert.equal(after.deviceKeys, 0, `${mode}: no device key is left (${JSON.stringify(after)})`);
    assert.deepEqual(after.keys.filter((k) => !k.startsWith('engender-boot')), [], `${mode}: no app keys left in localStorage`);
    console.log(`PASS ${mode}: confirmed erase lands at first run and says so (OPFS after: ${JSON.stringify(after.files)})`);

    /* A fresh start finds no keystore to unlock and no entry from before. */
    await page.locator('[data-leave-setup]').click();
    await page.locator('[data-access-modes]').waitFor();
    await chooseMode(page, 'device-bound');
    for (let i = 0; i < 20 && !(await page.locator('[data-home-hello]').count()); i++) {
      if (await page.locator('[data-leave-setup]').count()) await page.locator('[data-leave-setup]').click().catch(() => {});
      await page.waitForTimeout(500);
    }
    await page.locator('[data-home-hello]').waitFor();
    assert.equal(await findsNote(page), false, `${mode}: the old entry is gone`);
    console.log(`PASS ${mode}: a new journal after the erase holds nothing from before`);
    assert.deepEqual(errors, [], `${mode}: no page errors`);
  } catch (error) {
    failed = true;
    console.log(`FAIL ${mode}: ${error.message}`);
    await page.screenshot({ path: `/tmp/settings-erase-${mode}-failure.png` }).catch(() => {});
  } finally {
    await context.close();
  }
}

try {
  for (const mode of ['device-bound', 'passphrase', 'pin']) await check(mode);
} finally {
  await browser.close();
  app.httpServer.close();
}
if (failed) process.exit(1);
