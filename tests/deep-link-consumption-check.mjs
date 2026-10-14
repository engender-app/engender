import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { createServer } from 'vite';
import { launchChromium } from './browser-harness.mjs';
import { clientRoute, ready, trackTransitions } from './browser-tier/built-flow.mjs';

const server = await createServer({
  cacheDir: '.svelte-kit/deep-link-consumption-vite',
  server: { port: 0, fs: { allow: [process.cwd(), realpathSync('node_modules')] } }
});
await server.listen();
const browser = await launchChromium();
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
await trackTransitions(context);
const page = await context.newPage();
page.setDefaultTimeout(10000);
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));

try {
  await page.goto(server.resolvedUrls.local[0], { waitUntil: 'networkidle' });
  await ready(page);
  if (await page.locator('[data-leave-setup]').count()) await page.locator('[data-leave-setup]').click();
  const ids = await page.evaluate(async () => {
    const { journal } = await import('/src/lib/data/live/journal.svelte.ts');
    const { todayEpochDay } = await import('/src/lib/data/epochDay.ts');
    const day = todayEpochDay() - 1;
    return {
      first: await journal.letters.addLetter({ epochDay: day, unlockEpochDay: day, text: 'First ready letter' }),
      second: await journal.letters.addLetter({ epochDay: day, unlockEpochDay: day, text: 'Second ready letter' }),
      lab: await journal.labs.upsertResult({ epochDay: day, analyte: 'Estradiol', value: 120, unit: 'pg/mL' }),
      otherLab: await journal.labs.upsertResult({ epochDay: day, analyte: 'Testosterone', value: 25, unit: 'ng/dL' })
    };
  });

  await clientRoute(page, '/more');
  const beforeLetters = await page.evaluate(() => history.length);
  await clientRoute(page, `/transition/letters?read=${ids.first}&returnTo=%2Fmedia%2Fphotos`);
  await page.locator('[data-letter-close]').waitFor();
  await page.locator('[data-letter-close]').click();
  await page.locator('[data-letter-close]').waitFor({ state: 'detached' });
  await page.locator(`[data-letter-open="${ids.second}"]`).click();
  await page.waitForFunction(() => document.querySelector('[data-letter-state="reading"]')?.textContent.includes('Second ready letter'));
  assert.equal(new URL(page.url()).searchParams.has('read'), false, 'read is consumed');
  assert.equal(new URL(page.url()).searchParams.get('returnTo'), '/media/photos');
  assert.equal(await page.evaluate(() => history.length), beforeLetters + 1, 'consumption replaces the arrival entry');
  await page.goBack();
  await page.waitForURL('**/more');
  await page.locator('[data-hub-search]').waitFor();
  await page.goForward();
  await page.waitForURL('**/transition/letters?returnTo=*');
  await page.locator(`[data-letter-open="${ids.first}"]`).waitFor();
  assert.equal(new URL(page.url()).searchParams.has('read'), false, 'Forward does not replay the consumed letter');
  console.log('PASS read link opens once; fold, another letter, URL replacement and Back/Forward remain usable');

  await clientRoute(page, `/transition/letters?id=${ids.first}`);
  await page.locator('[data-letter-close]').waitFor();
  await page.waitForURL('**/transition/letters');
  await page.locator('[data-letter-close]').click();
  await page.locator('[data-letter-close]').waitFor({ state: 'detached' });
  console.log('PASS legacy letter id is consumed on same-route navigation');

  for (const hash of ['', `#${ids.lab}`]) {
    await clientRoute(page, '/more');
    const beforeLabs = await page.evaluate(() => history.length);
    await clientRoute(page, `/care/labs?lab=${ids.lab}&date=20000${hash}`);
    await page.locator(`[data-lab-result="${ids.lab}"]`).waitFor();
    await page.locator('[data-segment="Testosterone"]').click();
    await page.locator(`[data-lab-result="${ids.otherLab}"]`).waitFor();
    await page.locator('[data-add]').click();
    assert.equal(await page.locator('#lab-analyte').inputValue(), 'Testosterone');
    await page.locator('#lab-value').fill('37');
    await page.locator('[data-save-lab]').click();
    await page.locator('[data-sheet]').waitFor({ state: 'detached' });
    await page.waitForFunction(() => [...document.querySelectorAll('[data-lab-result]')].some(row => row.textContent.includes('37')));
    assert.equal(await page.locator('[data-segment="Testosterone"]').getAttribute('aria-checked'), 'true');
    assert.equal(new URL(page.url()).searchParams.has('lab'), false, 'lab is consumed');
    assert.equal(new URL(page.url()).searchParams.get('date'), '20000');
    assert.equal(await page.evaluate(() => history.length), beforeLabs + 1, 'consumption replaces the lab arrival entry');
    await clientRoute(page, `/care/labs?lab=${ids.lab}&date=20001${hash}`);
    await page.locator(`[data-lab-result="${ids.lab}"]`).waitFor();
    await page.waitForFunction(() => !new URL(location.href).searchParams.has('lab'));
    assert.equal(await page.locator('[data-segment="Estradiol"]').getAttribute('aria-checked'), 'true');
    console.log(`PASS lab link${hash ? ' with Care hash' : ''} opens once; saving another analyte keeps its result visible and preserves Care return context`);
  }

  await clientRoute(page, '/care/labs?lab=missing-result&date=20000');
  await page.locator('[data-notice="source-unavailable"]').waitFor();
  assert.equal(new URL(page.url()).searchParams.get('lab'), 'missing-result', 'unresolved link retains its unavailable state');
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  await server.close();
}
