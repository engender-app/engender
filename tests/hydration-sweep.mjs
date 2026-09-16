/* The hydration sweep (ticket 108): every screen in the app, cold-mounted
   one at a time, recorded from the navigation itself through a three
   second settle, in both database profiles - the empty journal a first
   run leaves behind and the populated Alice persona - looking for the
   cold-mount pops the gesture sweep is built to miss.

   Why a second sweep. The yank sweep settles 1400ms before its first
   sample, because a gesture needs a screen at rest underneath it; the
   defects that keep finding their way past it (tickets 106, 107) live
   entirely inside that wait - SQLite liveQuery resolving 500ms to 1500ms
   after mount, a skeleton taller than its chart unmounting, pinned rows
   arriving a second late and snapping everything below them down. Those
   are the same four failure shapes (teleport, vanish, limbo, bloat) read
   over a different window with a wider teleport floor (HYDRATION_PX, the
   ticket's own 24px), so this sweep reuses the whole instrument rather
   than inventing a second arithmetic that could disagree with the first.

   Why a camera as well as the sampler. A cold mount is the one moment the
   DOM sampler cannot watch: page.goto destroys the page doing the
   sampling. So each cold scene is also screencast frame by frame through
   the same CDP `Page.startScreencast` the device sweep uses - the
   compositor's own frames, which keep arriving across the load - and the
   render detector from the shared core reads them. The camera sees
   flashes and bloated paints the style trace cannot; the sampler, started
   the moment boot reports ready, sees which element moved. Between them
   the only uncovered stretch is the sub-100ms between the document
   loading and `data-boot="ready"`, which belongs to the shell, not to any
   screen's hydration.

   The scene table, the thresholds, the detectors, the profile
   expressions and the analysis over a recorded scene all live in
   `tests/yank-sweep-core.mjs`, shared with `tests/yank-sweep-device.mjs
   --hydration`, which points the same instruments at a real phone. What
   stays here is only the desktop's own driving: the preview server, the
   CDP session, Playwright.

   Run against a demo build:
     VITE_DEMO=1 npm run build
     node tests/hydration-sweep.mjs
     node tests/hydration-sweep.mjs --prove
   `--scenes a,b` narrows the run; `--profiles persona` or `--profiles
   empty` runs one journal state; `--themes light,dark` (light by default,
   unlike the device sweep, whose camera has caught theme-conditional
   defects often enough to earn both by default); `--out <dir>` names the
   report directory; `--pin` the throwaway PIN the lock-gate epilogue
   wraps the journal with (1111, as on the device); `--dump` writes every
   scene's style frames as JSON alongside the report, and any scene with a
   style finding gets its frames written whether or not it was asked for -
   the frames are the evidence a person reads a yank out of. */
import { preview } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium, settlePage } from './browser-harness.mjs';
import {
  DEMO_THEME_EXPRESSION,
  DIFF_EPS,
  FILL_EVERY_FEATURE_EXPRESSION,
  HYDRATION_MS,
  HYDRATION_NEEDS,
  HYDRATION_PX,
  HYDRATION_SETTLE_MS,
  INIT_HIDE_DEMO_SCRIPT,
  INJECT_PROOF_EXPRESSION,
  JUMP_FIRST_RUN_EXPRESSION,
  LOCK_SETUP_EXPRESSION,
  OUTLIER_MIN,
  PROOF,
  RESET_PERSONA_EXPRESSION,
  TRANSIENT_MIN,
  GAP_RATIO,
  UNLOCK_PIN_EXPRESSION,
  VT_NAMES,
  WALK_FIRST_RUN_FINISH_EXPRESSION,
  fillTokens,
  hydrationScreensFor,
  missingProofYanks,
  pushHydrationRun,
  samplerExpression,
  scrapeHrefExpression,
  yesterdayEpochDay
} from './yank-sweep-core.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1] : fallback;
};
const root = resolve(flag('root', resolve(here, '..')));
const outDir = resolve(flag('out', resolve(here, '../.claude/hydration-sweep')));
const only = flag('scenes', '')
  .split(',')
  .filter(Boolean);
const profiles = flag('profiles', 'persona,empty')
  .split(',')
  .filter(Boolean);
const themes = flag('themes', 'light,dark')
  .split(',')
  .filter(Boolean);
const PIN = flag('pin', '1111');
const prove = args.includes('--prove');
const dump = args.includes('--dump');

const SCENES = hydrationScreensFor({ prove, only });

await mkdir(outDir, { recursive: true });
const browser = await launchChromium();
const app = await preview({ root, preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const errors = [];
const report = [];

const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
page.on('pageerror', (err) => errors.push(String(err)));
await page.addInitScript(INIT_HIDE_DEMO_SCRIPT);

/* ---------- the camera, desktop edition ---------- */

/** Collect compositor frames while `fn` runs, the same CDP screencast the
 *  device sweep drives. Frames arrive as they are painted, so a cold
 *  `page.goto` in between is exactly what the device records across a
 *  `location.assign`. */
async function screencast(fn) {
  const session = await page.context().newCDPSession(page);
  const frames = [];
  session.on('Page.screencastFrame', (ev) => {
    frames.push({ data: ev.data, at: ev.metadata.timestamp * 1000 });
    session.send('Page.screencastFrameAck', { sessionId: ev.sessionId }).catch(() => {});
  });
  await session.send('Page.enable');
  try {
    await session.send('Page.startScreencast', {
      format: 'png',
      maxWidth: 390,
      maxHeight: 844,
      everyNthFrame: 1
    });
    return await fn(frames);
  } finally {
    await session.send('Page.stopScreencast').catch(() => {});
    await session.detach().catch(() => {});
  }
}

/* ---------- the page, driven ---------- */

const settle = (path, theme) => settlePage(page, base, path, theme);

const waitFor = (selector, path = null, timeout = 40000) => {
  return page.waitForFunction(
    ([sel, p]) => {
      const want = p ? location.pathname === p : true;
      return !!(want && document.querySelector(sel));
    },
    [selector, path],
    { timeout }
  );
};

/** One cold scene: the camera starts rolling before the navigation, the
 *  sampler starts the moment boot reports ready, and both stop three
 *  seconds later. `waitUntil: 'commit'` so nothing of the load is waited
 *  out on the node side - the whole point of the window. Nothing is
 *  stamped on the page either: the theme is already in the preferences
 *  boot stamps, and the cold window is meant to be untouched. */
async function recordCold(href) {
  return screencast(async (cast) => {
    await page.goto(`${base}${href}`, { waitUntil: 'commit', timeout: 40000 });
    await waitFor('[data-app-root][data-boot="ready"]');
    const frames = await page.evaluate(samplerExpression('none', HYDRATION_MS, VT_NAMES));
    return { cast: [...cast], frames };
  });
}

/** One sheet scene: the screen settles first, then the camera and the
 *  sampler record the opening and its hydration together. */
async function recordSheet(scene, theme) {
  await settle(scene.at, theme);
  await page.waitForTimeout(HYDRATION_SETTLE_MS);
  return screencast(async (cast) => {
    const frames = await page.evaluate(samplerExpression(scene.act, HYDRATION_MS, VT_NAMES));
    return { cast: [...cast], frames };
  });
}

/** The tokens a scene's route may carry, filled in from the calendar and
 *  the profile's journal. Ids are scraped from the list screens that link
 *  them because the journal mints every id (ADR-0002): nothing outside it
 *  could name one ahead of time. */
async function resolveTokens(profile, theme) {
  const tokens = { yesterday: String(yesterdayEpochDay()) };
  const skipped = [];
  if (profile !== 'persona') {
    for (const key of Object.keys(HYDRATION_NEEDS)) skipped.push(key);
    return { tokens, skipped };
  }
  for (const [key, { list, prefix }] of Object.entries(HYDRATION_NEEDS)) {
    await settle(list, theme);
    const href = await page.evaluate(scrapeHrefExpression(prefix));
    if (href) tokens[key] = href.split('/').pop();
    else skipped.push(key);
  }
  return { tokens, skipped };
}

async function runScene(scene, profile, theme, tokens) {
  const needsToken = /\{(\w+)\}/.exec(scene.at)?.[1];
  if (scene.needs && needsToken && !tokens[scene.needs]) {
    report.push({ scene: scene.name, profile, theme, skipped: `no ${scene.needs} in this journal` });
    console.log(`[${profile}-${theme}] ${scene.name}: skipped, no ${scene.needs}`);
    return;
  }
  const href = fillTokens(scene.at, tokens);
  try {
    const result = scene.act ? await recordSheet(scene, theme) : await recordCold(href);
    await pushHydrationRun(report, outDir, { name: scene.name, is: scene.is, profile, theme, result, href, dump });
  } catch (err) {
    report.push({ scene: scene.name, profile, theme, href, error: String(err).slice(0, 300) });
    console.log(`[${profile}-${theme}] ${scene.name}: ERROR ${String(err).slice(0, 200)}`);
  }
}

/* ---------- the run ---------- */

for (const profile of profiles) {
  /* The profile itself. The persona reset and the first-run walk are the
     demo bar's own controls, driven as expressions so the device crawler
     does the same. The empty profile records the onboarding mount between
     its two halves, which is the only moment that screen exists. */
  await settle('/', themes[0]);
  if (profile === 'persona') {
    if (!(await page.evaluate(RESET_PERSONA_EXPRESSION))) {
      console.error('the persona reset never reached Home; stopping this profile');
      continue;
    }
    await page.evaluate(FILL_EVERY_FEATURE_EXPRESSION);
    await page.waitForTimeout(1500);
  } else {
    const mounted = await screencast(async (cast) => {
      await page.evaluate(JUMP_FIRST_RUN_EXPRESSION);
      await waitFor('[data-next]', '/onboarding', 30000);
      const frames = await page.evaluate(samplerExpression('none', HYDRATION_MS, VT_NAMES));
      return { cast: [...cast], frames };
    });
    if (SCENES.some((s) => s.name === 'onboarding-mount')) {
      try {
        await pushHydrationRun(report, outDir, {
          name: 'onboarding-mount',
          is: 'the first run opening over an empty journal',
          profile,
          theme: themes[0],
          result: mounted
        });
      } catch (err) {
        report.push({ scene: 'onboarding-mount', profile, theme: themes[0], error: String(err).slice(0, 300) });
        console.log(`[${profile}-${themes[0]}] onboarding-mount: ERROR ${String(err).slice(0, 200)}`);
      }
    }
    if (!(await page.evaluate(WALK_FIRST_RUN_FINISH_EXPRESSION))) {
      console.error('the first run never finished; stopping this profile');
      continue;
    }
    await page.waitForTimeout(1500);
  }

  for (const theme of themes) {
    /* A cold load reads its theme out of the preferences boot stamps, so
       the run's theme is written through the demo bar once per profile,
       not patched onto <html> after the fact. */
    await settle('/', theme);
    await page.evaluate(DEMO_THEME_EXPRESSION(theme));
    const { tokens, skipped } = await resolveTokens(profile, theme);
    for (const note of skipped)
      console.log(`[${profile}] no ${note} to resolve in this journal; its detail scenes will skip`);
    for (const scene of SCENES) {
      if (scene.setup) continue; /* the prologues run outside the loop */
      if (scene.when && scene.when !== profile) continue;
      if (scene.name === PROOF.scene) {
        /* The proof, hydration-style: a settled screen, three wrong
           marks, the camera rolling over the same window. */
        try {
          await settle('/', theme);
          await page.waitForTimeout(HYDRATION_SETTLE_MS);
          const result = await screencast(async (cast) => {
            await page.evaluate(`(${INJECT_PROOF_EXPRESSION})()`);
            const frames = await page.evaluate(samplerExpression('inject', HYDRATION_MS, VT_NAMES));
            return { cast: [...cast], frames };
          });
          await pushHydrationRun(report, outDir, { name: scene.name, is: scene.is, profile, theme, result });
        } catch (err) {
          report.push({ scene: scene.name, profile, theme, error: String(err).slice(0, 300) });
          console.log(`[${profile}-${theme}] ${scene.name}: ERROR ${String(err).slice(0, 200)}`);
        }
        continue;
      }
      await runScene(scene, profile, theme, tokens);
    }
  }
}

/* The lock-gate epilogue: a PIN wrapped around the journal, one cold load
   into the gate, and the wrap taken back off. Last, because a locked
   journal gates every cold load after it; under the run's first theme,
   written into the preferences first so the cold load actually boots
   with it. */
const lockScene = SCENES.find((s) => s.setup === 'pin');
if (lockScene && profiles.includes('persona')) {
  try {
    await settle('/', themes[0]);
    await page.evaluate(DEMO_THEME_EXPRESSION(themes[0]));
    await settle('/settings/access-mode', themes[0]);
    await page.evaluate(LOCK_SETUP_EXPRESSION(PIN));
    const result = await screencast(async (cast) => {
      await page.goto(`${base}/`, { waitUntil: 'commit', timeout: 40000 });
      await waitFor('[data-pin-pad]', '/', 40000);
      const frames = await page.evaluate(samplerExpression('none', HYDRATION_MS, VT_NAMES));
      return { cast: [...cast], frames };
    });
    await pushHydrationRun(report, outDir, {
      name: 'lock-gate',
      is: lockScene.is,
      profile: 'persona',
      theme: themes[0],
      result
    });
    await page.evaluate(UNLOCK_PIN_EXPRESSION(PIN));
  } catch (err) {
    report.push({ scene: 'lock-gate', profile: 'persona', theme: themes[0], error: String(err).slice(0, 300) });
    console.log(`[persona-${themes[0]}] lock-gate: ERROR ${String(err).slice(0, 200)}`);
  }
}

await writeFile(
  `${outDir}/report.json`,
  JSON.stringify(
    {
      target: 'desktop',
      mode: 'hydration',
      themes,
      profiles,
      thresholds: { HYDRATION_MS, HYDRATION_PX, DIFF_EPS, TRANSIENT_MIN, OUTLIER_MIN, GAP_RATIO },
      report,
      errors
    },
    null,
    2
  )
);
await page.close();
await browser.close();
await app.close();

const styleTotal = report.reduce((n, r) => n + (r.styleYanks?.length ?? 0), 0);
const renderTotal = report.reduce((n, r) => n + (r.pixelFindings?.length ?? 0), 0);
const skipped = report.filter((r) => r.skipped).length;
const failed = report.filter((r) => r.error).length;
console.log(
  `\n${report.length} run(s), ${styleTotal} style / ${renderTotal} render yank(s), ${skipped} skipped, ${failed} errored; report in ${outDir}/report.json`
);

/* ---------- the proof ---------- */

if (prove) {
  const missing = missingProofYanks(report);
  const cameraSaw = report
    .filter((r) => r.scene === PROOF.scene)
    .some((r) => (r.pixelFindings ?? []).some((f) => f.areaPct >= 0.05));
  if (missing.length || !cameraSaw) {
    console.error(
      `proof FAILED: ${missing.length ? `the sweep did not report ${missing.join(' or ')}` : ''}` +
        `${missing.length && !cameraSaw ? ' and ' : ''}` +
        `${!cameraSaw ? 'the camera saw none of it' : ''}. A clean run above is not evidence of anything.`
    );
    process.exitCode = 1;
  } else {
    console.log('proof: all three injected yanks were reported and the camera saw them. The sweep can fail.');
  }
}
if (errors.length) {
  console.error(`${errors.length} page error(s):`);
  for (const e of errors) console.error(`  ${e}`);
}
