import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'vite';
import { launchChromium } from './browser-harness.mjs';

// Real router and lock shell. Only permission completion and device tracks
// are synthetic; cancelled results still pass through production capture.
const gallery = process.argv.includes('--gallery');
const out = '.claude/entry-capture-shots';
if (gallery) await mkdir(out, { recursive: true });
const server = await createServer({ server: { port: 0, watch: null } });
await server.listen();
const browser = await launchChromium({ args: [
  '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'
] });
const rows = [];
let epochDay = 20_000;
try {
  for (const language of ['en', 'pl']) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.setDefaultTimeout(15000);
    try {
      await page.goto(server.resolvedUrls.local[0], { waitUntil: 'networkidle' });
      await page.waitForSelector('[data-app-root][data-boot="ready"]', { timeout: 60000 });
      if (await page.locator('[data-leave-setup]').count()) await page.locator('[data-leave-setup]').click();
      await page.evaluate(async language => {
        const { prefs } = await import('/src/lib/data/prefs/store.svelte.ts');
        const { setLocale } = await import('/src/lib/paraglide/runtime.js');
        const { changeAccessMode } = await import('/src/lib/stores/boot.svelte.ts');
        prefs.language = language;
        prefs.lockAfter = 'immediately';
        prefs.palette = 'trans';
        setLocale(language, { reload: false });
        await changeAccessMode('pin', '1234');
        const open = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
        const Recorder = window.MediaRecorder;
        window.MediaRecorder = new Proxy(Recorder, {
          construct(Type, args) { window.captureProbe.recorders++; return Reflect.construct(Type, args); }
        });
        navigator.mediaDevices.getUserMedia = async constraints => {
          const owner = window.captureProbe;
          owner.requests++;
          await new Promise(resolve => { owner.release = resolve; });
          if (owner.refusal) throw new DOMException('synthetic permission refusal', 'NotAllowedError');
          const stream = await open(constraints);
          owner.streams.push(stream);
          return stream;
        };
      }, language);
      for (const kind of ['voice', 'video']) {
        for (const departure of ['navigation', 'lock']) {
          for (const { refusal, phase } of [
            { refusal: false, phase: 'pending' }, { refusal: true, phase: 'pending' },
            { refusal: false, phase: 'active' }
          ]) {
            const theme = refusal ? 'dark' : 'light';
            await page.evaluate(async ({ kind, refusal, theme, epochDay }) => {
              const { goto } = await import('/node_modules/@sveltejs/kit/src/runtime/app/navigation.js');
              const { prefs } = await import('/src/lib/data/prefs/store.svelte.ts');
              const { clearToasts } = await import('/src/lib/stores/toasts.svelte.ts');
              clearToasts();
              prefs.theme = theme;
              localStorage.removeItem('engender-entry-draft');
              window.captureProbe = { kind, refusal, requests: 0, recorders: 0, streams: [] };
              await goto(`/entry/new/${epochDay}?seedMood=3`);
            }, { kind, refusal, theme, epochDay: epochDay++ });
            const chip = page.locator(`[data-section-chip="${kind}"]`);
            if (await chip.getAttribute('aria-expanded') !== 'true') await chip.click();
            const section = page.locator(`[data-editor-section="${kind}"]`);
            const capture = section.locator('.photo-add').first();
            const label = await capture.getAttribute('aria-label');
            assert.equal((await capture.innerText()).trim(), label, `${language}: accessible name matches visible capture label`);
            await capture.focus();
            const before = await capture.boundingBox();
            if (gallery && departure === 'navigation' && phase === 'pending') await section.screenshot({ path: `${out}/${language}-${kind}-${theme}-idle.png` });
            await page.keyboard.press('Enter');
            await page.waitForFunction(() => window.captureProbe.requests === 1);
            // Dispatch another activation while permission remains pending;
            // the owner must reject synthetic events as well as real taps.
            await capture.dispatchEvent('click');
            assert.equal(await capture.isDisabled(), true);
            assert.equal(await capture.getAttribute('aria-busy'), 'true');
            assert.equal(await capture.getAttribute('aria-label'), label);
            assert.equal(await capture.evaluate(node => document.activeElement === node), true, 'pending capture keeps focus');
            const after = await capture.boundingBox();
            for (const key of ['x', 'y', 'width', 'height']) assert.ok(Math.abs(before[key] - after[key]) < 0.1, `pending ${kind} preserves ${key}`);
            if (gallery && departure === 'navigation' && phase === 'pending') await section.screenshot({ path: `${out}/${language}-${kind}-${theme}-pending.png` });
            if (phase === 'active') {
              await page.evaluate(() => window.captureProbe.release());
              await page.waitForFunction(() => window.captureProbe.recorders === 1);
              await page.waitForFunction(() => document.querySelector('[data-editor-section] .photo-add')?.getAttribute('aria-busy') === 'false');
            }
            if (departure === 'navigation') {
              await page.evaluate(async () => {
                const { goto } = await import('/node_modules/@sveltejs/kit/src/runtime/app/navigation.js');
                await goto('/calendar');
              });
              await page.waitForURL('**/calendar');
            } else {
              await page.evaluate(() => {
                Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
                document.dispatchEvent(new Event('visibilitychange'));
              });
              await page.waitForSelector('[data-pin-pad]');
            }
            await page.waitForSelector('[data-editor-chips]', { state: 'detached' });
            if (phase === 'pending') await page.evaluate(() => window.captureProbe.release());
            await page.waitForFunction(() => {
              const probe = window.captureProbe;
              return probe.refusal || (probe.streams.length === 1 && probe.streams[0].getTracks().every(track => track.readyState === 'ended'));
            });
            // Drain promise callbacks before reading feedback from refusal.
            await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 50)));
            const result = await page.evaluate(async () => {
              const { toasts } = await import('/src/lib/stores/toasts.svelte.ts');
              const probe = window.captureProbe;
              return { requests: probe.requests, recorders: probe.recorders,
                tracks: probe.streams.flatMap(stream => stream.getTracks().map(track => track.readyState)),
                feedback: toasts.length, preview: document.querySelectorAll('.video-preview').length };
            });
            assert.equal(result.requests, 1);
            assert.equal(result.recorders, phase === 'pending' ? 0 : 1);
            assert.equal(result.feedback, 0);
            assert.equal(result.preview, 0);
            rows.push({ language, theme, kind, departure, refusal, phase, ...result });
            if (departure === 'lock') {
              await page.evaluate(() => {
                Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
                document.dispatchEvent(new Event('visibilitychange'));
              });
              for (const digit of '1234') await page.locator(`[data-key="${digit}"]`).click();
              await page.waitForSelector('[data-editor-chips]');
              assert.equal(await page.locator('.recording-row,.video-row,.video-preview').count(), 0);
            }
          }
        }
      }
      assert.deepEqual(errors, [], 'capture and teardown have no unhandled page errors');
    } finally { await context.close(); }
  }
  if (process.env.ENTRY_CAPTURE_RESULT) await writeFile(process.env.ENTRY_CAPTURE_RESULT, JSON.stringify({ rows, runtime: await browser.version() }, null, 2) + '\n');
  console.log(`PASS ${rows.length} entry capture cases: EN/PL keyboard, navigation, real shell lock and late success/refusal`);
} finally { await browser.close(); await server.close(); }
