import assert from 'node:assert/strict';

export const SEARCH_RETURN_CANARY = 'canyon4177 orchid4155';

/** Exercise the real entry/search return flow on a synthetic journal.
 * The note reverses the query words so profile scans distinguish the held
 * query from an editor field retained by the browser.
 * @param {import('playwright-core').Page} page
 */
export async function searchReturnFlow(page) {
  const navigate = async (path) => {
    await page.evaluate((destination) => {
      const link = document.createElement('a');
      link.href = destination;
      document.body.append(link);
      link.click();
      link.remove();
    }, path);
    await page.waitForURL((url) => url.pathname === path);
  };
  await page.waitForSelector('#journal-passphrase, [data-leave-setup], [data-app-root][data-boot="ready"]', { timeout: 90000 });
  if (await page.locator('#journal-passphrase').count()) {
    await page.locator('#journal-passphrase').fill('backend41 synthetic phrase');
    await page.locator('[data-passphrase-submit]').click();
  }
  if (await page.locator('[data-leave-setup]').count()) await page.locator('[data-leave-setup]').click();
  await page.waitForSelector('[data-leave-setup], [data-app-root][data-boot="ready"]', { timeout: 90000 });
  if (await page.locator('[data-leave-setup]').count()) await page.locator('[data-leave-setup]').click();
  await page.waitForSelector('[data-app-root][data-boot="ready"]', { timeout: 90000 });
  await navigate('/entry/new/today');
  await page.locator('#ed-note').fill('orchid4155 canyon4177');
  await page.locator('[data-save-moods] [data-mood="4"]').click();
  await page.locator('[data-save]').click();
  await page.waitForURL((url) => !url.pathname.startsWith('/entry/'));
  await navigate('/settings/access-mode');
  await page.locator('[data-lock-after-choice="immediately"]').click();
  await page.waitForSelector('[data-lock-after-choice="immediately"][aria-checked="true"]');
  await navigate('/search');
  await page.locator('#q').fill(SEARCH_RETURN_CANARY);
  await page.locator('[data-entry-card]').first().click();
  await page.waitForURL((url) => url.pathname.startsWith('/entry/'));
  await page.locator('[data-screen-back]').first().click();
  await page.waitForURL((url) => url.pathname === '/search');
  assert.equal(await page.locator('#q').inputValue(), SEARCH_RETURN_CANARY);
  await page.locator('[data-entry-card]').first().click();
  await page.waitForURL((url) => url.pathname.startsWith('/entry/'));
  return page.evaluate((query) => ({
    restored: true,
    storedQuery: [localStorage, sessionStorage].some((storage) =>
      Object.keys(storage).some((key) => storage.getItem(key)?.includes(query)))
  }), SEARCH_RETURN_CANARY);
}
