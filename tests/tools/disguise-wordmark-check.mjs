import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { createServer } from 'vite';
import { launchChromium } from '../browser-harness.mjs';

const before = process.argv.includes('--before');
const out = process.env.WORDMARK_SHOTS;
const gates = process.argv.includes('--gates');
if (gates) execFileSync('npx', ['paraglide-js', 'compile', '--project', './project.inlang', '--outdir', './src/lib/paraglide'], { stdio: 'inherit' });
const server = await createServer({ ...(gates ? { configFile: 'tests/browser-tier/browser-tier.vite.config.ts' } : {}), server: { port: 0, fs: { allow: [process.cwd(), realpathSync('node_modules')] } } });
await server.listen();

const browser = await launchChromium();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
page.setDefaultTimeout(20000);
const base = server.resolvedUrls.local[0];
const errors = [];
page.on('pageerror', error => errors.push(error.message));
let checks = 0;
async function settled() {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(document.getAnimations().filter(a => a.playState === 'running' && a.effect?.getTiming().iterations !== Infinity).map(a => a.finished.catch(() => {})));
  });
}
async function proof(locator, label, name) {
  console.log('CHECK', label);
  await locator.waitFor({ state: 'visible' });
  await locator.scrollIntoViewIfNeeded();
  await settled();
  const text = await locator.innerText();
  if (!before) { assert.ok(text.includes(name), `${label}: ${text}`); if (name !== 'engender') assert.doesNotMatch(text, /engender/i); else assert.doesNotMatch(text, /\b(?:Notes|Notatki)\b/); checks++; }
  if (out) { await mkdir(out, { recursive: true }); await locator.screenshot({ path: `${out}/${before ? 'before' : 'after'}-${label}.png` }); }
}
async function preferences(locale, theme, disguise) {
  await page.evaluate(async ({ locale, theme, disguise, root }) => {
    const { setLocale } = await import(`${root}/src/lib/paraglide/runtime.js`);
    setLocale(locale, { reload: false });
    const { prefs } = await import(`${root}/src/lib/data/prefs/store.svelte.ts`);
    prefs.disguise = disguise; prefs.theme = theme; prefs.palette = 'trans';
    document.documentElement.dataset.theme = theme;
  }, { locale, theme, disguise, root: gates ? `/@fs${process.cwd()}` : '' });
}
try {
  for (const locale of ['en', 'pl']) {
    for (const theme of ['light', 'dark']) {
      for (const disguise of [false, true]) {
        const name = gates && disguise ? locale === 'pl' ? 'Notatki' : 'Notes' : 'engender';
        const tag = `${locale}-${theme}-${disguise ? 'disguised' : 'normal'}`;
        if (!gates) {
          await page.goto(`${base}settings`, { waitUntil: 'networkidle' });
          await page.waitForSelector('[data-app-root][data-boot="ready"]', { timeout: 60000 });
          if (await page.locator('[data-leave-setup]').count()) await page.locator('[data-leave-setup]').click();
          await page.waitForFunction(() => !document.documentElement.hasAttribute('data-splash'));
          await preferences(locale, theme, disguise);
          if (!page.url().includes('/settings')) await page.goto(`${base}settings`, { waitUntil: 'networkidle' });
          await preferences(locale, theme, disguise);
          await proof(page.locator('p.small.muted').filter({ has: page.locator('span[translate="no"]') }), `footer-${tag}`, name);
          await page.locator('[data-list-row="about"]').click();
          await proof(page.locator('.about-lockup'), `about-${tag}`, name);
          if (!before) {
            const messages = await page.evaluate(async () => {
              const { importFailureMessage, verifyFailureMessage } = await import('/src/lib/data/vocabulary/archiveErrorLabels.ts');
              return [importFailureMessage('not-an-archive'), verifyFailureMessage('not-an-archive')];
            });
            for (const text of messages) { assert.ok(text.includes(name), text); assert.doesNotMatch(text, /\b(?:Notes|Notatki)\b/); checks++; }
          }
        } else {
          await page.goto(`${base}gates.html`, { waitUntil: 'networkidle' });
          await page.getByLabel('Scene', { exact: true }).waitFor();
          await preferences(locale, theme, disguise);
          await page.getByLabel('Theme', { exact: true }).selectOption(theme);
          for (const scene of ['device-recovery', 'device-recovery-with-key', 'boot-failure-below-baseline']) {
            await page.getByLabel('Scene', { exact: true }).selectOption(scene);
            await proof(page.locator(scene.startsWith('device') ? '[data-device-bound-recovery]' : '[data-boot-failure-sentence]'), `${scene}-${tag}`, name);
          }
        }
      }
    }
  }
  assert.deepEqual(errors, []);
  console.log(`${before ? 'BASELINE captures' : 'PASS'}: ${checks} wordmark checks`);
} finally { await browser.close(); await server.close(); }
