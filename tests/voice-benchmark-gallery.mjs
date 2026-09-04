/* Screenshots of the voice benchmark flow (phase 5 deepening ticket 15).

   Every state the screen has, driven through the app's own production build
   rather than a fixture: the passage step, a take being recorded with the
   gauge live, the two ways a vowel comes back to be redone, the summary, the
   denied microphone, and the passage editor. Then the passage step across
   all eight flags in both themes, which is where the section's own colour
   lands.

   The microphone is an oscillator (tests/fake-microphone.mjs), injected as a
   page script so the app's real capture path runs against a signal whose
   answer is known. Chromium's own fake device would do for "some audio
   arrives" and cannot produce a take that fails one named check and passes
   the others, which is most of what these pictures are of.

   Run: VITE_DEMO=1 npm run build   (or any demo build) first, then
        node tests/voice-benchmark-gallery.mjs [outDir]
   Default outDir is .claude/voice-shots, which is gitignored and durable. */
import { preview } from 'vite';
import { mkdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './browser-harness.mjs';
import { PALETTES } from './palettes.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(process.argv[2] ?? resolve(here, '../.claude/voice-shots'));
const THEMES = ['dark', 'light'];

/* One definition of the synthetic microphone, shared with the browser-tier
   probe. `export` is stripped so the module reads as a classic script, which
   is what addInitScript takes - the alternative is a second copy of the
   oscillator here, drifting from the one the probe asserts against. */
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

/** A page with the synthetic microphone already in place, and `kind`
    deciding what it will play when the screen asks for it. */
async function openPage(kind, { denied = false } = {}) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await page.addInitScript(`
    ${fakeMicrophoneSource}
    window.__fakeMicrophone = ${denied ? 'null' : `installFakeMicrophone(${JSON.stringify(kind)})`};
    ${
      denied
        ? `navigator.mediaDevices.getUserMedia = async () => {
             throw new DOMException('denied by the person', 'NotAllowedError');
           };`
        : ''
    }
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
  });
  await page.screenshot({ path: `${outDir}/${name}.png` });
  shots.push(name);
}

/* ---------- the states, on the default flag in both themes ---------- */
for (const theme of THEMES) {
  // 1. The passage, waiting to be read.
  {
    const page = await openPage('steady');
    await dress(page, 'trans', theme);
    await settle(page, '/settings/voice?tab=record');
    await shoot(page, `vb-1-passage-idle-trans-${theme}`);

    // 2. The passage editor.
    await page.locator('button:has-text("own")').first().click();
    await page.waitForTimeout(400);
    await shoot(page, `vb-2-passage-own-trans-${theme}`);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    // 3. Reading it, with the gauge live.
    await page.locator('[data-vb-record]').click();
    await page.waitForTimeout(2600);
    await shoot(page, `vb-3-passage-recording-trans-${theme}`);

    // 4. The vowel step, which the passage hands over to.
    await page.locator('[data-vb-stop]').click();
    await page.waitForSelector('[data-vb-skip]', { timeout: 15000 });
    await shoot(page, `vb-4-vowel-idle-trans-${theme}`);

    // 5. Holding it: the run bar filling towards three seconds.
    await page.locator('[data-vb-record]').click();
    await page.waitForTimeout(1800);
    await shoot(page, `vb-5-vowel-recording-trans-${theme}`);

    // 6. The summary, after the first vowel lands. The other two held
    //    vowels (ticket 30) are skipped here: this gallery is of the
    //    passage/vowel/summary shape, not of all three notes in a row.
    await page.waitForSelector('[data-vb-skip]', { timeout: 20000 });
    await page.locator('[data-vb-skip]').click();
    await page.waitForSelector('[data-vb-skip]', { timeout: 20000 });
    await page.locator('[data-vb-skip]').click();
    await page.waitForSelector('[data-vb-save]', { timeout: 20000 });
    await page.waitForTimeout(300);
    await shoot(page, `vb-6-summary-trans-${theme}`);
    await page.close();
  }

  // 7 and 8. The two ways a vowel comes back: too loud, and wandering.
  for (const [kind, name] of [
    ['loud', 'vb-7-vowel-retry-clipping'],
    ['wobble', 'vb-8-vowel-retry-unsteady']
  ]) {
    const page = await openPage(kind);
    await dress(page, 'trans', theme);
    await settle(page, '/settings/voice?tab=record');
    // Past the passage on a steady signal is not available here - one page
    // has one microphone - so the passage is read on the same signal and
    // the vowel is what these are of. A loud passage is refused too, which
    // is the state this ends up showing for 'loud'.
    await page.locator('[data-vb-record]').click();
    await page.waitForTimeout(3000);
    if (await page.locator('[data-vb-stop]').count()) await page.locator('[data-vb-stop]').click();
    await page.waitForSelector('[data-vb-record]', { timeout: 20000 });
    if (await page.locator('[data-vb-skip]').count()) {
      await page.locator('[data-vb-record]').click();
      await page.waitForSelector('[data-vb-skip]', { timeout: 20000 });
      await page.waitForTimeout(400);
    }
    await shoot(page, `${name}-trans-${theme}`);
    await page.close();
  }

  // 9. The microphone this app cannot have.
  {
    const page = await openPage('steady', { denied: true });
    await dress(page, 'trans', theme);
    await settle(page, '/settings/voice?tab=record');
    await page.locator('[data-vb-record]').click();
    await page.waitForTimeout(600);
    await shoot(page, `vb-9-mic-denied-trans-${theme}`);

    // Asking a second time and being refused again: the button retires,
    // because Android stops offering the dialog at that point.
    await page.locator('[data-notice-action]').click();
    await page.waitForTimeout(600);
    await shoot(page, `vb-10-mic-denied-again-trans-${theme}`);
    await page.close();
  }
}

/* ---------- the passage step across all eight flags ---------- */
for (const palette of PALETTES) {
  for (const theme of THEMES) {
    const page = await openPage('steady');
    await dress(page, palette, theme);
    await settle(page, '/settings/voice?tab=record');
    await page.locator('[data-vb-record]').click();
    await page.waitForTimeout(2200);
    await shoot(page, `vb-flag-${palette}-${theme}`);
    await page.close();
  }
}

await app.httpServer.close();
await browser.close();
console.log(`${shots.length} shots in ${outDir}`);
