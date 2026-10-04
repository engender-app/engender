/* Controlled cases over the built app and persona, using the cold-load
   guard's sampler and assertion. Run after a VITE_DEMO=1 build:
     node tests/measurement-notice-proof.mjs */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { launchChromium, previewBuild, settlePage, createReporter } from './browser-harness.mjs';
import { COLD_SCREEN_SAMPLER } from './cold-screen-sampler.mjs';
import { measurementNoticeTravel, NOTICE_APPEAR_MS, NOTICE_OBSERVE_MS, NOTICE_KEY } from './measurement-notice-observation.mjs';
import { INIT_HIDE_DEMO_SCRIPT, RESET_PERSONA_EXPRESSION, FILL_EVERY_FEATURE_EXPRESSION } from './yank-sweep-core.mjs';

const browser = await launchChromium();
const app = await previewBuild(resolve('.'));
const base = `http://localhost:${app.httpServer.address().port}`;
const report = createReporter();
const cases = ['stationary', 'missing', 'incomplete', 'unsettled', 'movement'];
await mkdir('ci-logs', { recursive: true });
try {
  for (const scenario of cases) {
    await report.block(scenario, 2, async () => {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
      try {
        const page = await context.newPage();
        await page.addInitScript(INIT_HIDE_DEMO_SCRIPT);
        await settlePage(page, base, '/', 'light');
        assert.ok(await page.evaluate(RESET_PERSONA_EXPRESSION), 'persona reset never reached Home');
        await page.evaluate(FILL_EVERY_FEATURE_EXPRESSION);
        await page.waitForTimeout(1500);
        await page.addInitScript(({ scenario }) => {
          if (location.pathname !== '/body/measurements') return;
          let appearedAt;
          const style = document.createElement('style');
          style.textContent = '[data-protocol].kit-notice { opacity: 0 !important; }';
          new MutationObserver(() => {
            if (!style.isConnected && document.documentElement) document.documentElement.append(style);
          }).observe(document, { childList: true, subtree: true });
          const tick = () => {
            const notice = document.querySelector('[data-protocol].kit-notice');
            if (notice) {
              appearedAt ??= performance.now() + 650;
              const since = performance.now() - appearedAt;
              if (scenario !== 'missing' && since >= 0) {
                style.textContent = '[data-protocol].kit-notice { opacity: 1 !important; }';
                if (scenario === 'movement' && since >= 600) notice.style.transform = 'translateY(40px)';
                if (scenario === 'unsettled') notice.style.transform = `translateY(${Math.sin(since / 30)}px)`;
              }
            }
            requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }, { scenario });
        await page.addInitScript(COLD_SCREEN_SAMPLER);
        for (const reserve of ['fresh', 'remembered']) {
          await page.goto(`${base}/body/measurements`, { waitUntil: 'commit' });
          if (scenario === 'incomplete') {
            await page.waitForFunction(() => window.__coldSamples?.some((frame) => Object.keys(frame.boxes).some((key) => key.includes('.kit-notice[data-protocol]') && frame.ops[key] >= 0.1)));
            await page.waitForTimeout(100);
          } else {
            await page.waitForFunction(() => window.__coldSamplesComplete, null, { timeout: NOTICE_APPEAR_MS + NOTICE_OBSERVE_MS + 5000 });
          }
          const samples = await page.evaluate(() => window.__coldSamples);
          const findings = measurementNoticeTravel(samples);
          const first = samples.find((frame) => Object.keys(frame.boxes).some((key) => key.includes(NOTICE_KEY) && frame.ops[key] >= 0.1));
          await writeFile(`ci-logs/notice-proof-${process.pid}-${scenario}-${reserve}.json`, JSON.stringify({ scenario, reserve, firstVisibleAtMs: first?.at ?? null, findings, samples }));
          if (scenario !== 'missing') assert.ok(first?.at > 510, `first appearance ${first?.at}ms must exceed 510ms`);
          if (scenario === 'stationary') assert.deepEqual(findings, []);
          if (scenario === 'missing') assert.deepEqual(findings, ['measuring notice never appeared']);
          if (scenario === 'incomplete') assert.match(findings.join('\n'), /observation incomplete/);
          if (scenario === 'unsettled') assert.match(findings.join('\n'), /did not settle/);
          if (scenario === 'movement') assert.match(findings.join('\n'), /traveled 40px after appearing/);
          report.ok(`${scenario}, ${reserve} reserve: ${findings.join('; ') || 'stationary after delayed appearance'}`);
          await page.waitForFunction(() => window.__coldSamplesComplete, null, { timeout: NOTICE_APPEAR_MS + NOTICE_OBSERVE_MS + 5000 });
        }
      } finally {
        await context.close();
      }
    });
  }
} finally {
  await browser.close();
  await app.close();
}
process.exitCode = report.finish('All controlled notice cases passed');
