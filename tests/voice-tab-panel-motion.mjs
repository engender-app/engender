/* Checks that Voice's painted passage withdraws before Practice replaces it. */
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { launchChromium, previewBuild, screencast, settlePage } from './browser-harness.mjs';
import { RESET_PERSONA_EXPRESSION, saveSceneCast } from './yank-sweep-core.mjs';

const out = resolve(process.argv[2] ?? '.claude/voice-tab-panel-motion');
await mkdir(out, { recursive: true });
const app = await previewBuild(process.cwd());
const base = `http://localhost:${app.httpServer.address().port}`;
const browser = await launchChromium({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
const results = [];
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  await settlePage(page, base, '/', 'light');
  await page.evaluate(RESET_PERSONA_EXPRESSION);
  for (const theme of ['light', 'dark']) {
    await settlePage(page, base, '/voice', theme);
    await page.waitForSelector('[data-vb-passage]');
    await page.waitForTimeout(700);
    const result = await screencast(page, async (cast) => {
      await page.waitForTimeout(100);
      const samples = await page.evaluate(async () => {
        const samples = [];
        const start = performance.now();
        const read = () => {
          const passage = document.querySelector('[data-vb-passage]');
          let opacity = 1;
          let clipped = false;
          for (let node = passage; node; node = node.parentElement) {
            const style = getComputedStyle(node);
            opacity *= Number(style.opacity);
            clipped ||= style.clipPath !== 'none' && style.clipPath !== 'inset(0px)';
          }
          const heading = [...document.querySelectorAll('[data-section-heading] h2')].find((node) => node.textContent === 'Your practice takes');
          const headingPaint = heading ? { clip: getComputedStyle(heading).clipPath, parentClip: getComputedStyle(heading.parentElement).clipPath, rect: heading.getBoundingClientRect().toJSON() } : null;
          samples.push({ headingPaint, ms: performance.now() - start, passage: !!passage, opacity, clipped, practice: !!document.querySelector('[data-vp-start]') });
        };
        read();
        document.querySelector('[data-segment="practise"]').click();
        await new Promise((resolve) => {
          const frame = () => {
            read();
            if (performance.now() - start < 1000) requestAnimationFrame(frame);
            else resolve();
          };
          requestAnimationFrame(frame);
        });
        return samples;
      });
      await page.waitForTimeout(100);
      return { samples, evidence: await saveSceneCast(cast, out, 'voice-panel', theme) };
    });
    const gone = result.samples.findIndex((sample) => !sample.passage);
    const withdrawal = result.samples.slice(0, gone).some((sample) => sample.opacity < 0.95 || sample.clipped);
    results.push({ theme, pass: gone > 1 && withdrawal, ...result });
  }
  const guards = [];
  const guard = (name, pass) => guards.push({ name, pass });
  await settlePage(page, base, '/voice', 'light');
  await page.waitForTimeout(700);
  await page.locator('[data-segment="record"]').focus();
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(600);
  guard('keyboard selects Practice and retains focus', await page.locator('[data-segment="practise"]').evaluate((el) => el.getAttribute('aria-checked') === 'true' && el === document.activeElement));
  guard('Practice controls remain reachable', await page.locator('[data-app-savebar]:not([data-savebar-leaving]) [data-vp-start]').isVisible());
  await page.evaluate(() => {
    for (const tab of ['compare', 'recordings', 'record']) document.querySelector(`[data-segment="${tab}"]`).click();
  });
  await page.waitForTimeout(900);
  guard('rapid switches settle on latest tab', await page.locator('[data-vb-passage]').isVisible());
  await page.evaluate(() => {
    document.documentElement.dataset.a11yMotion = 'reduce';
    document.querySelector('[data-segment="practise"]').click();
  });
  guard('reduced motion swaps without panel animation', await page.locator('.voice-panel').evaluate((el) => !el.getAnimations().length));
  await page.waitForTimeout(500);
  guard('only one Practice control remains after settling', await page.locator('[data-vp-start]').count() === 1);
  await page.evaluate(() => { document.documentElement.dataset.a11yMotion = 'full'; });
  await page.evaluate(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    window.__voiceStreams = [];
    navigator.mediaDevices.getUserMedia = async (...args) => {
      const stream = await original(...args);
      window.__voiceStreams.push(stream);
      return stream;
    };
  });
  await page.locator('[data-app-savebar]:not([data-savebar-leaving]) [data-vp-start]').click();
  await page.waitForFunction(() => window.__voiceStreams.length > 0);
  await page.locator('[data-segment="compare"]').click();
  await page.waitForTimeout(700);
  guard('comparison benchmark picker remains reachable', await page.locator('[data-voice-cell], [data-notice="voice-benchmark-empty"]').count() > 0);
  guard('Practice microphone stops on tab withdrawal', await page.evaluate(() => window.__voiceStreams.every((stream) => stream.getTracks().every((track) => track.readyState === 'ended'))));
  await page.locator('[data-segment="record"]').click();
  await page.waitForTimeout(700);
  await page.evaluate(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (...args) => {
      const stream = await original(...args);
      await new Promise((resolve) => { window.__resolveVoiceOpening = resolve; });
      return stream;
    };
  });
  await page.locator('[data-app-savebar]:not([data-savebar-leaving]) [data-vb-record]').click();
  await page.waitForFunction(() => !!window.__resolveVoiceOpening);
  await page.locator('[data-segment="recordings"]').click();
  await page.waitForTimeout(700);
  guard('recordings list or empty state remains reachable', await page.locator('[data-memo-reading], [data-notice="voice-memos-empty"]').count() === 1);
  await page.evaluate(() => window.__resolveVoiceOpening());
  await page.waitForTimeout(200);
  guard('pending benchmark microphone opening is cancelled', await page.evaluate(() => window.__voiceStreams.every((stream) => stream.getTracks().every((track) => track.readyState === 'ended'))));
  await writeFile(`${out}/report.json`, JSON.stringify({ results, guards, errors }, null, 2));
  console.log(JSON.stringify({ results: results.map(({ theme, pass }) => ({ theme, pass })), guards, errors }));
  if (errors.length || guards.some((guard) => !guard.pass) || results.some((result) => !result.pass)) process.exitCode = 1;
} finally {
  await browser.close();
  await app.close();
}
