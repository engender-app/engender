/* Sample frames for jumps, dropouts and expansions with yank-sweep-core.mjs.
   Both samplers share one rAF loop. The startViewTransition wrapper selects
   pseudo-elements while the outgoing DOM is removed. Read actual elements
   on a settled screen. Skip one-frame runs and intentional reduced-motion cuts.

   Run VITE_DEMO=1 npm run build, then node tests/guards/yank-sweep.mjs. --prove tests
   synthetic defects and --gate fails style findings. Pixel diffs are advisory
   because withdrawal blur can resemble a dropout.
   --scenes, --themes and --out set coverage and output. --reduced-motion
   checks the cut control. --force-inset enables retained doors and checks the
   strip at inset minus 9px. Use 58px for Pixel 10a and check saved casts with
   yank-sweep-strip-check.mjs. */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium, screencast, previewBuild } from '../browser-harness.mjs';
import { SETUP_STEPS } from '../setup-flow.mjs';
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
  resetSceneProfile,
  sceneForTheme,
  parseSweepViewport,
  samplerExpression
} from '../yank-sweep-core.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1] : fallback;
};
const root = resolve(flag('root', resolve(here, '../..')));
const viewport = parseSweepViewport(flag('viewport', '390x844'));
const outDir = resolve(flag('out', resolve(here, '../../.claude/yank-sweep')));
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
/** Exits non-zero on any style yank across the scenes run. */
const gate = args.includes('--gate');

/** The phone's status-bar inset, forced on a desktop page (`--force-inset
    58` is the Pixel 10a). A desktop browser has no safe area, so
    `--inset-top` is 0px and the strip `.app-strip` is 0px tall; without
    this the sweep cannot see a defect there. Set the way
    tests/tools/android-tab-status-strip.mjs sets it: the two custom properties on
    the root, and Capacitor.getPlatform answering android once boot is done
    (answering it during boot would send the web build down the native
    journal path). The properties are also set at document start, so a new
    document keeps them. */
const forceInset = Number(flag('force-inset', '0'));
if (!Number.isFinite(forceInset) || forceInset < 0) throw new Error('--force-inset takes a number of CSS px');
const FORCE_INSET_EXPRESSION = `(() => {
  const root = document.documentElement;
  root.style.setProperty('--inset-top', '${forceInset}px');
  root.style.setProperty('--field-bleed-top', '9px');
  if (window.Capacitor) window.Capacitor.getPlatform = () => 'android';
  const strip = document.querySelector('.app-strip');
  return strip ? getComputedStyle(strip).height : getComputedStyle(document.querySelector('.app') ?? root, '::before').height;
})()`;
const FORCE_INSET_INIT = `document.addEventListener('DOMContentLoaded', () => {
  document.documentElement.style.setProperty('--inset-top', '${forceInset}px');
  document.documentElement.style.setProperty('--field-bleed-top', '9px');
});`;
/** The control pass the header describes: `prefers-reduced-motion: reduce`. */
const reducedMotion = args.includes('--reduced-motion');

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
const runtime = { forceInset, reducedMotion, browser: browser.version(), release: JSON.parse(await readFile(resolve(root, 'build/release.json'), 'utf8')) };
const recorder = createReportRecorder(outDir, { target: 'desktop', viewport, runtime }, SCENES, profiles, themes, passes, errors);
const report = recorder.report;

let page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
page.on('pageerror', (err) => { errors.push(String(err)); recorder.persist(); });
await page.addInitScript(INIT_HIDE_DEMO_SCRIPT);
if (forceInset) await page.addInitScript(FORCE_INSET_INIT);
if (reducedMotion) await page.emulateMedia({ reducedMotion: 'reduce' });

const settle = async (path, theme, predecessor = null) => {
  await page.evaluate(gestureNavigationExpression(path, predecessor));
  /* Hide the demo bar without removing its first-run control. Setup
     scenes use that control to enter the flow. */
  await page.evaluate(SETTLE_PAGE_EXPRESSION(theme));
  if (forceInset) {
    const strip = await page.evaluate(FORCE_INSET_EXPRESSION);
    if (strip !== `${forceInset - 9}px`) throw new Error(`forced inset did not take: strip is ${strip}, expected ${forceInset - 9}px`);
  }
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
          const fixtureReset = await resetSceneProfile(scene, profile, (expression) => page.evaluate(expression));
          if (scene.reseed) {
            await settle('/', theme);
            await page.evaluate(FILL_EVERY_FEATURE_EXPRESSION);
            await page.evaluate(markProfileExpression(profile));
          }
          await settle(scene.at, theme, scene.act === 'back' && !scene.actionAt ? scene.after.route : null);
          if (scene.firstRun) {
            await firstRunTo(page, scene.firstRun);
            await page.evaluate(DEMO_THEME_EXPRESSION(theme));
            if (scene.name === 'setup-flag-pick') await page.evaluate(() => document.querySelector('[data-palette-pick="trans"]')?.click());
              await page.evaluate(actionPreparationExpression(scene));
          }
          else await page.evaluate(prepareSceneExpression(scene));
          await page.waitForTimeout(1400);
          if (forceInset) await page.evaluate(FORCE_INSET_EXPRESSION);
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
            fixtureReset,
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
          const failedState = await page.evaluate(`({ action: globalThis.__sweepAction, preparation: globalThis.__sweepPreparation, themeProof: globalThis.__sweepThemeProof })`).catch((failure) => ({ evidenceError: String(failure) }));
            report.push({ scene: scene.name, profile, theme, pass, ...(captureEvidence ? { evidence: captureEvidence } : {}), ...failedState, action: failedState.action ?? { requested: scene.act }, error: String(err).slice(0, 300) });
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
      runtime,
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
