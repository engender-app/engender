/* Each voice task label fits its own segment while the track may scroll.
   Check the explanation appears before the first benchmark and disappears
   after it on a real journal. Sweep the shared compact control styles so
   existing fits stay in place and long labels scroll without overlapping.

   Run node tests/guards/voice-task-names.mjs against the dev server. */
import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { createServer } from 'vite';
import { launchChromium, settlePage } from '../browser-harness.mjs';

const server = await createServer({ server: { port: 0, fs: { allow: [process.cwd(), realpathSync('node_modules')] } } });
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await launchChromium();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
page.setDefaultTimeout(15000);

/** Every segment's own box against the words in it. */
const segmentFit = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('[data-segmented="voice-tab"] [data-segment]')].map((b) => ({
      value: b.dataset.segment,
      label: b.textContent.trim(),
      box: Math.round(b.clientWidth),
      words: Math.round(b.scrollWidth)
    }))
  );

try {
  await settlePage(page, base, '/voice', 'light');
  await page.waitForSelector('[data-vb-passage]');

  for (const language of ['en', 'pl']) {
    if (language === 'pl') {
      await settlePage(page, base, '/settings', 'light');
      await page.locator('[data-segment="pl"]').click();
      await page.waitForFunction(() => document.documentElement.lang === 'pl');
    }
    for (const width of [320, 390, 430]) {
      await page.setViewportSize({ width, height: 844 });
      await settlePage(page, base, '/voice', 'light');
      await page.waitForSelector('[data-vb-passage]');
      const segments = await segmentFit();
      // Three tasks since recordings moved to their own Media row.
      assert.equal(segments.length, 3, `${language} at ${width}px: the chooser lost a task`);
      for (const segment of segments) {
        assert.ok(
          segment.words <= segment.box + 1,
          `${language} at ${width}px: "${segment.label}" needs ${segment.words}px of a ${segment.box}px segment, so it paints outside its own pill`
        );
      }
    }
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await settlePage(page, base, '/settings', 'light');
  await page.locator('[data-segment="en"]').click();
  await page.waitForFunction(() => document.documentElement.lang === 'en');
  await settlePage(page, base, '/voice', 'light');
  await page.waitForSelector('[data-vb-passage]');
  await assert.doesNotReject(
    page.locator('[data-voice-tasks-lead]').waitFor(),
    'a journal with no benchmark gets no line saying which task makes one'
  );

  const id = await page.evaluate(async () => {
    const { journal } = await import('/src/lib/data/live/journal.svelte.ts');
    return journal.voiceBenchmarks.saveBenchmark({
      epochDay: 20000,
      passageKey: 'built-in:en',
      passageAudio: new Uint8Array(32),
      vowelAudio: null,
      f0MedianHz: 180,
      f0P10Hz: 160,
      f0P90Hz: 210,
      semitoneSd: 2.4,
      wordsPerMinute: 150,
      f1Hz: null,
      f2Hz: null,
      snrDb: null
    });
  });
  await settlePage(page, base, '/voice', 'light');
  await page.waitForSelector('[data-vb-passage]');
  await page.locator('[data-voice-tasks-lead]').waitFor({ state: 'detached' });

  await page.evaluate(async (uuid) => {
    const { journal } = await import('/src/lib/data/live/journal.svelte.ts');
    await journal.voiceBenchmarks.deleteBenchmark(uuid);
  }, id);

  console.log('PASS: three task labels fit their own segments at 320/390/430 in both languages');
  console.log('PASS: the task distinction is there with no benchmark and gone with one');

  /* The same rule over every compact control the app renders on the demo
     persona. Routes rather than a registry, because a compact control is a
     choice a screen makes and nothing collects them. */
  const COMPACT_ROUTES = [
    '/settings', '/settings/eras', '/body/wear', '/entry/new/today'
  ];
  let swept = 0;
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of COMPACT_ROUTES) {
      await settlePage(page, base, route, 'light');
      await page.waitForTimeout(400);
      const controls = await page.evaluate(() =>
        [...document.querySelectorAll('.segmented.is-compact')].map((track) => ({
          key: track.dataset.segmented ?? '(unkeyed)',
          segments: [...track.querySelectorAll('[data-segment]')].map((b) => ({
            label: b.textContent.trim(),
            box: Math.round(b.clientWidth),
            words: Math.round(b.scrollWidth)
          }))
        }))
      );
      for (const control of controls) {
        swept += 1;
        for (const segment of control.segments) {
          assert.ok(
            segment.words <= segment.box + 1,
            `${route} at ${width}px, ${control.key}: "${segment.label}" needs ${segment.words}px of a ${segment.box}px segment`
          );
        }
      }
    }
  }
  /* Found at all, so a route that stops rendering its control cannot make
     the sweep pass by having nothing to look at. */
  // Three compact controls per width on these routes; the redesigns took
  // photos', the roadmap's and compare's away.
  assert.ok(swept >= 6, `the sweep found only ${swept} compact controls across ${COMPACT_ROUTES.length} routes at two widths`);
  console.log(`PASS: ${swept} compact controls across the app keep every label inside its own segment at 320 and 390`);
} finally {
  await browser.close();
  await server.close();
}
