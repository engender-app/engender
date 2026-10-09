/* The yank sweep (redesign ticket 20, device half added by ticket 100):
   every navigation and state change sampled per frame, looking for the
   things Alicja calls a yank - something teleporting from one place to
   another in a single frame, something disappearing in a single frame, and
   (ticket 99 round 2's find) something rendering larger than its own
   resting bounds for a frame or two.

   Why a detector and not twenty flipbooks. Every round of notes on this
   phase's motion has come back as a frame pair - "look what happens between
   frames 5 and 6", "frames 9 and 10 in the first anim, 16 and 17 - second" -
   and every pair named a real single-frame defect: a card cut instead of
   faded, a line closing in one frame, an element in neither place for two
   frames. Those are found by comparing consecutive frames, which is
   arithmetic, so the arithmetic is written down here instead of being done
   by eye over hundreds of images. `tests/blind-motion-gallery.mjs` reads one
   gesture's own pseudo elements in depth; this reads every gesture shallowly
   and says which ones are worth that depth.

   The scene table, the thresholds and the arithmetic live in
   `tests/yank-sweep-core.mjs`, shared with `tests/yank-sweep-device.mjs`,
   which points the same instruments at a real Android phone: the styles a
   browser reports are not always the pixels a phone paints - the
   field-blind bug's trace was correct while its render was not - so the
   device sweep adds a camera (CDP screencast) and reads the render itself.

   What it samples, and why it is two instruments read at once. Across a
   navigation the live DOM is not what is on screen: the browser paints the
   captured pseudo elements, and `$lib/motion/outgoingScreen` removes the
   outgoing page on purpose before the new side is captured. Sampling the
   tree there reports the whole outgoing screen and all 107 of its
   descendants as vanishing on one frame, which is true of the DOM and says
   nothing about what a person saw. So a navigation is read off the
   transition's own pseudo elements - the translation, the opacity, the
   extent and the clip the browser is painting at that instant - the way
   `tests/blind-motion-gallery.mjs` reads one gesture in depth. A state
   change inside a settled screen runs no view transition, so there the
   tree *is* what is painted, and every element in the app frame is read:
   its box, its opacity, and whether it is there at all.

   Which of the two applies is not declared per scene, because a scene does
   not know: picking a mood on Today and choosing a span on Look back both
   navigate, and hand-labelling them as state changes reported the whole
   outgoing screen as 328 and 89 vanishing marks. Both instruments run in
   the same rAF loop and the run decides.

   What decides is `document.startViewTransition`, wrapped for the length of
   the sample. Asking the pseudo elements instead does not work:
   `getComputedStyle(root, '::view-transition-new(screen)')` answers
   `translate: 0px` at `opacity: 1` whether or not a transition is running,
   so "a pseudo answered" is true on every frame. Reading that as the window
   put the frames either side of the transition inside it, and the step from
   the identity default into the animation's first keyframe - 0 to 77px at
   opacity 1 to 0 - then read as a teleport and a vanish on every
   navigation. It is neither: nothing was painted from those frames. Only
   the frames the browser says it was transitioning on are the run.

   What is not a yank, and is filtered rather than reported. A cut is the
   documented substitute under `prefers-reduced-motion` (ADR-0078: substitute,
   never delete), so the reduced-motion pass is a control rather than a
   subject. The outgoing screen is removed on purpose before the new side is
   captured (`$lib/motion/outgoingScreen`), so the screen element itself is
   exempt. And a mark whose whole run is one frame long was never animating.

   A sweep that reports nothing is worth nothing until it has been seen to
   fail, so `--prove` runs one extra scene whose three marks are built to be
   wrong: one jumps 200px between two frames after moving smoothly, one
   goes from opaque to nothing between two frames after fading part of the
   way, and one renders a window tall for a single frame between two at
   rest. The run reports them or exits non-zero.

   The proof is synthetic on purpose. Cutting a real surface to order does
   not work: the first attempt took the CSS transition off the notice, but
   the notice leaves on Svelte's `transition:collapse`, which writes inline
   styles per frame and does not read the stylesheet, so the injection was
   inert and the sweep was right to report nothing. What needs proving is
   the arithmetic over consecutive frames, and these three marks exercise
   exactly that, including the part a real surface cannot: marks whose
   neighbours are moving, so each defect is caught as a spike rather than
   as motion.

   Run against a demo build:
     VITE_DEMO=1 npm run build
     node tests/yank-sweep.mjs
     node tests/yank-sweep.mjs --prove
   `--scenes a,b` narrows the run; `--out <dir>` names where the report and
   the frames of any yank land; `--themes light,dark` runs each scene under
   more than the default light theme.

   `--gate` exits non-zero if any style yank is found across the scenes run
   (ticket 244): CI has no other check that a sheet or other local
   transition actually plays, and 242's own regression - every ordinary
   sheet's rise and scrim fade skipped for 34 sheets - passed every guard
   in the suite silently. Render findings don't gate: the scrim's own
   withdrawal blur fading in for the first time reads as a "dropout" to the
   pixel detector on every sheet that has ever been checked this way
   (tickets 149, 231, phase-12 152), a named false-positive family rather
   than something a real fix could clear. */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium, screencast, previewBuild } from './browser-harness.mjs';
import { SETUP_STEPS } from './setup-flow.mjs';
import {
  BLOAT_PX,
  BLOAT_RATIO,
  EXEMPT,
  FILL_EVERY_FEATURE_EXPRESSION,
  GONE,
  INIT_HIDE_DEMO_SCRIPT,
  INJECT_PROOF_EXPRESSION,
  JUMP_FIRST_RUN_EXPRESSION,
  PROOF,
  SCENE_MS,
  SETTLE_PAGE_EXPRESSION,
  TELEPORT_PX,
  TELEPORT_RATIO,
  VISIBLE,
  VT_NAMES,
  WALK_FIRST_RUN_FINISH_EXPRESSION,
  finishFirstRun,
  DEMO_THEME_EXPRESSION,
  gestureNavigationExpression,
  prepareSceneExpression,
  actionPreparationExpression,
  cleanupSceneExpression,
  cleanupSceneFailure,
  actionPostconditionExpression,
  coverageSummary,
  createReportRecorder,
  saveSceneCast,
  coldLoadProofExpression,
  markProfileExpression,
  profileProofExpression,
  findYanks,
  missingProofYanks,
  missingPaintedProof,
  readRenderYanks,
  scenesFor,
  sceneForTheme,
  parseSweepViewport,
  samplerExpression
} from './yank-sweep-core.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1] : fallback;
};
const root = resolve(flag('root', resolve(here, '..')));
const viewport = parseSweepViewport(flag('viewport', '390x844'));
const outDir = resolve(flag('out', resolve(here, '../.claude/yank-sweep')));
const only = flag('scenes', '')
  .split(',')
  .filter(Boolean);
const themes = flag('themes', 'light,dark')
  .split(',')
  .filter(Boolean);
const profiles = flag('profiles', 'persona,empty')
  .split(',')
  .filter(Boolean);
const passes = Number(flag('passes', '3'));
/** Injects four defects, so the detector can be seen to find them. */
const prove = args.includes('--prove');
/** Exits non-zero on any style yank across the scenes run (ticket 244). */
const gate = args.includes('--gate');

const SCENES = scenesFor({ prove, only });

/** The first run, walked to `target`. The demo bar is removed by `settle`,
    so the jump is set on the control rather than selected through it. */
async function firstRunTo(p, target) {
  await p.locator('#demo-jump').evaluate((el) => {
    el.value = 'first-run';
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await p.waitForSelector('[data-next]');
  for (const step of SETUP_STEPS) {
    await p.waitForTimeout(500);
    if (step === 'name') await p.locator('#ob-name').fill('Ola');
    if (step === target) return;
    await p.locator('[data-next]').click();
  }
}

await mkdir(outDir, { recursive: true });
const browser = await launchChromium();
const app = await previewBuild(root);
const base = `http://localhost:${app.httpServer.address().port}`;
const errors = [];
const recorder = createReportRecorder(outDir, { target: 'desktop', viewport }, SCENES, profiles, themes, passes, errors);
const report = recorder.report;

let page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
page.on('pageerror', (err) => { errors.push(String(err)); recorder.persist(); });
await page.addInitScript(INIT_HIDE_DEMO_SCRIPT);

const settle = async (path, theme, predecessor = null) => {
  await page.evaluate(gestureNavigationExpression(path, predecessor));
  /* The demo bar is hidden rather than removed since redesign ticket 33:
     setup's own scenes reach the flow through the demo's first-run control,
     and a removed bar takes the control with it. Nothing measures the bar
     either way - it is out of the frame and out of the flow. */
  await page.evaluate(SETTLE_PAGE_EXPRESSION(theme));
};

for (const profile of profiles) {
  await page.goto(`${base}/`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]', { timeout: 30000 });
  if (await page.locator('[data-leave-setup]').count()) {
    await page.evaluate(() => document.querySelector('[data-leave-setup]')?.click());
    await page.waitForSelector('[data-home-hello]');
  }

  if (profile === 'persona') {
    await page.evaluate(FILL_EVERY_FEATURE_EXPRESSION);
    await page.waitForTimeout(1500);
  } else {
    await page.evaluate(JUMP_FIRST_RUN_EXPRESSION);
    await page.waitForSelector('[data-next]');
    const finished = await finishFirstRun((expression) => page.evaluate(expression), { onProgress: (state) => console.log('boot readiness:', JSON.stringify(state)) });
    if (!finished) {
      console.error('the first run never finished; stopping this profile');
      continue;
    }
    await page.waitForTimeout(1500);
  }

  await page.evaluate(markProfileExpression(profile));
  for (const theme of themes) {
    await settle('/', theme);
    const profileProof = await page.evaluate(profileProofExpression(profile));
    for (const listedScene of SCENES) {
        const scene = sceneForTheme(listedScene, theme);
      if (scene.when && scene.when !== profile) continue;
      for (let pass = 1; pass <= passes; pass++) {
        if (scene.androidOnly) {
          report.push({ scene: scene.name, profile, theme, pass, skipped: 'Android-only reminder list; web renders install prompt' });
          continue;
        }
        let captureEvidence;
        try {
          await page.evaluate(`globalThis.__sweepAction = null; globalThis.__sweepPreparation = null; true;`);
          if (scene.reseed) {
            await settle('/', theme);
            await page.evaluate(FILL_EVERY_FEATURE_EXPRESSION);
            await page.evaluate(markProfileExpression(profile));
          }
          await settle(scene.at, theme, scene.act === 'back' ? scene.after.route : null);
          if (scene.firstRun) {
            await firstRunTo(page, scene.firstRun);
            await page.evaluate(DEMO_THEME_EXPRESSION(theme));
            if (scene.name === 'setup-flag-pick') await page.evaluate(() => document.querySelector('[data-palette-pick="trans"]')?.click());
              await page.evaluate(actionPreparationExpression(scene));
          }
          else await page.evaluate(prepareSceneExpression(scene));
          await page.waitForTimeout(1400);
          if (scene.act === 'inject') await page.evaluate(`(${INJECT_PROOF_EXPRESSION})()`);
          const { cast, all_frames } = await screencast(page, async (cast) => {
            const all_frames = await page.evaluate(samplerExpression(scene, SCENE_MS, VT_NAMES));
            return { cast, all_frames };
          });
          captureEvidence = await saveSceneCast(cast, outDir, scene.name, `${profile}-${theme}-p${pass}`);
          await writeFile(`${outDir}/${scene.name}-${profile}-${theme}-p${pass}.frames.json`, JSON.stringify(all_frames, null, 1));
          const action = await page.evaluate(actionPostconditionExpression(scene, all_frames[0]?.action));
          const cleanup = await page.evaluate(cleanupSceneExpression(scene));
          /* A transition ran, so the pseudos are what the person saw, and only the
             frames it was running on are the gesture. */
          const transitioned = all_frames.some((f) => f.active);
          const instrument = transitioned ? 'vt' : 'rows';
          const frames = transitioned ? all_frames.filter((f) => f.active) : all_frames;
          if (!frames.length) throw new Error('no frames to read');
          const all = findYanks(frames, instrument, frames.length - 1);
          const yanks = all.filter((y) => !EXEMPT.test(y.mark));
          const render = await readRenderYanks(cast, outDir, scene.name, `${profile}-${theme}-p${pass}`, undefined, { allowThin: true });
          const evidence = captureEvidence;
          report.push({
            scene: scene.name,
            profile,
            theme,
            pass,
            is: scene.is,
            action,
            cleanup,
            profileProof,
            ...(evidence ? { evidence } : {}),
            instrument,
            frames: frames.length,
            sampled: all_frames.length,
            cast: render.cast,
            from: frames[0]?.at ?? 0,
            span: frames.at(-1)?.at ?? 0,
            yanks,
            pixelFindings: render.findings,
            suppressed: all.length - yanks.length
          });
          console.log(
            `[${profile}-${theme}] ${scene.name} p${pass}: ${frames.length} frames read as ${instrument === 'vt' ? 'a transition' : 'a state change'} / ${render.cast} render frames, ${yanks.length} style / ${render.findings.length} render yank(s)` +
              (yanks.length || render.findings.length
                ? `\n  ${[
                    ...yanks.map((y) => `style ${y.kind} ${y.mark} @${y.at}ms - ${y.detail}`),
                    ...render.findings.map(
                      (f) => `render ${f.kind} @${f.at}ms box ${f.box.w}x${f.box.h} area ${(f.areaPct * 100).toFixed(1)}%`
                    )
                  ].join('\n  ')}`
                : '')
          );
        } catch (err) {
          const failureCleanup = await cleanupSceneFailure(scene, (expression) => page.evaluate(expression));
          const failedState = await page.evaluate(`({ action: globalThis.__sweepAction, preparation: globalThis.__sweepPreparation, themeProof: globalThis.__sweepThemeProof })`).catch((failure) => ({ evidenceError: String(failure) }));
            report.push({ scene: scene.name, profile, theme, pass, ...(captureEvidence ? { evidence: captureEvidence } : {}), ...failedState, ...(failureCleanup ? { failureCleanup } : {}), action: failedState.action ?? { requested: scene.act }, error: String(err).slice(0, 300) });
          console.log(`[${profile}-${theme}] ${scene.name} p${pass}: ERROR ${String(err).slice(0, 160)}`);
        }
      }
    }
  }
}

await recorder.flush();
await writeFile(
  `${outDir}/report.json`,
  JSON.stringify(
    {
      target: 'desktop',
      viewport,
      complete: true,
      themes,
      passes,
      thresholds: { TELEPORT_PX, TELEPORT_RATIO, VISIBLE, GONE, BLOAT_PX, BLOAT_RATIO },
      coverage: coverageSummary(SCENES, profiles, themes, passes, report),
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
const total = report.reduce((n, r) => n + (r.yanks?.length ?? 0), 0);
const renderTotal = report.reduce((n, r) => n + (r.pixelFindings?.length ?? 0), 0);
console.log(`\n${report.length} run(s), ${total} style / ${renderTotal} render yank(s); report in ${outDir}/report.json`);

if (prove) {
  const proofRuns = report.filter((r) => r.scene === PROOF.scene);
  const missing = missingProofYanks(report);
  const cameraSaw = missingPaintedProof(report).length === 0;
  if (missing.length || !cameraSaw) {
    console.error(
      `proof FAILED: ${missing.length ? `the style arithmetic did not report ${missing.join(' or ')}` : ''}` +
        `${missing.length && !cameraSaw ? ' and ' : ''}` +
        `${!cameraSaw ? 'the camera saw none of it' : ''}. A clean run above is not evidence of anything.`
    );
    process.exitCode = 1;
  } else {
    console.log('proof: all six injected yanks were reported and the camera saw them. The sweep can fail.');
  }
}
if (gate && total > 0) {
  console.error(`gate FAILED: ${total} style yank(s) across the scenes run - see the report above.`);
  process.exitCode = 1;
}
if (errors.length) {
  console.error(`${errors.length} page error(s):`);
  for (const e of errors) console.error(`  ${e}`);
}

const coverage = coverageSummary(SCENES, profiles, themes, passes, report);
console.log('coverage:', JSON.stringify(coverage.groups));
if (coverage.failed || coverage.missing) process.exitCode = 1;
