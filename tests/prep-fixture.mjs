/* Shared fixture step for the prep screen's checks and its gallery (phase 8
   features ticket 71). Both need the same state - a journal that has
   everything and a prep list ticked empty - and the loop that gets there is
   real logic rather than the per-file `goto` boilerplate every script here
   redeclares, so it lives in one place. */

/** Deletes every item on the standing prep list through the screen's own
    control, and waits for the empty state to arrive. The page must already
    be on /health/appointment-prep. The confirm handle is the record's own
    (`recordHandles.ts` builds it from RecordSheet's `handle="appointment-item"`)
    rather than the kit-generic one, so a wrong selector fails here instead
    of quietly leaving the list untouched. */
export async function clearPrepList(page) {
  for (let guard = 0; guard < 40; guard += 1) {
    const rows = await page.locator('[data-delete-appointment-item]').count();
    if (rows === 0) break;
    await page.locator('[data-delete-appointment-item]').first().click();
    await page.locator('[data-confirm-delete-appointment-item]').click();
    await page.waitForFunction(
      (before) => document.querySelectorAll('[data-delete-appointment-item]').length < before,
      rows
    );
  }
  await page.waitForSelector('[data-notice="appointment-prep-empty"]');
}
