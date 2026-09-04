/* Screenshots of the merged voice screen (phase 8 features ticket 09): the
   three tabs, the live figure on its absolute axis with the reference bands
   behind it, a finished take drawn from its stored track, the comfort band
   before and after somebody sets one, and two takes read side by side.

   Everything here goes through the real flow against the fake microphone
   (tests/fake-microphone.mjs, the same 185 Hz oscillator the browser-tier
   probe asserts against), so the pictures are of what the app actually
   records, stores and draws rather than of a fixture shaped to look right.
   Nothing in either demo seed writes a benchmark, so recording two is also
   the only way to get a populated compare tab at all.

   Default flag only, in both themes: the palette sweep over this section's
   colour is voice-benchmark-gallery.mjs's job and it still does it.

   Run: VITE_DEMO=1 npm run build   (or any demo build) first, then
        node tests/voice-screen-gallery.mjs [outDir]
   Default outDir is .claude/voice-screen-shots, gitignored and durable. */
import { preview } from 'vite';
import { mkdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './browser-harness.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(process.argv[2] ?? resolve(here, '../.claude/voice-screen-shots'));
const THEMES = ['dark', 'light'];

const fakeMicrophoneSource = (await readFile(`${here}/fake-microphone.mjs`, 'utf8')).replace(
  /^export /gm,
  ''
);

await mkdir(outDir, { recursive: true });
const browser = await launchChromium({
  args: ['--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required']
});

const app = await preview({ preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const shots = [];

async function openPage(kind = 'steady') {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await page.addInitScript(`
    ${fakeMicrophoneSource}
    window.__fakeMicrophone = installFakeMicrophone(${JSON.stringify(kind)});
  `);
  return page;
}

async function settle(page, path) {
  await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]');
  if (await page.locator('[data-leave-setup]').count()) {
    await page.locator('[data-leave-setup]').click();
    await page.waitForSelector('[data-home-hello]');
    await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-app-root][data-boot="ready"]');
  }
}

async function dress(page, palette, theme) {
  await settle(page, '/settings');
  await page.locator(`[data-palette-pick="${palette}"]`).click();
  await page.locator(`[data-segment="${theme}"]`).click();
  await page.waitForFunction((want) => document.documentElement.dataset.theme === want, theme);
}

async function shoot(page, name) {
  // Headless Chromium never grants persistent storage, so the app's own
  // "export backups regularly" notice sits over the foot of every screen.
  await page.evaluate(() => {
    for (const toast of document.querySelectorAll('[data-toast]')) toast.remove();
    // The demo build's own control bar, which is a third of a full-page
    // shot and none of what these are of.
    document.querySelector('.demo-bar')?.remove();
    /* The action bar is sticky, so in a full-page capture Chromium leaves
       it where the viewport's bottom edge was - over content it sits below
       on a real screen. Measured on a 390x844 viewport: the last thing in
       the body clears the bar by 36px, so there is nothing hidden behind
       it and nothing to fix but the photograph. */
    for (const el of document.querySelectorAll('.editor-savebar, [class*="app-nav"], nav')) {
      if (getComputedStyle(el).position !== 'static') el.style.position = 'static';
    }
  });
  await page.screenshot({ path: `${outDir}/${name}.png`, fullPage: true });
  shots.push(name);
}

/** One whole benchmark through the real flow, left on the summary so the
    drawn take can be photographed before it is saved. */
async function recordToSummary(page) {
  await page.locator('[data-vb-record]').click();
  await page.waitForTimeout(2600);
  await page.locator('[data-vb-stop]').click();
  await page.waitForSelector('[data-vb-skip]', { timeout: 15000 });
  await page.locator('[data-vb-record]').click();
  await page.waitForSelector('[data-vb-save]', { timeout: 20000 });
  await page.waitForTimeout(400);
}

for (const theme of THEMES) {
  const page = await openPage();
  await dress(page, 'trans', theme);

  // 1. The screen opens on the tab that records.
  await settle(page, '/settings/voice');
  await shoot(page, `vs-1-record-idle-${theme}`);

  // 2. Reading the passage: the full graph, axis and bands and all.
  await page.locator('[data-vb-record]').click();
  await page.waitForTimeout(2600);
  await shoot(page, `vs-2-passage-full-graph-${theme}`);

  // 3. The held note, where the figure is the thing on the screen: the
  //    absolute axis, the two ranges, the hatched overlap.
  await page.locator('[data-vb-stop]').click();
  await page.waitForSelector('[data-vb-skip]', { timeout: 15000 });
  await page.locator('[data-vb-record]').click();
  await page.waitForTimeout(1800);
  await shoot(page, `vs-3-vowel-steadiness-${theme}`);

  // 4. The summary: six figures, then the take drawn from its own track.
  await page.waitForSelector('[data-vb-save]', { timeout: 20000 });
  await page.waitForTimeout(400);
  await shoot(page, `vs-4-summary-with-take-${theme}`);
  await page.locator('[data-vb-save]').click();

  // The flow hands over to the compare tab once a benchmark is saved.
  await page.waitForSelector('[data-voice-cell]', { timeout: 15000 });

  // 5. The practise tab, before anybody has said anything.
  await page.locator('[data-segment="practise"]').click();
  await page.waitForSelector('[data-comfort-band]');
  await shoot(page, `vs-5-practise-idle-${theme}`);

  // 6. Practising, with nothing being kept.
  await page.locator('[data-vp-start]').click();
  await page.waitForTimeout(2400);
  await shoot(page, `vs-6-practise-live-${theme}`);
  await page.locator('[data-vp-stop]').click();
  await page.waitForTimeout(300);

  // 7. Setting a comfort band, which ships with nothing in it.
  await page.locator('[data-comfort-band]').click();
  await page.waitForTimeout(400);
  await shoot(page, `vs-7-comfort-sheet-${theme}`);
  await page.locator('[data-comfort-low]').fill('200');
  await page.locator('[data-comfort-high]').fill('235');
  await page.locator('[data-comfort-save]').click();
  await page.waitForTimeout(400);

  // 8. The same figure with the person's own band bracketed on it.
  await page.locator('[data-vp-start]').click();
  await page.waitForTimeout(2400);
  await shoot(page, `vs-8-practise-with-comfort-${theme}`);
  await page.locator('[data-vp-stop]').click();
  await page.waitForTimeout(300);

  // 9. A second benchmark, so the compare tab has a pair and a trend.
  await page.locator('[data-segment="record"]').click();
  await page.waitForSelector('[data-vb-record]');
  await recordToSummary(page);
  await page.locator('[data-vb-save]').click();
  await page.waitForSelector('[data-voice-cell]', { timeout: 15000 });
  await page.waitForTimeout(500);
  await shoot(page, `vs-9-compare-list-${theme}`);

  // 10. Two takes read side by side, with the delta under them.
  const cells = page.locator('[data-voice-cell]');
  await cells.nth(0).click();
  await cells.nth(1).click();
  await page.waitForTimeout(200);
  await page.locator('[data-compare]').click();
  await page.waitForTimeout(600);
  await shoot(page, `vs-10-compare-two-takes-${theme}`);

  await page.close();

  /* 11. A take whose pitch actually moves. The steady oscillator holds one
     frequency, so its p10, its p90 and its median all land on the trace and
     the drawn take is a single line - which says nothing about whether the
     span band and the median read as separate marks. This one slides by
     three semitones, which is what a read passage does. The vowel step is
     skipped: a sliding note is exactly what that step's steadiness check
     exists to refuse. */
  const moving = await openPage('wobble');
  await dress(moving, 'trans', theme);
  await settle(moving, '/settings/voice');
  await moving.locator('[data-vb-record]').click();
  await moving.waitForTimeout(3200);
  await moving.locator('[data-vb-stop]').click();
  await moving.waitForSelector('[data-vb-skip]', { timeout: 20000 });
  await moving.locator('[data-vb-skip]').click();
  await moving.waitForSelector('[data-vb-save]', { timeout: 20000 });
  await moving.waitForTimeout(400);
  await shoot(moving, `vs-11-take-that-moves-${theme}`);
  await moving.close();
}

/* 12. The Polish passage, which is why the bands are per language at all.
   An ordinary Polish cis man reads a passage near 163 Hz, so the English
   figures would have put him inside the band labelled cis woman
   (ADR-0059). Switching the app's language switches the built-in passage,
   which is what the bands key off. */
for (const theme of THEMES) {
  const page = await openPage();
  await dress(page, 'trans', theme);
  await settle(page, '/settings');
  await page.locator('[data-segment="pl"]').click();
  await page.waitForFunction(
    () => document.querySelector('[data-nav-item="home"] [data-nav-label]')?.textContent === 'Start',
    null,
    { timeout: 8000 }
  );
  await settle(page, '/settings/voice');
  await page.locator('[data-vb-record]').click();
  await page.waitForTimeout(2600);
  await page.locator('[data-vb-stop]').click();
  await page.waitForSelector('[data-vb-skip]', { timeout: 20000 });
  await page.locator('[data-vb-record]').click();
  await page.waitForTimeout(1800);
  await shoot(page, `vs-12-polish-bands-${theme}`);
  await page.close();
}

await app.httpServer.close();
await browser.close();
console.log(`${shots.length} shots in ${outDir}`);
