/* Lock the demo journal mid-session. Confirm Web Storage reveals no
   snoozes, categories, letters or search state and old plaintext keys
   migrate and disappear on unlock. Disguise keeps palette mirrors
   neutral until unlock. Failed unlock and reset clear journal text
   from notices and live regions. An open quick-add fan cannot carry
   a real or scripted click into the next session. */

import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { createServer } from 'vite';
import { launchChromium } from '../browser-harness.mjs';

const server = await createServer({
  cacheDir: '.svelte-kit/lock-leaves-vite',
  server: { port: 0, fs: { allow: [process.cwd(), realpathSync('node_modules')] } }
});
await server.listen();
const browser = await launchChromium();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
let failures = 0;
function check(value, message) {
  if (value) console.log(`PASS ${message}`);
  else {
    failures++;
    console.log(`FAIL ${message}`);
  }
}

const LETTER = '0f6c2a1e-7b9d-4c3e-8a51-2d4f6b8e9c10';
const TILES = ['active-tryout-tile', 'patch-schedule-tile', 'voice-benchmark-nudge', 'pause-active-banner',
  'hair-removal-recovery', 'measurements-nudge', 'ready-letter'];
/* What no key or value left in Web Storage may name. */
const TELLS = [...TILES, 'tryout', 'patch', 'voice', 'pause', 'hair', 'measurement', 'letter', 'stock', 'snooze',
  'has-entries', 'reserve', 'dilation', 'search-return', 'canyon4177'];
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const navigate = (path) =>
  page.evaluate((destination) => {
    const link = document.createElement('a');
    link.href = destination;
    document.body.append(link);
    link.click();
    link.remove();
  }, path);

async function lock() {
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    delete document.visibilityState;
  });
  await page.locator('[data-applock]').waitFor();
}

async function unlock(secret = 'demo') {
  await page.locator('#session-passphrase').fill(secret);
  await page.locator('[data-session-submit]').click();
  await page.locator('[data-applock]').waitFor({ state: 'detached' });
  await page.waitForSelector('[data-nav-item="home"]');
}

/** Every Web Storage entry, as `store:key=value`. */
const webStorage = () =>
  page.evaluate(() =>
    [['local', localStorage], ['session', sessionStorage]].flatMap(([name, store]) =>
      Object.keys(store).map((key) => `${name}:${key}=${store.getItem(key)}`)));

function readable(entries) {
  return entries.filter((entry) => {
    const lower = entry.toLowerCase();
    /* The entry draft is ciphertext under the journal key. */
    if (lower.startsWith('local:engender-entry-draft=')) return false;
    /* Home's three heights, which name no screen (homeReserve.ts). */
    if (/^local:engender-home-reserve-(above|below|pinned)=\d+$/.test(entry)) return false;
    return TELLS.some((tell) => lower.includes(tell)) || UUID.test(entry);
  });
}

try {
  await page.goto(server.resolvedUrls.local[0], { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]', { timeout: 90000 });
  if (await page.locator('[data-leave-setup]').count()) await page.locator('[data-leave-setup]').click();
  await page.evaluate(async () => {
    const { prefs } = await import('/src/lib/data/prefs/store.svelte.ts');
    prefs.lockAfter = 'immediately';
    prefs.disguise = false;
    prefs.palette = 'nonbinary';
  });

  /* ---- Web Storage after the lock (GD-035, GD-038, GD-041, GD-014) ---- */
  await page.evaluate(async ({ tiles, letter }) => {
    const { acknowledgementStore } = await import('/src/lib/data/prefs/acknowledgementStore.svelte.ts');
    const { snoozeTile } = await import('/src/lib/data/liveTilesSnooze.ts');
    const { markLetterRead, markLetterGreeted } = await import('/src/lib/data/letterStatus.ts');
    const { snoozeStockNotice } = await import('/src/lib/data/stockProjection.ts');
    const { rememberReserve } = await import('/src/lib/data/homeReserve.ts');
    for (const tile of tiles) snoozeTile(tile, acknowledgementStore);
    markLetterRead(letter, acknowledgementStore);
    markLetterGreeted(letter, acknowledgementStore);
    /* Called with the store: the old signature took (now, storage) and
       writes its plaintext key whatever it is handed, which is the point. */
    snoozeStockNotice(acknowledgementStore);
    rememberReserve('dilation', 321);
  }, { tiles: TILES, letter: LETTER });
  await navigate('/health/dilation');
  await page.waitForURL((url) => url.pathname === '/health/dilation');
  await page.waitForTimeout(1500);
  await navigate('/search');
  await page.waitForURL((url) => url.pathname === '/search');
  await page.locator('#q').fill('canyon4177');
  await page.waitForTimeout(600);
  if (await page.locator('[data-entry-card]').count()) {
    await page.locator('[data-entry-card]').first().click();
    await page.waitForURL((url) => url.pathname.startsWith('/entry/'));
  }
  check(readable(await webStorage()).every((entry) => !entry.includes('canyon4177')),
    'GD-014: an opened search result leaves its query out of Web Storage');
  await navigate('/');
  await page.waitForURL((url) => url.pathname === '/');
  await page.waitForTimeout(1500);
  await lock();
  const afterLock = await webStorage();
  console.log('  storage after lock:', JSON.stringify(afterLock.map((entry) => entry.slice(0, 80))));
  check(readable(afterLock).length === 0,
    `GD-035/038/041: locked Web Storage names no tile, category, letter, reserve or search (${JSON.stringify(readable(afterLock))})`);
  check(afterLock.every((entry) => !entry.startsWith('session:')), 'GD-014: sessionStorage holds nothing after the lock');
  await unlock();

  /* ---- A legacy fixture moves into the journal and goes ---- */
  await page.evaluate(async () => {
    /* Forget what the first round wrote, so only the fixture can answer.
       While unlocked: a write made while locked is replayed over whatever
       the unlock moves in. */
    const { prefs } = await import('/src/lib/data/prefs/store.svelte.ts');
    prefs.acknowledgements = { snoozes: {}, readLetterIds: [], greetedLetterIds: [], hasEntries: null };
  });
  await page.waitForTimeout(300);
  await lock();
  const now = await page.evaluate(() => Date.now());
  await page.evaluate(({ letter, now }) => {
    localStorage.setItem('engender-tile-snooze-patch-schedule-tile', String(now + 3_600_000));
    localStorage.setItem('engender-tile-snooze-measurements-nudge', String(now - 3_600_000));
    localStorage.setItem('engender-stock-notice-snooze-until', String(now + 7_200_000));
    localStorage.setItem('engender-read-letter-ids', JSON.stringify([letter]));
    localStorage.setItem('engender-reserve-dilation', '444');
  }, { letter: LETTER, now });
  await unlock();
  await page.waitForTimeout(800);
  const legacy = await webStorage();
  check(readable(legacy).length === 0, `legacy plaintext keys are deleted on unlock (${JSON.stringify(readable(legacy))})`);
  const moved = await page.evaluate(async (now) => {
    const { prefs } = await import('/src/lib/data/prefs/store.svelte.ts');
    const { snoozes, readLetterIds } = prefs.acknowledgements;
    return {
      patch: snoozes['patch-schedule-tile'] === now + 3_600_000,
      stock: snoozes['stock-notice'] === now + 7_200_000,
      expired: !('measurements-nudge' in snoozes),
      letters: readLetterIds.length === 1
    };
  }, now);
  check(moved.patch && moved.stock && moved.letters, `legacy snoozes, stock notice and letters land in the journal (${JSON.stringify(moved)})`);
  check(moved.expired, 'an expired legacy snooze is dropped, not carried');

  /* ---- Disguise: neutral before unlock, real after (GD-043) ---- */
  await page.evaluate(async () => {
    (await import('/src/lib/data/prefs/store.svelte.ts')).prefs.disguise = true;
  });
  await page.waitForFunction(() => document.title === 'Notes');
  await lock();
  const disguised = await page.evaluate(() => ({
    mirror: JSON.parse(localStorage.getItem('engender-boot-prefs') || '{}').palette,
    painted: document.documentElement.dataset.palette
  }));
  check(disguised.mirror === 'notes', `GD-043: the boot mirror holds only the neutral palette (${disguised.mirror})`);
  check(disguised.painted === 'notes', `GD-043: the locked screen paints the neutral palette (${disguised.painted})`);
  await unlock();
  await page.waitForFunction(() => document.documentElement.dataset.palette === 'nonbinary', null, { timeout: 5000 })
    .catch(() => {});
  check(await page.evaluate(() => document.documentElement.dataset.palette) === 'nonbinary',
    'GD-043: the real palette applies after unlock');
  await page.evaluate(async () => {
    (await import('/src/lib/data/prefs/store.svelte.ts')).prefs.disguise = false;
  });
  await page.waitForFunction(() => document.title === 'engender');

  /* ---- Quick add across the lock (GD-040) ---- */
  await page.evaluate(async () => {
    const { onTablesWritten } = await import('/src/lib/data/live/tableVersions.svelte.ts');
    window.lockWrites = [];
    window.lockWatching = false;
    onTablesWritten((tables) => { if (window.lockWatching) window.lockWrites.push(...tables); });
  });
  await page.locator('[data-nav-fab]').first().click();
  await page.locator('[data-fan] [data-fan-target]').first().waitFor();
  await page.waitForTimeout(400);
  const targets = await page.evaluate(() =>
    [...document.querySelectorAll('[data-fan] [data-fan-target]')].map((node) => {
      const box = node.getBoundingClientRect();
      return { name: node.getAttribute('data-fan-target'), x: box.x + box.width / 2, y: box.y + box.height / 2 };
    }));
  check(targets.length >= 3, `the fan is open with its targets (${targets.map((t) => t.name).join(', ')})`);
  await page.evaluate(() => {
    window.lockWatching = true;
    /* The lock, then every fan target clicked by script in the next frame:
       the outro keeps them in the document for its fade. */
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    delete document.visibilityState;
    requestAnimationFrame(() => {
      window.lockClicked = 0;
      for (const node of document.querySelectorAll('[data-fan] [data-fan-target]')) {
        window.lockClicked++;
        node.click();
      }
    });
  });
  for (const target of targets) await page.mouse.click(target.x, target.y);
  await page.locator('[data-applock]').waitFor();
  await page.waitForTimeout(400);
  if (process.env.LOCK_PROBE_SHOT) await page.screenshot({ path: process.env.LOCK_PROBE_SHOT });
  check(await page.locator('[data-sheet-scrim]').count() === 0, 'GD-040: no sheet the fan opened covers the gate');
  let unlocked = true;
  try {
    await unlock();
  } catch {
    unlocked = false;
  }
  check(unlocked, 'GD-040: the gate stays usable after the fan clicks');
  if (unlocked) {
    await page.waitForTimeout(1500);
    console.log(`  fan targets still in the document in the lock's first frame: ${await page.evaluate(() => window.lockClicked)}`);
    const written = await page.evaluate(() => [...new Set(window.lockWrites)]
      .filter((table) => ['tally', 'entry', 'dose', 'wearSession'].includes(table)));
    check(written.length === 0, `GD-040: no fan click made across the lock reached the next session (${written.join(', ')})`);
    await page.evaluate(() => { window.lockWatching = false; });
  } else {
    check(false, 'GD-040: writes across the lock could not be counted, the gate never let go');
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('[data-app-root][data-boot="ready"]', { timeout: 90000 });
  }

  /* ---- Feedback after a failed unlock and a reset (GD-023) ---- */
  const leaked = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('[data-toast], [data-announce], [data-announce-urgent]')]
        .some((node) => node.textContent?.includes('08-private-')));
  await page.evaluate(async () => {
    (await import('/src/lib/stores/toasts.svelte.ts')).toast('08-private-Estrofem', { duration: 60000 });
  });
  await lock();
  await page.locator('#session-passphrase').fill('not the secret');
  await page.locator('[data-session-submit]').click();
  await page.waitForTimeout(1200);
  check(!(await leaked()), 'GD-023: a failed unlock leaves no journal text in a toast or a live region');
  await page.evaluate(async () => {
    /* Text that reached a store while the gate was up, a late read's toast. */
    (await import('/src/lib/stores/toasts.svelte.ts')).toast('08-private-late', { duration: 60000 });
    await (await import('/src/lib/stores/boot.svelte.ts')).resetApp();
  });
  await page.waitForTimeout(1500);
  check(!(await leaked()), 'GD-023: a reset leaves no journal text in a toast or a live region');

  check(errors.length === 0, `no uncaught page errors (${errors.join(' | ')})`);
  assert.equal(failures, 0, `${failures} lock check(s) failed`);
  console.log('Lock leaves nothing readable: passed');
} finally {
  await page.close();
  await browser.close();
  await server.close();
}
