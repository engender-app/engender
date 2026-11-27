/* Linux engine emulation with Safari user agents. This checks notice
   selection and rendering, never Safari storage eviction or Apple hardware. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { launchBrowser, newCapabilityContext } from '../browser-harness.mjs';
import { serveBuild } from '../serve-build.mjs';
import { firstRun } from '../browser-tier/built-flow.mjs';

const before = process.argv.includes('--before');
const out = process.env.NOTICE_SHOTS;
const results = [];
const ios = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1';
const mac = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15';
const server = await serveBuild(process.cwd());
const browser = await launchBrowser();
const origin = `http://localhost:${server.httpServer.address().port}`;
try {
  const cases = before ? [{ name: 'ios', userAgent: ios, denied: true, target: null }] : [
    ...[false, true].flatMap(denied => [
      { name: `ios-${denied}`, userAgent: ios, denied, target: 'ios' },
      { name: `mac-${denied}`, userAgent: mac, denied, target: 'mac' }
    ]),
    { name: 'ipad-desktop', userAgent: mac, denied: false, target: 'ios', touch: 5 },
    { name: 'standalone-denied', userAgent: mac, denied: true, standalone: true, target: null },
    { name: 'standalone', userAgent: ios, denied: false, standalone: true, target: null },
    { name: 'legacy-standalone', userAgent: ios, denied: false, legacyStandalone: true, target: null },
    { name: 'chrome-ios', userAgent: ios.replace('Version/18.0', 'CriOS/130.0'), denied: false, target: null },
    { name: 'non-safari-denied', userAgent: 'Mozilla/5.0 Chrome/130.0 Safari/537.36', denied: true, target: null },
    { name: 'polish-ios', userAgent: ios, denied: false, target: 'ios', locale: 'pl-PL' },
    { name: 'polish', userAgent: mac, denied: false, target: 'mac', locale: 'pl-PL' },
    { name: 'reduced-motion', userAgent: ios, denied: false, target: 'ios', reducedMotion: 'reduce' }
  ];
  for (const c of cases) {
    const context = await newCapabilityContext(browser, { userAgent: c.userAgent, viewport: { width: 390, height: 900 }, locale: c.locale ?? 'en-US', reducedMotion: c.reducedMotion ?? 'no-preference' });
    try {
      await context.addInitScript(({ denied, standalone, legacyStandalone, touch }) => {
        // WebKit's later storage access must keep the simulated answer.
        Object.defineProperty(Object.getPrototypeOf(navigator.storage), 'persist', { value: async () => !denied, configurable: true });
        if (touch) Object.defineProperty(navigator, 'maxTouchPoints', { value: touch });
        if (legacyStandalone) Object.defineProperty(navigator, 'standalone', { value: true });
        if (standalone) {
          const matchMedia = window.matchMedia.bind(window);
          window.matchMedia = query => query === '(display-mode: standalone)' ? { ...matchMedia(query), matches: true, addEventListener() {}, removeEventListener() {} } : matchMedia(query);
        }
      }, c);
      const page = await context.newPage();
      page.setDefaultTimeout(60000);
      page.on('pageerror', error => console.error('PAGEERROR', error.stack));
      await firstRun(page, origin).catch(async error => { console.error('DOCUMENT', await page.locator('body').innerText()); throw error; });
      assert.equal(await page.evaluate(() => navigator.storage.persist()), !c.denied, 'persistence simulation must match case');
      await page.locator('[data-home-reserve="below"] [data-read-reserve-body]').waitFor({ state: 'attached' });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForFunction(() => {
        const body = document.querySelector('[data-home-reserve="below"] [data-read-reserve-body]');
        if (!body || document.documentElement.dataset.nav) return false;
        for (let node = document.querySelector('[data-storage-notice]') ?? body; node; node = node.parentElement) {
          if (Number(getComputedStyle(node).opacity) < 1 || node.getAnimations().some(a =>
            a.playState === 'running' && a.effect?.getComputedTiming().iterations !== Infinity)) return false;
        }
        return true;
      });
      const notice = page.locator('[data-storage-notice]');
      if (c.target || c.denied) {
        await notice.waitFor();
        const text = await notice.innerText();
        const pl = c.locale === 'pl-PL';
        assert.ok(text.includes(c.target ? (pl ? 'Safari może usunąć dziennik' : 'Safari may clear your journal') : 'This browser may clear your journal'));
        if (c.target) assert.ok(text.includes(c.target === 'ios' ? (pl ? 'Do ekranu początkowego' : 'Add to Home Screen') : pl ? 'Dodaj do Docka' : 'Add to Dock'));
        assert.equal(await notice.locator('[data-notice-action]').getAttribute('href'), '/settings/export');
        assert.equal(await notice.locator('.kit-notice-body').evaluate(node => node.scrollWidth <= node.clientWidth), true, 'notice text must fit its column');
        assert.ok(await notice.locator('[data-notice-dismiss]').getAttribute('aria-label'));
        if (out && (before || c.name === 'ios-false' || c.name === 'mac-false')) {
          await mkdir(out, { recursive: true });
          for (const theme of ['light', 'dark']) {
            await page.evaluate(theme => { document.documentElement.dataset.palette = 'trans'; document.documentElement.dataset.theme = theme; }, theme);
            await notice.screenshot({ path: `${out}/${before ? 'before' : 'after'}-${c.name}-${theme}.png` });
          }
        }
        const frames = await page.evaluate(async () => {
          const node = document.querySelector('[data-storage-notice]');
          const frames = [];
          const sample = () => {
            const style = getComputedStyle(node);
            frames.push({ at: performance.now(), height: node.isConnected ? node.getBoundingClientRect().height : 0, opacity: node.isConnected ? Number(style.opacity) : 0, overflow: style.overflow });
          };
          sample();
          node.querySelector('[data-notice-dismiss]').click();
          while (node.isConnected && frames.length < 180) {
            await new Promise(requestAnimationFrame);
            sample();
          }
          return frames;
        });
        await notice.waitFor({ state: 'detached' });
        if (c.target && !c.reducedMotion) {
          const full = frames[0].height;
          assert.ok(frames.filter(f => f.height > 0 && f.height < full - 1).length >= 2, 'notice dismissal must retain intermediate painted heights');
        }
        results.push({ name: c.name, pass: true, target: c.target, persistDenied: c.denied, dismissalFrames: frames });
      } else { assert.equal(await notice.count(), 0); results.push({ name: c.name, pass: true, target: null, persistDenied: c.denied }); }
    } finally { await context.close(); }
  }
} finally {
  await browser.close();
  await server.close();
  const evidence = { environment: 'Linux engine emulation with Safari UA; no Safari eviction proof', engine: process.env.BROWSER_ENGINE ?? 'chromium', before, results };
  if (process.env.NOTICE_RESULTS) await writeFile(process.env.NOTICE_RESULTS, JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify(evidence, null, 2));
}
