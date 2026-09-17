/* Real-browser proof for ticket 20 (changes methodology disclosure & record action). */

import { mkdirSync } from 'node:fs';
import { preview } from 'vite';
import { createReporter, launchChromium } from './browser-harness.mjs';

const { ok, fail, finish, block } = createReporter();
const app = await preview({ preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const browser = await launchChromium();

mkdirSync('.claude/changes-shots', { recursive: true });

async function freshPage(options = {}) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    ...options
  });
  const page = await context.newPage();
  await page.goto(`${base}/`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]', { timeout: 60000 });
  if (await page.locator('[data-leave-setup]').count()) {
    await page.locator('[data-leave-setup]').click();
    await page.waitForSelector('[data-home-hello]');
  }
  return { context, page };
}

async function goto(page, path) {
  await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]', { timeout: 60000 });
}

try {
  const { context, page } = await freshPage();

  await block('Record a change action operates without regimen', 3, async () => {
    await goto(page, '/care/changes');
    const recordBtn = page.locator('[data-record-change]');
    await recordBtn.waitFor({ state: 'visible', timeout: 15000 });

    const btnText = await recordBtn.textContent();
    ok(btnText && btnText.includes('Record a change'), `button has explicit text: ${btnText}`);

    // Click Record a change button
    await recordBtn.click();
    await page.waitForSelector('#side-effect-name', { timeout: 8000 });
    ok(await page.locator('#side-effect-name').isVisible(), 'RecordSheet opened from record button');

    // Fill a change and save
    await page.fill('#side-effect-name', 'Headache test');
    await page.click('[data-save-side-effect]');
    await page.waitForSelector('#side-effect-name', { state: 'detached', timeout: 8000 });
    ok(await page.locator('[data-side-effect]').count() > 0, 'newly recorded change appears in list');

    await page.screenshot({ path: '.claude/changes-shots/changes-unanchored.png', fullPage: true });
  });

  await block('Methodology disclosure is accessible by keyboard with active regimen', 5, async () => {
    // Add active regimen to get anchorEpochDay !== null
    await goto(page, '/care/regimen');
    await page.click('[data-add]');
    await page.click('[data-own]');
    await page.waitForSelector('#regimen-drug');
    await page.fill('#regimen-drug', 'Estradiol valerate');
    await page.fill('#regimen-dose', '4');
    await page.fill('#regimen-dose-unit', 'mg');
    await page.fill('#regimen-route', 'oral');
    await page.fill('#regimen-interval', 'daily');
    await page.click('[data-save-regimen]');
    await page.waitForSelector('[data-episode]', { timeout: 8000 });

    // Return to changes
    await goto(page, '/care/changes');
    await page.waitForSelector('[data-methodology-toggle]', { timeout: 15000 });

    // Verify short limitation is visible outside disclosure
    const limitation = page.locator('.muted.small', { hasText: 'Shaded bands describe the literature' });
    ok(await limitation.isVisible(), 'short limitation is visible before disclosure');

    const toggle = page.locator('[data-methodology-toggle]');
    const expandedBefore = await toggle.getAttribute('aria-expanded');
    ok(expandedBefore === 'false', 'disclosure initially collapsed');

    // Open disclosure with keyboard Enter
    await toggle.focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(
      () => document.querySelector('[data-methodology-toggle]')?.getAttribute('aria-expanded') === 'true',
      null,
      { timeout: 5000 }
    );
    ok(true, 'disclosure opened with Enter key');

    // Check that methodology content is displayed
    const disclosed = page.locator('.effects-methodology .disclosed');
    await disclosed.waitFor({ state: 'visible', timeout: 5000 });
    const content = await disclosed.textContent();
    ok(content.includes('Endocrine Society') && content.includes('shaded band'), 'sources and methodology text visible');

    await page.screenshot({ path: '.claude/changes-shots/changes-disclosed.png', fullPage: true });

    // Close disclosure with Space key
    await toggle.focus();
    await page.keyboard.press('Space');
    await page.waitForFunction(
      () => document.querySelector('[data-methodology-toggle]')?.getAttribute('aria-expanded') === 'false',
      null,
      { timeout: 5000 }
    );
    ok(true, 'disclosure closed with Space key');
  });

  await block('Change groups remain available and interactive', 2, async () => {
    await goto(page, '/care/changes');
    const firstGroup = page.locator('[data-effect-group]').first();
    await firstGroup.waitFor({ state: 'visible', timeout: 15000 });
    ok(await page.locator('[data-effect-group]').count() > 0, 'change groups are rendered');

    // Open first category group
    await firstGroup.locator('[aria-expanded]').first().click();
    await page.waitForSelector('[data-list-row]', { timeout: 5000 });
    ok(await firstGroup.locator('[data-list-row]').count() > 0, 'category rows are accessible');
  });

  await context.close();
} catch (e) {
  fail('browser proof failed', e);
} finally {
  await browser.close();
  await app.close();
  finish('browser verification passed');
}
