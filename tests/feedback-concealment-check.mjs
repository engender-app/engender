import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { createServer } from 'vite';
import { launchChromium } from './browser-harness.mjs';

const server = await createServer({
  cacheDir: '.svelte-kit/feedback-vite',
  server: { port: 0, fs: { allow: [process.cwd(), realpathSync('node_modules')] } }
});
await server.listen();
const browser = await launchChromium();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
let checks = 0;
function ok(value, message) { assert.ok(value, message); checks++; console.log(`PASS ${message}`); }

async function feedback(pending) {
  await page.evaluate(async pending => {
    const { announce } = await import('/src/lib/stores/announcer.svelte.ts');
    const { toast } = await import('/src/lib/stores/toasts.svelte.ts');
    window.feedbackActions = 0;
    toast('08-private-Estrofem', { duration: 60000, actionLabel: '08-private-milestone',
      onAction: () => { window.feedbackActions++; } });
    announce('08-private-Estrofem');
    announce('08-private-milestone', true);
    window.feedbackLeaks = [];
    window.feedbackToastLeaks = [];
    window.feedbackConcealed = false;
    window.feedbackObserver?.disconnect();
    window.feedbackObserver = new MutationObserver(() => {
      if (!window.feedbackConcealed) return;
      const regions = [...document.querySelectorAll('[data-announce], [data-announce-urgent]')];
      if (regions.some(region => region.textContent.includes('08-private-'))) window.feedbackLeaks.push('live region');
      const concealed = document.querySelector('[data-applock]') || document.querySelector('[data-app-root]')?.classList.contains('disguised');
      if (concealed && [...document.querySelectorAll('[data-toast]')].some(toast => toast.textContent.includes('08-private-'))) window.feedbackToastLeaks.push('toast during concealment render');
    });
    window.feedbackObserver.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true });
    if (!pending) await new Promise(resolve => setTimeout(resolve, 150));
  }, pending);
}
async function cleared(label) {
  ok(await page.locator('[data-toast]').count() === 0, `${label}: outgoing toast DOM removed`);
  ok(await page.evaluate(() => window.feedbackToastLeaks.length === 0), `${label}: private toast absent at first concealment render`);
  ok(await page.evaluate(async () => (await import('/src/lib/stores/toasts.svelte.ts')).toasts.length === 0), `${label}: toast collection empty`);
  ok(await page.locator('[data-announce]').textContent() === '' && await page.locator('[data-announce-urgent]').textContent() === '', `${label}: both live regions empty`);
  await page.waitForTimeout(150); // Observe beyond the announcer's specified 100 ms timer gap.
  ok(await page.evaluate(() => window.feedbackLeaks.length === 0), `${label}: delayed writes stay cancelled`);
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  ok(await page.evaluate(() => window.feedbackActions === 0), `${label}: old action cannot be reached by keyboard`);
}
async function generic(label) {
  await page.evaluate(async () => (await import('/src/lib/stores/announcer.svelte.ts')).announce('08-generic-retry', true));
  await page.waitForFunction(() => document.querySelector('[data-announce-urgent]')?.textContent === '08-generic-retry');
  ok(await page.locator('[data-announce]').textContent() === '', `${label}: generic gate feedback remains announceable`);
  await page.evaluate(() => { window.feedbackConcealed = false; });
}
async function unlock() {
  await page.locator('#session-passphrase').fill('demo');
  await page.locator('[data-session-submit]').click();
  await page.locator('[data-applock]').waitFor({ state: 'detached' });
  await page.waitForSelector('[data-nav-item="home"]');
}
try {
  await page.goto(server.resolvedUrls.local[0], { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]', { timeout: 60000 });
  if (await page.locator('[data-leave-setup]').count()) await page.locator('[data-leave-setup]').click();
  await page.evaluate(async () => {
    const { prefs } = await import('/src/lib/data/prefs/store.svelte.ts');
    prefs.lockAfter = 'immediately'; prefs.disguise = false;
  });
  for (const pending of [false, true]) {
    await feedback(pending);
    if (!pending) ok(await page.locator('[data-toast-action]').count() === 1, 'private actionable toast is mounted before lock');
    await page.evaluate(() => {
      window.feedbackConcealed = true;
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
      delete document.visibilityState;
    });
    await page.locator('[data-applock]').waitFor();
    await cleared(`lock ${pending ? 'pending' : 'visible'}`);
    await generic('locked');
    await unlock();
  }
  for (const pending of [false, true]) {
    await page.evaluate(async () => { (await import('/src/lib/data/prefs/store.svelte.ts')).prefs.disguise = false; });
    await page.waitForFunction(() => !document.querySelector('[data-app-root]')?.classList.contains('disguised'));
    await feedback(pending);
    await page.evaluate(async () => {
      window.feedbackConcealed = true;
      (await import('/src/lib/data/prefs/store.svelte.ts')).prefs.disguise = true;
    });
    await page.waitForFunction(() => document.querySelector('[data-app-root]')?.classList.contains('disguised'));
    await cleared(`disguise ${pending ? 'pending' : 'visible'}`);
    await generic('disguised');
  }
  await page.evaluate(async () => {
    (await import('/src/lib/data/prefs/store.svelte.ts')).prefs.disguise = false;
  });
  await page.waitForFunction(() => !document.querySelector('[data-app-root]')?.classList.contains('disguised'));
  await page.evaluate(async () => {
    const { announce } = await import('/src/lib/stores/announcer.svelte.ts');
    window.feedbackDeliveries = 0;
    window.feedbackObserver.disconnect();
    window.feedbackObserver = new MutationObserver(() => {
      if (document.querySelector('[data-announce]')?.textContent === '08-fresh-announcement') window.feedbackDeliveries++;
    });
    window.feedbackObserver.observe(document.querySelector('[data-announce]'), { subtree: true, childList: true, characterData: true });
    announce('08-fresh-announcement');
    announce('08-fresh-announcement');
  });
  await page.waitForFunction(() => document.querySelector('[data-announce]')?.textContent === '08-fresh-announcement');
  await page.waitForTimeout(150); // A cancelled duplicate cannot deliver after the 100 ms gap.
  ok(await page.evaluate(() => window.feedbackDeliveries === 1), 'fresh authenticated announcement arrives once without stale text');
  await page.evaluate(async () => {
    document.documentElement.style.zoom = '2';
    const { toast } = await import('/src/lib/stores/toasts.svelte.ts');
    toast('08-fresh-feedback', { actionLabel: '08-fresh-action', onAction: () => { window.feedbackActions++; } });
  });
  const action = page.getByRole('button', { name: '08-fresh-action', exact: true });
  await action.focus();
  await page.keyboard.press('Enter');
  ok(await page.evaluate(() => window.feedbackActions === 1), 'fresh authenticated toast action works by keyboard at 200% zoom');
  ok(await page.locator('[data-live-regions]').count() === 1 && await page.locator('[data-announce]').count() === 1 && await page.locator('[data-announce-urgent]').count() === 1, 'permanent live regions are not duplicated');
  ok(errors.length === 0, 'no uncaught page errors');
  assert.equal(checks, 33, 'all concealment checks ran');
  console.log(`Feedback concealment passed: ${checks} checks`);
} finally {
  await page.close();
  await browser.close();
  await server.close();
}
