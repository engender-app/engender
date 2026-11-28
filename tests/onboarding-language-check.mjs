/* The welcome's language switch on a real first run, on the production build, where there is no journal until the
   access-mode step makes one.

   Picking a language reloads the page (setLocale), and a preference written
   before the journal opens was held only in memory, so the reload lost it.
   Paraglide's own copy survived, which made the welcome look right; the loss
   showed at the access-mode step, where the journal attached with 'system'
   and a Polish browser was reloaded back into Polish. So this walks the whole
   way: a pl-PL browser picks EN on the welcome, leaves setup through the
   access-mode step, and Settings must still say English.

   Run after `npm run build` (test:browser does). */
import assert from 'node:assert/strict';
import { launchBrowser, untilSplashLets } from './browser-harness.mjs';
import { serveBuild } from './serve-build.mjs';
import { choosePassphrase, clientRoute, ready } from './browser-tier/built-flow.mjs';

const server = await serveBuild(process.cwd());
const { port } = /** @type {import('node:net').AddressInfo} */ (server.httpServer.address());
const origin = `http://localhost:${port}`;
const browser = await launchBrowser();
const context = await browser.newContext({ locale: 'pl-PL', viewport: { width: 412, height: 915 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
let loads = 0;
page.on('load', () => loads++);

async function welcome() {
  await page.locator('[data-language-pick]').first().waitFor({ timeout: 60000 });
  await untilSplashLets(page);
}

try {
  await page.goto(`${origin}/onboarding`, { waitUntil: 'networkidle' });
  await welcome();
  assert.equal(await page.getAttribute('html', 'lang'), 'pl');
  assert.equal(await page.locator('[data-language-pick="pl"]').getAttribute('aria-checked'), 'true');

  await Promise.all([page.waitForEvent('load'), page.locator('[data-language-pick="en"]').click()]);
  await welcome();
  assert.equal(await page.getAttribute('html', 'lang'), 'en', 'the reload lands in English');
  assert.equal((await page.locator('[data-setup-question]').innerText()).trim(), 'Welcome!', 'and back on the welcome');
  assert.equal(await page.locator('[data-language-pick="en"]').getAttribute('aria-checked'), 'true');
  const afterChoice = loads;

  /* "Straight to the app" detours through the access-mode step, which is
     where the journal opens and the held choice has to reach it. */
  await page.locator('[data-leave-setup]').click();
  await choosePassphrase(page);
  await page.locator('[data-leave-setup]').click();
  await page.locator('[data-home-hello]').waitFor({ timeout: 30000 });
  assert.equal(loads, afterChoice, 'opening the journal does not reload the app into another language');
  assert.equal(await page.getAttribute('html', 'lang'), 'en');

  await clientRoute(page, '/settings');
  await ready(page);
  const english = page.locator('[data-segmented="language"]').getByRole('radio', { name: 'English', exact: true });
  assert.equal(await english.getAttribute('aria-checked'), 'true', 'Settings shows English selected');
  assert.deepEqual(errors, []);
  console.log('PASS A language picked on the welcome before there is a journal survives the reload and the journal opening');
} finally {
  await context.close();
  await browser.close();
  await server.close();
}
