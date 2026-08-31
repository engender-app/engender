/* Screenshots of the chromeless screens (phase 5 ticket 26): the five
   pre-unlock gates, the security module on both platforms, and all seven steps
   of the first run.

   Two sources, because the screens come from two places. Four of the five
   gates are boot states rather than URLs, so those are driven through
   tests/browser-tier/gates.html, which mounts the real components and moves
   `bootState` with the same transitions boot uses. Onboarding is a route, so
   that half drives the app's own production build - which has to be a demo
   build (VITE_DEMO=1) or every screen renders as the passphrase gate.

   Run: npm run test:walkthrough  (or any VITE_DEMO=1 build) first, then
        node tests/gates-gallery.mjs [outDir]
   Default outDir is .claude/gate-shots, which is gitignored and durable. */
import { createServer, preview } from 'vite';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './browser-harness.mjs';
import { PALETTES } from './palettes.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(process.argv[2] ?? resolve(here, '../.claude/gate-shots'));

const THEMES = ['dark', 'light'];

/* Every state the eleven scenes cover. Shot on the default flag in both
   themes: what changes between palettes on a gate is one accent and one
   soft tint, and the flag itself never appears here - so the palette sweep
   below is one scene across all eight rather than eleven scenes across all
   eight, which would be 176 pictures nobody looks at. */
const SCENES = [
  'access-choice',
  'access-change',
  'unlock-pin',
  'unlock-passphrase',
  'unlock-biometric',
  'session-pin',
  'session-passphrase',
  'session-biometric',
  'session-device',
  'converting',
  'conversion-refused',
  'android-key',
  'android-key-no-lock',
  'android-key-invalidated',
  'device-recovery',
  'schema-too-new'
];

/* The security module is the one surface whose *content* differs by
   platform, not just its frame (ticket 53): device-bound is labelled as the
   screen lock on Android and cannot be moved to there at all, and the web's
   biometric row is there only where the browser can do PRF (ticket 55).
   Three lists, so these scenes are shot on each of the other two as well. */
const PLATFORM_SCENES = ['access-choice', 'access-change'];
const OTHER_PLATFORMS = ['android', 'web-no-prf'];

/* Each mode's own screen, which is where its consequence is stated - the
   thing ADR-0041 made the condition of allowing a 4-digit PIN to encrypt at
   all. Reached by clicking the row, from the script rather than from the
   fixture, so the fixture stays a state selector and nothing there has to
   drive a step it also renders. */
const MODE_ROWS = ['device-bound', 'biometric', 'pin', 'passphrase'];

await mkdir(outDir, { recursive: true });
const browser = await launchChromium();
const shots = [];

async function shoot(page, name, fullPage = false) {
  /* Headless Chromium never grants persistent storage, so the app's own
     "export backups regularly" toast sits over the foot of every screen
     here. It is a true notice about this browser and it is not what these
     pictures are of. */
  await page.evaluate(() => {
    for (const toast of document.querySelectorAll('[data-toast]')) toast.remove();
  });
  const file = `${outDir}/${name}.png`;
  await page.screenshot({ path: file, fullPage });
  shots.push(name);
}

/* ---------- the gates, from the fixture ---------- */
const fixture = await createServer({
  configFile: `${here}/browser-tier/browser-tier.vite.config.ts`,
  server: { port: 0 }
});
await fixture.listen();

{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await page.goto(`http://localhost:${fixture.config.server.port}/gates.html`, {
    waitUntil: 'networkidle'
  });
  await page.waitForSelector('body[data-gates-ready]', { state: 'attached' });

  const select = async (label, value) => {
    await page.selectOption(`select[aria-label="${label}"]`, value);
    // The gates have no entrance, so this is the press spring settling on
    // whatever was last touched rather than anything arriving.
    await page.waitForTimeout(250);
  };

  for (const scene of SCENES) {
    await select('Scene', scene);
    for (const theme of THEMES) {
      await select('Theme', theme);
      await shoot(page, `gate-${scene}-trans-${theme}`);
    }
  }

  /* The module's per-mode screens, on both platforms: device-bound's copy is
     the half that differs, and the PIN screen carries the brute-force figure
     that has to be readable rather than merely present. */
  for (const platform of ['web', 'android']) {
    await select('Platform', platform);
    for (const row of MODE_ROWS) {
      for (const theme of THEMES) {
        /* Off the scene and back, because the stage is keyed on the scene
           name: re-selecting the one already chosen changes nothing, so the
           module would still be showing the previous row's detail screen and
           every row after the first would look absent. */
        await select('Scene', 'unlock-passphrase');
        await select('Scene', 'access-choice');
        await select('Theme', theme);
        const target = page.locator(`[data-list-row="${row}"]`);
        /* The biometric row arrives one await later than the other three -
           the browser is asked whether it can do PRF - so a bare count()
           here would race it and quietly skip the row on every run. */
        await target.waitFor({ state: 'visible', timeout: 2000 }).catch(() => {});
        if (!(await target.count())) continue;
        await target.click();
        await page.waitForSelector(`[data-access-chosen="${row}"]`);
        await page.waitForTimeout(250);
        await shoot(page, `gate-access-${row}-${platform}-${theme}`, true);
      }
    }
  }
  await select('Platform', 'web');

  for (const platform of OTHER_PLATFORMS) {
    await select('Platform', platform);
    for (const scene of PLATFORM_SCENES) {
      await select('Scene', scene);
      for (const theme of THEMES) {
        await select('Theme', theme);
        await shoot(page, `gate-${scene}-${platform}-${theme}`);
      }
    }
  }
  await select('Platform', 'web');

  /* The PIN pad's two answers to a wrong PIN, which are the only motion on
     any of these screens that leaves a visible resting state: the row has
     shaken and cleared, the wait is counting down and the rail beside it is
     draining. */
  for (const theme of THEMES) {
    await select('Scene', 'unlock-pin');
    await select('Theme', theme);
    await page.waitForSelector('[data-pin-pad]');
    for (const digit of ['9', '9', '9', '9']) await page.locator(`[data-key="${digit}"]`).click();
    /* The pad's own answer plus the throttle's: the row has shaken and
       cleared, the wait is counting and the rail beside it is draining. The
       PIN is wrong for a real reason here - there is no keystore behind this
       fixture - so this is the true refusal, not a simulated one. */
    await page.waitForSelector('[data-pin-status="wrong"], [data-pin-status="throttled"]');
    await page.waitForTimeout(400);
    await shoot(page, `gate-wrong-pin-trans-${theme}`);
  }

  // One gate across all eight flags, for the accent and the soft tint.
  await select('Scene', 'access-choice');
  for (const palette of PALETTES) {
    await select('Palette', palette);
    for (const theme of THEMES) {
      await select('Theme', theme);
      await shoot(page, `gate-access-choice-${palette}-${theme}`);
    }
  }

  await page.close();
}

await fixture.close();

/* ---------- the first run, from the app's own build ---------- */
const app = await preview({ preview: { port: 0 } });
const address = app.httpServer.address();
const base = `http://localhost:${address.port}`;

{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });

  /* A browser profile this script has just created has no journal, so the
     demo build's own first load lands on the first run rather than on the
     app. Out of it before anything else, or every locator below is looking
     at step one. */
  const settle = async (path) => {
    await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-app-root][data-boot="ready"]');
    if (await page.locator('[data-leave-setup]').count()) {
      await page.locator('[data-leave-setup]').click();
      await page.waitForSelector('[data-home-hello]');
      await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
      await page.waitForSelector('[data-app-root][data-boot="ready"]');
    }
  };

  /* The flag is the whole point of this screen's motion, so the first run is
     shot on more than one of them: the default, the one whose stripes are
     nearly the page on a light theme, and the one whose stripes are nearly
     the page on a dark one. */
  for (const [palette, theme] of [
    ['trans', 'dark'],
    ['trans', 'light'],
    ['nonbinary', 'light'],
    ['agender', 'dark']
  ]) {
    await settle('/settings');
    await page.locator(`[data-palette-pick="${palette}"]`).click();
    await page.locator(`[data-segment="${theme}"]`).click();
    await page.waitForFunction(
      (want) => document.documentElement.dataset.theme === want,
      theme
    );

    await settle('/');
    await page.selectOption('#demo-jump', 'first-run');
    await page.waitForSelector('[data-next]');

    const steps = ['welcome', 'name', 'flag', 'scales', 'lock', 'checkin', 'done'];
    for (const [i, step] of steps.entries()) {
      // The sun grows on --dur-slow and the step crosses on --dur-med; both
      // are well inside this, and what is wanted is the resting frame.
      await page.waitForTimeout(600);
      await shoot(page, `setup-${i}-${step}-${palette}-${theme}`);
      if (step === 'name') await page.locator('#ob-name').fill('Alicja');
      if (step === 'lock') {
        /* One switch now, and no reveal under it: the app-lock toggle that
           used to open a second row went with its gate (ticket 53), so what
           is left is lock-on-leave on its own. */
        await page.getByRole('switch').first().click();
        await page.waitForTimeout(400);
        await shoot(page, `setup-${i}-${step}-on-${palette}-${theme}`);
      }
      if (step === 'checkin') {
        await page.getByRole('switch').first().click();
        await page.waitForTimeout(400);
        await shoot(page, `setup-${i}-${step}-open-${palette}-${theme}`);
      }
      // Tick one more than the default set, so the shot shows a mix of
      // ticked and unticked rows rather than a uniform column.
      if (step === 'scales') await page.locator('[data-list-row="scale-binary_nonbinary"]').click();
      if (step !== 'done') await page.locator('[data-next]').click();
    }
  }

  /* Disguise on, which is the ticket's own check: nothing on any of these
     screens may identify the app. On the first run that means no sun. */
  await settle('/settings');
  await page.getByRole('button', { name: /Disguise/i }).click();
  await page.getByRole('switch', { name: 'Disguise app' }).click();
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => {
    const boot = JSON.parse(localStorage.getItem('gender-diary-boot-prefs') || '{}');
    return boot.disguise === true;
  });

  await settle('/');
  await page.selectOption('#demo-jump', 'first-run');
  await page.waitForSelector('[data-next]');

  /* Every step, not one. The spec says "verify with prefs.disguise set, on
     every one of them", and shooting only the welcome is what let the flag
     step - eight pride flags with their names under them - through the
     first time. Six steps rather than seven: the flag step is not hidden
     under disguise, it is not in the flow. */
  const disguisedSteps = ['welcome', 'name', 'scales', 'lock', 'checkin', 'done'];
  for (const [i, step] of disguisedSteps.entries()) {
    await page.waitForTimeout(600);
    await shoot(page, `setup-disguised-${i}-${step}`);
    if (step === 'scales') await page.locator('[data-list-row="scale-binary_nonbinary"]').click();
    if (step !== 'done') await page.locator('[data-next]').click();
  }

  await page.close();
}

await app.close();
await browser.close();

console.log(`${shots.length} shots in ${outDir}`);
