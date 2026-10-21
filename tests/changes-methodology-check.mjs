/* Real-browser proof for ticket 20 (changes methodology disclosure & record action). */

import { mkdirSync } from 'node:fs';
import { preview } from 'vite';
import { createReporter, launchChromium } from './browser-harness.mjs';

const { ok, fail, finish, block } = createReporter();
/* The reporter's ok() takes a name only. Every assertion here used to pass
   its condition as that name, so each printed PASS whatever it found. */
const check = (condition, name) => (condition ? ok(name) : fail(name, 'condition was false'));
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
    check(btnText && btnText.includes('Record a change'), `button has explicit text: ${btnText}`);

    // Click Record a change button
    await recordBtn.click();
    await page.waitForSelector('#side-effect-name', { timeout: 8000 });
    check(await page.locator('#side-effect-name').isVisible(), 'RecordSheet opened from record button');

    // Fill a change and save
    await page.fill('#side-effect-name', 'Headache test');
    await page.click('[data-save-side-effect]');
    await page.waitForSelector('#side-effect-name', { state: 'detached', timeout: 8000 });
    check(await page.locator('[data-side-effect]').count() > 0, 'newly recorded change appears in list');

    await page.screenshot({ path: '.claude/changes-shots/changes-unanchored.png', fullPage: true });
  });

  await block('Literature disclosure holds every band, opened by keyboard', 9, async () => {
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
    /* Functional audit ticket 22: the bands sit behind "What the literature
       says". Open the body-shape group, whose breast development row has an
       estradiol band, and check that nothing of the literature shows until
       the disclosure opens. */
    const group = page.locator('[data-effect-group="feminizing::body_shape"]');
    await group.waitFor({ state: 'visible', timeout: 15000 });
    await group.locator('[aria-expanded]').first().click();
    await group.locator('.effects-timeline').waitFor({ timeout: 8000 });
    const bands = page.locator('.band-onset, .band-completion');
    check((await bands.count()) === 0, 'no band is drawn before the disclosure opens');
    const limitation = page.locator('.muted.small', { hasText: 'Shaded bands describe the literature' });
    check((await limitation.count()) === 0, 'the limitation arrives with the bands, not before');

    const toggle = page.locator('[data-bands-context] [data-literature-toggle]');
    check((await toggle.getAttribute('aria-expanded')) === 'false', 'disclosure initially collapsed');

    // Open disclosure with keyboard Enter
    await toggle.focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(
      () => document.querySelector('[data-bands-context] [data-literature-toggle]')?.getAttribute('aria-expanded') === 'true',
      null,
      { timeout: 5000 }
    );
    await page.waitForFunction(() => document.querySelectorAll('.band-onset').length > 0, null, { timeout: 5000 });
    check(true, 'bands drawn once the disclosure opened with Enter');
    const body = await page.locator('[data-bands-context] [data-literature-body]').textContent();
    check(
      body.includes('Shaded bands describe the literature') && body.includes('published tables') && body.includes('No evidence'),
      'limitation, timing and variability context visible'
    );
    check(body.includes('WPATH') && /Checked \d+ October 2026/.test(body), `source and reviewed-on date shown: ${body}`);

    // The sheet's sentence follows the same disclosure.
    await page.locator('[data-list-row="breast_development"]').click();
    const sheetBody = page.locator('[data-sheet-literature] [data-literature-body]');
    await sheetBody.waitFor({ state: 'visible', timeout: 8000 });
    const sentence = await sheetBody.textContent();
    check(sentence.includes('24 to 60 months') && sentence.includes('WPATH'), `sheet shows the SOC8 sentence and its source: ${sentence}`);
    await page.keyboard.press('Escape');
    await page.locator('[data-sheet-literature]').waitFor({ state: 'detached', timeout: 8000 });

    // Close disclosure with Space key
    await toggle.focus();
    await page.keyboard.press('Space');
    await page.waitForFunction(
      () => document.querySelector('[data-bands-context] [data-literature-toggle]')?.getAttribute('aria-expanded') === 'false',
      null,
      { timeout: 5000 }
    );
    await page.waitForFunction(() => document.querySelectorAll('.band-onset, .band-completion').length === 0, null, { timeout: 5000 });
    check(true, 'bands gone once the disclosure closed with Space');

    await page.locator('[data-list-row="breast_development"]').click();
    await page.locator('[data-sheet-literature] [data-literature-toggle]').waitFor({ timeout: 8000 });
    check((await page.locator('[data-sheet-literature] [data-literature-body]').count()) === 0, 'sheet keeps the sentence closed too');
    await page.keyboard.press('Escape');
    await page.locator('[data-sheet-literature]').waitFor({ state: 'detached', timeout: 8000 });
  });

  await block('Change groups remain available and interactive', 2, async () => {
    await goto(page, '/care/changes');
    const firstGroup = page.locator('[data-effect-group]').first();
    await firstGroup.waitFor({ state: 'visible', timeout: 15000 });
    check(await page.locator('[data-effect-group]').count() > 0, 'change groups are rendered');

    // Open first category group
    await firstGroup.locator('[aria-expanded]').first().click();
    await page.waitForSelector('[data-list-row]', { timeout: 5000 });
    check(await firstGroup.locator('[data-list-row]').count() > 0, 'category rows are accessible');
  });

  await context.close();
} catch (e) {
  fail('browser proof failed', e);
} finally {
  await browser.close();
  await app.close();
  finish('browser verification passed');
}
