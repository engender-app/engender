/* Real browser clock changes keep the mounted PIN gate throttled.
   Run: node tests/browser-tier/pin-wait-clock-jump.mjs. */
import assert from 'node:assert/strict';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { launchChromium } from '../browser-harness.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const source = `/@fs${resolve(here, '../../src/lib')}`;
const server = await createServer({ configFile: `${here}/browser-tier.vite.config.ts`, server: { port: 0 } });
let browser;
try {
await server.listen();
const origin = server.resolvedUrls.local[0].replace(/\/$/, '');
browser = await launchChromium();
const context = await browser.newContext();
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const results = [];
const note = (name, value) => { results.push({ name, ...value }); console.log(JSON.stringify({ name, ...value })); };

await page.clock.install({ time: new Date('2026-11-20T10:00:00Z') });
await page.addInitScript(() => { window.__DEMO__ = false; window.__APP_VERSION__ = '0.0.0-t10'; });

async function load() {
  await page.goto(`${origin}/cold-unlock.html`);
  await page.evaluate(async (source) => {
    window.coldBoot = await import(`${source}/stores/boot.svelte.ts`);
    window.coldLock = await import(`${source}/stores/lock.svelte.ts`);
    window.coldPrefs = await import(`${source}/data/prefs/store.svelte.ts`);
    coldBoot.startBoot();
    coldLock.watchLock(coldBoot.closeJournalForLock);
  }, source);
}
async function mountGate() {
  await page.waitForFunction(() => coldBoot.bootState.status === 'needs-unlock');
  await page.evaluate(async (source) => {
    const { mountInto } = await import('/mount.ts');
    const { default: Gate } = await import(`${source}/components/JournalGate.svelte`);
    mountInto(Gate, {}, document.getElementById('gate'));
  }, source);
  await page.waitForSelector('[data-pin-status]', { state: 'attached' });
}
const status = () => page.evaluate(() => {
  const el = document.querySelector('[data-pin-status]');
  const pad = document.querySelector('[data-key="1"]');
  return { status: el?.getAttribute('data-pin-status'), text: el?.textContent.trim(), padDisabled: pad?.disabled,
    stored: localStorage.getItem('engender-pin-attempts'), now: Date.now() };
});
const pnow = () => page.evaluate(() => Date.now());  // page time, not Node's
const seconds = (s) => Number((s.text.match(/\d+/) ?? [0])[0]);

// setup: a PIN journal, lock timing five minutes
await load();
await page.waitForFunction(() => coldBoot.bootState.status === 'needs-setup');
assert.equal(await page.evaluate(() => coldBoot.submitAccessModeSetup('pin', '1234')), 'ok');
await page.waitForFunction(() => coldBoot.bootState.status === 'ready');
await page.evaluate(() => coldPrefs.setPreferenceDurably('lockAfter', 'five-minutes'));

// forged wait, as walkthrough does: 8 wrong attempts owe 60 s
const forge = () => page.evaluate(() => localStorage.setItem('engender-pin-attempts', JSON.stringify({ wrongAttempts: 8, acceptingFrom: Date.now() + 60000 })));
await forge();
await load(); await mountGate();
let s = await status();
note('A1 fresh load with a 60 s wait pending', { status: s.status, seconds: seconds(s), padDisabled: s.padDisabled });

await page.clock.runFor(6000);
await load(); await mountGate();
s = await status();
note('A2 reload 6 s into the wait (wall and monotonic both moved 6 s)', { status: s.status, seconds: seconds(s), padDisabled: s.padDisabled });

// forward jump, no reload
await page.clock.setSystemTime(new Date((await pnow()) + 3600_000));
await page.clock.runFor(1500);
s = await status();
note('B1 system time +1 h, page left open', { status: s.status, seconds: seconds(s), padDisabled: s.padDisabled });

// forward jump then reload
await load(); await mountGate();
s = await status();
note('B2 system time +1 h, then reload', { status: s.status, seconds: seconds(s), padDisabled: s.padDisabled, stored: s.stored });

// forward jump of 10 years then reload
await page.clock.setSystemTime(new Date((await pnow()) + 10 * 365 * 86400_000));
await load(); await mountGate();
s = await status();
note('B3 system time +10 years, then reload', { status: s.status, seconds: seconds(s), padDisabled: s.padDisabled });

// back jump then reload
await page.clock.setSystemTime(new Date('2026-11-18T10:00:00Z'));
await load(); await mountGate();
s = await status();
note('C1 system time back 2 days, then reload', { status: s.status, seconds: seconds(s), padDisabled: s.padDisabled });

// stale acceptingFrom in the past (what a forward jump looks like to the stored value)
await page.evaluate(() => localStorage.setItem('engender-pin-attempts', JSON.stringify({ wrongAttempts: 8, acceptingFrom: 1 })));
await load(); await mountGate();
s = await status();
note('D1 stored acceptingFrom already in the past (as after a forward jump), reload', { status: s.status, seconds: seconds(s), padDisabled: s.padDisabled });

// clean state, unlock, then leave-lock under clock moves
await page.evaluate(() => localStorage.removeItem('engender-pin-attempts'));
await load(); await mountGate();
const type = async () => { for (const d of '1234') await page.locator(`[data-key="${d}"]`).click(); };
await type();
await page.waitForFunction(() => coldBoot.bootState.status === 'ready');
const hide = () => page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
const show = () => page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); document.dispatchEvent(new Event('visibilitychange')); });
const locked = () => page.evaluate(() => coldLock.isLocked(coldBoot.bootState.accessMode));
await page.evaluate(() => coldPrefs.setPreferenceDurably('lockAfter', 'five-minutes'));
note('E0 unlocked, lockAfter read back', { locked: await locked(), lockAfter: await page.evaluate(() => coldPrefs.prefs.lockAfter) });
await hide(); await show();
note('E1a hidden then shown at once (control, no clock change)', { locked: await locked() });
await hide(); await page.clock.setSystemTime(new Date((await pnow()) + 2 * 60_000)); await show();
note('E1 hidden, clock +2 min, shown (limit 5 min)', { locked: await locked() });
await hide(); await page.clock.setSystemTime(new Date((await pnow()) + 10 * 60_000)); await show();
note('E2 hidden, clock +10 min, shown', { locked: await locked() });
if (await locked()) { await page.evaluate(() => { localStorage.removeItem('engender-pin-attempts'); }); await load(); await mountGate(); for (const d of '1234') await page.locator(`[data-key="${d}"]`).click(); await page.waitForFunction(() => coldBoot.bootState.status === 'ready'); await page.evaluate(() => coldPrefs.setPreferenceDurably('lockAfter', 'five-minutes')); }
await hide(); await page.clock.setSystemTime(new Date((await pnow()) - 3600_000)); await show();
note('E3 hidden, clock BACK 1 h, shown', { locked: await locked() });
// re-unlock
await page.waitForFunction(() => coldBoot.bootState.status !== undefined);
const by = (prefix) => results.find((r) => r.name.startsWith(prefix));
const failures = [];
for (const k of ['A1', 'A2', 'B1', 'B2', 'B3', 'C1', 'D1']) {
  const r = by(k);
  if (!(r.status === 'throttled' && r.padDisabled && r.seconds >= (k === 'B1' ? 58 : 59) && r.seconds <= 60)) failures.push(`${k}: wait ended or shortened (${JSON.stringify(r)})`);
}
if (by('E1a').locked !== false) failures.push('E1a: locked without an absence');
if (by('E1 ').locked !== false) failures.push('E1: locked after only 2 min away');
if (by('E2').locked !== true) failures.push('E2: not locked after 10 min away');
if (by('E3').locked !== true) failures.push('E3: not locked after clock moved back');
if (errors.length) failures.push(`uncaught page errors: ${errors.join('; ')}`);
console.log(JSON.stringify({ errors }));
console.log(failures.length ? 'PROBE FAIL\n' + failures.join('\n') : 'PROBE PASS');
process.exitCode = failures.length ? 1 : 0;
} finally {
  await browser?.close();
  await server.close();
}
