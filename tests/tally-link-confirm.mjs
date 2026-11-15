/* A tally link proposes, the person confirms (security scan GD-037, the web
   half of GD-011): `/?tally=` is the address the Android widget opens, and
   it is also an address anyone can send. Opened unlocked, or carried
   through a lock and unlock, it writes nothing until the confirmation is
   accepted; accepted, it writes exactly one event and says so. Chromium
   against the dev server; every case is reported on its own. */
import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
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

async function unlockIfAsked() {
  await page.waitForSelector('[data-app-root][data-boot="ready"], [data-applock], #session-passphrase', { timeout: 60000 });
  if (await page.locator('#session-passphrase').count()) {
    await page.locator('#session-passphrase').fill('demo');
    await page.locator('[data-applock] button[type="submit"], form button[type="submit"]').first().click();
  }
  await page.waitForSelector('[data-app-root][data-boot="ready"]', { timeout: 60000 });
  await page.locator('[data-applock]').waitFor({ state: 'detached' });
}
const count = (kind) => page.evaluate(async (kind) => {
  const { journal } = await import('/src/lib/data/live/journal.svelte.ts');
  const { todayEpochDay } = await import('/src/lib/data/epochDay.ts');
  const today = todayEpochDay();
  return (await journal.stats.tallyTrend(kind, today, today)).reduce((sum, point) => sum + point.value, 0);
}, kind);
async function follow(href) {
  await page.evaluate((href) => {
    const link = document.createElement('a');
    link.href = href;
    link.id = 'tally-link';
    link.textContent = 'Open';
    link.style.cssText = 'position:fixed;inset:0 auto auto 0;z-index:2147483647';
    document.body.append(link);
  }, href);
  await page.locator('#tally-link').click();
  await page.evaluate(() => document.querySelector('#tally-link')?.remove());
}
async function lock() {
  await page.evaluate(async () => {
    const { prefs } = await import('/src/lib/data/prefs/store.svelte.ts');
    prefs.lockAfter = 'immediately';
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    delete document.visibilityState;
  });
  await page.locator('[data-applock]').waitFor();
}
/* Long enough for the old code's effect to have written: it ran as soon as
   Home's door was active and the journal open. */
const settle = () => page.waitForTimeout(2500);

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

try {
  await page.goto(base, { waitUntil: 'networkidle' });
  await unlockIfAsked();
  if (await page.locator('[data-leave-setup]').count()) await page.locator('[data-leave-setup]').click();

  await step('an unlocked /?tally= link writes nothing until confirmed, and Cancel writes nothing', async () => {
    const before = await count('misgendered');
    await page.goto(new URL('/?tally=misgendered', base).href, { waitUntil: 'networkidle' });
    await unlockIfAsked();
    await settle();
    assert.equal(await count('misgendered'), before, 'the link wrote before any confirmation');
    const sheet = page.locator('[data-tally-confirm]');
    await sheet.waitFor();
    assert.match(await sheet.innerText(), /Misgender/);
    assert.equal(new URL(page.url()).searchParams.has('tally'), false, 'the proposal stayed in the address');
    await page.locator('[data-tally-confirm-cancel]').click();
    await sheet.waitFor({ state: 'detached' });
    await settle();
    assert.equal(await count('misgendered'), before, 'Cancel wrote');
  });

  await step('a /?tally= link carried through a lock writes nothing after unlocking', async () => {
    const before = await count('correctly_gendered');
    await lock();
    await follow('/?tally=correctly_gendered');
    await unlockIfAsked();
    await settle();
    assert.equal(await count('correctly_gendered'), before, 'unlocking wrote the tally');
    await page.locator('[data-tally-confirm]').waitFor();
    await page.locator('[data-tally-confirm-cancel]').click();
    await page.locator('[data-tally-confirm]').waitFor({ state: 'detached' });
  });

  await step('confirming writes exactly one event and says so; history does not propose it again', async () => {
    const before = await count('misgendered');
    await follow('/?tally=misgendered');
    await page.locator('[data-tally-confirm-log]').click();
    await page.locator('[data-tally-confirm]').waitFor({ state: 'detached' });
    await page.locator('[data-toast]', { hasText: 'Saved' }).waitFor();
    assert.equal(await count('misgendered'), before + 1);
    await follow('/more');
    await page.waitForURL('**/more');
    await page.goBack();
    await page.waitForURL((url) => url.pathname === '/');
    await settle();
    assert.equal(await page.locator('[data-tally-confirm]').count(), 0, 'going back proposed it again');
    assert.equal(await count('misgendered'), before + 1, 'going back wrote again');
  });

  assert.deepEqual(errors, []);
  if (failures) throw new Error(`${failures} case(s) failed`);
} finally {
  await browser.close();
  await server.close();
}
