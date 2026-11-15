/* Old links that name a medication or a search (security scan GD-016,
   GD-025): opened cold, followed in-app, or left in the address when the
   journal locks, the address ends up holding no journal text, and the
   screen still does what the old link asked for - the drug resolved to its
   episode UUID, the query handed to the search box. Run against the dev
   server; one browser, one journal. */
import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createServer } from 'vite';
import { launchChromium } from './browser-harness.mjs';

const server = await createServer({ server: { port: 0, fs: { allow: [process.cwd(), realpathSync('node_modules')] } } });
await server.listen();
const base = server.resolvedUrls.local[0];
const browser = await launchChromium();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
page.setDefaultTimeout(15000);
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const canary = `Canarydiol ${randomUUID().slice(0, 8)}`;

// Decoded until it stops changing: a nested return path is encoded twice.
function holdsCanary(href) {
  for (let previous = ''; previous !== href; ) [previous, href] = [href, decodeURIComponent(href.replaceAll('+', ' '))];
  return href.includes(canary);
}
function assertClean(label) {
  const url = new URL(page.url());
  for (const key of ['drug', 'lane', 'q']) assert.equal(url.searchParams.has(key), false, `${label}: ${key} stayed in the address`);
  assert.equal(holdsCanary(page.url()), false, `${label}: the medication stayed in ${page.url()}`);
}
async function unlockIfAsked() {
  await page.waitForSelector('[data-app-root][data-boot="ready"], [data-applock], #session-passphrase', { timeout: 60000 });
  if (await page.locator('#session-passphrase').count()) {
    await page.locator('#session-passphrase').fill('demo');
    await page.locator('[data-applock] button[type="submit"], form button[type="submit"]').first().click();
  }
  await page.waitForSelector('[data-app-root][data-boot="ready"]', { timeout: 60000 });
  await page.locator('[data-applock]').waitFor({ state: 'detached' });
}
async function cold(path) {
  await page.goto(new URL(path, base).href, { waitUntil: 'networkidle' });
  assertClean(`${path} before unlock`);
  await unlockIfAsked();
}
let failures = 0;
async function step(name, run) {
  try {
    await run();
    console.log(`PASS ${name}`);
  } catch (error) {
    failures++;
    console.log(`FAIL ${name}: ${error.message.split('\n')[0]} (at ${page.url()})`);
    await page.keyboard.press('Escape').catch(() => {});
  }
}
async function follow(href) {
  await page.evaluate((href) => {
    const link = document.createElement('a');
    link.href = href;
    link.id = 'legacy-link';
    link.textContent = 'Open';
    document.body.append(link);
  }, href);
  await page.locator('#legacy-link').click();
  await page.evaluate(() => document.querySelector('#legacy-link')?.remove());
}

try {
  await page.goto(base, { waitUntil: 'networkidle' });
  await unlockIfAsked();
  if (await page.locator('[data-leave-setup]').count()) await page.locator('[data-leave-setup]').click();
  const fixture = await page.evaluate(async (drug) => {
    const { journal: j } = await import('/src/lib/data/live/journal.svelte.ts');
    const { todayEpochDay, startOfDayTimestamp } = await import('/src/lib/data/epochDay.ts');
    const today = todayEpochDay();
    const episodeId = await j.regimen.upsertEpisode({ drug, ester: null, dose: 100, doseUnit: 'mcg',
      route: 'patch', interval: 'weekly', startEpochDay: today - 14, endEpochDay: null, endReason: null });
    await j.doses.upsertSchedule({ episodeId, recurrence: { kind: 'everyNDays', everyNDays: 7 },
      dosesPerDay: 1, doseAmounts: [{ dose: 100, doseUnit: 'mcg' }], autoLogFromEpochDay: null });
    await j.doses.upsertDose({ drug, timestamp: startOfDayTimestamp(today - 1) + 12 * 3600000,
      route: 'patch', dose: 100, doseUnit: 'mcg', applicationSite: 'abdomen' });
    return { episodeId, today };
  }, canary);
  const enc = encodeURIComponent(canary);

  await step('an old Log link opened cold lands with the episode UUID and the drug seeded', async () => {
    await cold(`/care/doses?add=1&drug=${enc}`);
    await page.locator('[data-close-record]').waitFor();
    await page.waitForURL((url) => url.searchParams.get('episode') === fixture.episodeId && !url.searchParams.has('add'));
    assertClean('Log, cold');
    assert.ok((await page.locator('[data-sheet]').last().textContent()).includes(canary), 'the old Log link keeps its drug');
    await page.locator('[data-close-record]').click();
  });

  await step('an old Care lane link followed in-app highlights the lane and carries the episode UUID', async () => {
    await follow(`/care?lane=${enc}&date=${fixture.today}`);
    await page.locator(`[data-care-lane="${canary}"].is-source-lane`).waitFor();
    await page.waitForURL((url) => url.searchParams.get('episode') === fixture.episodeId);
    assertClean('Care lane, in-app');
  });

  await step('a nested return path keeps its date and loses the medication', async () => {
    await follow(`/care/labs?from=${encodeURIComponent(`/care/doses?drug=${enc}&date=${fixture.today}`)}`);
    await page.waitForURL((url) => url.pathname === '/care/labs' && !holdsCanary(url.href));
    assertClean('nested return');
    assert.equal(new URL(page.url()).searchParams.get('from'), `/care/doses?date=${fixture.today}`);
  });

  await step('a typed search address lands in the box and leaves the address', async () => {
    await cold(`/search?q=${enc}`);
    await page.waitForURL((url) => url.pathname === '/search');
    assertClean('search, cold');
    assert.equal(await page.locator('input[type="search"]').first().inputValue(), canary, 'the query reached the search box');
  });

  await step('the lock screen keeps no medication in the address', async () => {
    await follow('/care');
    await page.waitForSelector('[data-care-rail]');
    await page.evaluate((drug) => {
      // Any way text could still be there (an entry written by an older build).
      const url = new URL(location.href);
      url.searchParams.set('drug', drug);
      history.replaceState(history.state, '', url);
    }, canary);
    assert.ok(holdsCanary(page.url()), 'the probe put the medication in the address');
    await page.evaluate(async () => {
      const { prefs } = await import('/src/lib/data/prefs/store.svelte.ts');
      prefs.lockAfter = 'immediately';
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
      delete document.visibilityState;
  });
  await page.locator('[data-applock]').waitFor();
  await page.waitForURL((url) => !holdsCanary(url.href), { timeout: 5000 });
  assertClean('locked');
  await unlockIfAsked();
  await page.waitForSelector('[data-care-rail]');
  assertClean('after unlock');
  });

  assert.deepEqual(errors, []);
  if (failures) throw new Error(`${failures} case(s) failed`);
} finally {
  await browser.close();
  await server.close();
}
