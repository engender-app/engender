import assert from 'node:assert/strict';
import { serveBuild } from './serve-build.mjs';
import { launchChromium, untilSplashLets } from './browser-harness.mjs';

// Run after VITE_DEMO=1 npm run build. No navigation or history stubs.
const server = await serveBuild(process.cwd());
const base = `http://localhost:${server.httpServer.address().port}`;
const browser = await launchChromium();
const page = await browser.newPage({ reducedMotion: 'reduce' });
page.setDefaultTimeout(15000);
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
async function open(path) {
  await page.goto(base + path);
  await page.locator('[data-app-root][data-boot="ready"]').waitFor();
  await untilSplashLets(page);
}
// Web hides reminder edit links because it cannot ring. Use a real anchor
// for the supported route, as the existing reminder walkthrough does.
async function reminderLink(path) {
  await page.evaluate((path) => {
    const link = document.createElement('a');
    link.href = path;
    document.body.append(link);
    link.click();
    link.remove();
  }, path);
}
async function backTo(path) {
  await page.goBack();
  await page.waitForURL(base + path);
}
try {
  await open('/settings');
  await page.locator('[data-list-row="scales"]').click();
  await page.locator('a[href="/settings/dimension"]').click();
  await page.locator('#cd-name').fill('History scale');
  await page.locator('[data-save]').click();
  await page.waitForURL(base + '/settings');
  await backTo('/settings');
  assert.equal(await page.locator('#cd-name').count(), 0);
  console.log('PASS custom scale save replaces completed form; Back stays on Settings');
  // Header Back still returns to the actual opener when nothing was saved.
  await page.locator('[data-list-row="scales"]').click();
  await page.locator('a[href="/settings/dimension"]').click();
  await page.locator('[data-screen-back]').click();
  await page.waitForURL(base + '/settings');
  console.log('PASS ordinary custom scale Back returns to Settings');

  await open('/settings/reminders');
  const reminder = page.locator('[data-reminder]').first();
  const reminderPath = '/settings/reminders/' + await reminder.getAttribute('data-reminder');
  await reminderLink(reminderPath);
  await page.locator('#r-name').fill('History reminder');
  await page.locator('[data-save]').click();
  await page.waitForURL(base + '/settings/reminders');
  await backTo('/settings/reminders');
  await reminderLink(reminderPath);
  await page.waitForFunction(() => document.querySelector('#r-name')?.value === 'History reminder');
  await page.locator('#r-name').fill('Discarded reminder');
  await page.locator('[data-screen-back]').click();
  await page.locator('[data-discard-record]').click();
  await page.waitForURL(base + '/settings/reminders');
  await reminderLink(reminderPath);
  await page.waitForFunction(() => document.querySelector('#r-name')?.value === 'History reminder');
  await page.locator('[data-screen-back]').click();
  await page.waitForURL(base + '/settings/reminders');
  console.log('PASS reminder save replaces detail; ordinary Back and discard retain opener and saved value');

  // Web intentionally has no Add reminder action. Exercise its supported URL.
  await open('/settings/reminders/new');
  await page.locator('#r-name').fill('New history reminder');
  await page.locator('[data-save]').click();
  await page.waitForURL(base + '/settings/reminders');
  await backTo('/settings/reminders');
  assert.equal(await page.locator('#r-name').count(), 0);
  console.log('PASS cold new-reminder save removes blank form from browser history');

  await open('/transition/tryouts');
  await page.locator('a[href="/transition/tryouts/new"]').first().click();
  await page.locator('#tr-label').fill('History tryout');
  await page.locator('[data-save-tryout]').click();
  await page.waitForURL(/\/transition\/tryouts\/(?!new)[^/]+$/);
  const tryoutPath = new URL(page.url()).pathname;
  await page.locator('[data-add-photo]').waitFor();
  await backTo('/transition/tryouts');
  await page.locator(`a[href="${tryoutPath}"]`).click();
  await page.locator('#tr-label').fill('History tryout edited');
  await page.locator('[data-save-tryout]').click();
  await page.locator('[data-tryout-saved]').waitFor();
  assert.equal(new URL(page.url()).pathname, tryoutPath);
  await page.locator('[data-screen-back]').click();
  await page.waitForURL(base + '/transition/tryouts');
  console.log('PASS new tryout replaces /new; existing edit stays on detail and Back returns to list');

  await open('/media/documents');
  const documentLink = page.locator('a[href^="/media/documents/"]').first();
  const documentPath = await documentLink.getAttribute('href');
  await documentLink.click();
  await page.locator('[data-delete-document]').click();
  await page.locator('[data-sheet] .btn-ghost').click();
  await page.locator('[data-sheet]').waitFor({ state: 'detached' });
  assert.equal(new URL(page.url()).pathname, documentPath);
  await page.locator('[data-screen-back]').click();
  await page.waitForURL(base + '/media/documents');
  await page.locator(`a[href="${documentPath}"]`).click();
  await page.locator('[data-delete-document]').click();
  await page.locator('[data-confirm-delete-document]').click();
  await page.waitForURL(base + '/media/documents');
  await backTo('/media/documents');
  assert.equal(await page.locator(`a[href="${documentPath}"]`).count(), 0);
  assert.equal(await page.locator('[data-delete-document]').count(), 0);
  console.log('PASS document delete replaces detail; Back returns to list without deleted record');

  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  await server.close();
}
