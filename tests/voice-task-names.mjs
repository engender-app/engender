/* The voice screen's task chooser (phase 11 pre-production ticket 44), as
   the two things the ticket can actually be wrong about.

   One: a label that does not fit. The compact segmented control divides its
   track between its segments, and a segment paints outside its own box, so
   a label wider than its share used to run over its neighbour - and the
   chosen one, which is page-coloured, simply disappeared past the edge of
   its pill. The rule here is per segment rather than per track: the track is
   allowed to scroll, that is what its fade and chevron are for, and what
   must never happen is a word painted where its own segment is not.

   Two: the line that says which task keeps what. It is there for somebody
   who has never made a benchmark and gone once there is one, so both halves
   of that are checked against a real journal rather than against the markup
   that renders them.

   Three: every other compact control in the app. The rule that fixed the
   voice strip lives in components.css and all of them read it, so the claim
   written there - that a control whose labels already fitted is laid out
   exactly as it was, and that the two which did not now scroll instead of
   painting over themselves - is swept rather than asserted.

   Run: node tests/voice-task-names.mjs   (dev server, no build needed) */
import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { createServer } from 'vite';
import { launchChromium, settlePage } from './browser-harness.mjs';

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
      assert.equal(segments.length, 4, `${language} at ${width}px: the chooser lost a task`);
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

  console.log('PASS: four task labels fit their own segments at 320/390/430 in both languages');
  console.log('PASS: the task distinction is there with no benchmark and gone with one');

  /* The same rule over every compact control the app renders on the demo
     persona. Routes rather than a registry, because a compact control is a
     choice a screen makes and nothing collects them. */
  const COMPACT_ROUTES = [
    '/stats', '/tally', '/voice', '/body/hair-progress', '/body/measurements', '/body/wear',
    '/care/curve', '/media/photos', '/settings', '/transition/roadmap', '/compare'
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
  assert.ok(swept >= 20, `the sweep found only ${swept} compact controls across ${COMPACT_ROUTES.length} routes at two widths`);
  console.log(`PASS: ${swept} compact controls across the app keep every label inside its own segment at 320 and 390`);
} finally {
  await browser.close();
  await server.close();
}
