/* ux-carpet 232: the bar's own pixels, read directly, for the one claim the
   ticket makes that no existing sweep checks - "the bar's pixels change by
   less than a third of the full sharp-to-withdrawn difference in any one
   frame". `yank-sweep.mjs`'s render detector looks for a region that
   disappears and comes back (a dropout); a blur snap on a plain background
   never disappears, it is simply a different bitmap in one frame, which the
   dropout detector's "changed against both neighbours, agrees with them
   elsewhere" shape does not describe - the neighbours either side of a
   sharp-to-blurred step do not agree with each other, they each agree with
   whichever side of the step they are on. So this reads the bar's own crop,
   frame by frame, directly.

   Scoped to the three scenes the ticket names (doses-sheet, regimen-add,
   roadmap-goal-tick), persona, both themes, and kept - `--scenes` lets a
   later ticket touching the withdrawal re-run it against the same three. */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePng, grayFrame } from './png-decode.mjs';
import { launchChromium, screencast, previewBuild } from './browser-harness.mjs';
import {
  FILL_EVERY_FEATURE_EXPRESSION,
  INIT_HIDE_DEMO_SCRIPT,
  RESET_PERSONA_EXPRESSION,
  SETTLE_PAGE_EXPRESSION
} from './yank-sweep-core.mjs';

/* The ticket's own three scenes. `doses-sheet` is a hydration-sweep scene
   (a sheet opening over a settled screen) and `regimen-add`/
   `roadmap-goal-tick` are yank-sweep gesture scenes - two different tables
   in yank-sweep-core.mjs, so `scenesFor` (gesture-only) cannot hand back
   all three. Written out here instead, off the same `at`/`act` those
   tables already carry. */
const ALL_SCENES = [
  { name: 'doses-sheet', at: '/care/doses', act: '[data-add]' },
  { name: 'regimen-add', at: '/care/regimen', act: '[data-add]' },
  { name: 'roadmap-goal-tick', at: '/transition/roadmap', act: '.kit-row.is-split .kit-row-main' }
];

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1] : fallback;
};
const root = resolve(flag('root', resolve(here, '..')));
const outDir = resolve(flag('out', resolve(here, '../.claude/tab-bar-withdraw-crossfade')));
const themes = flag('themes', 'light,dark').split(',').filter(Boolean);
const only = flag('scenes', 'doses-sheet,regimen-add,roadmap-goal-tick').split(',').filter(Boolean);
const passes = Number(flag('passes', '3'));
/* A third of the full sharp-to-withdrawn difference, the ticket's own
   threshold, read as a fraction of the crop's own mean absolute difference
   rather than of a fixed pixel count - so the same script reads the bar at
   any width the demo build happens to run at. */
const FRACTION = 1 / 3;

await mkdir(outDir, { recursive: true });
const SCENES = ALL_SCENES.filter((s) => only.includes(s.name));
if (!SCENES.length) throw new Error(`no scene matched --scenes ${only.join(',')}`);

const browser = await launchChromium();
const app = await previewBuild(root);
const base = `http://localhost:${app.httpServer.address().port}`;
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
page.on('pageerror', (err) => console.error('pageerror', String(err)));
await page.addInitScript(INIT_HIDE_DEMO_SCRIPT);

/** Mean absolute difference between two same-sized crops, 0-255. */
function meanAbsDiff(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
  return sum / a.length;
}

/** `gray` cropped to `box` (device px, same units the frame was captured at). */
function crop(gray, width, box) {
  const x0 = Math.max(0, Math.round(box.x));
  const y0 = Math.max(0, Math.round(box.y));
  const w = Math.max(1, Math.round(box.w));
  const h = Math.max(1, Math.round(box.h));
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) out[y * w + x] = gray[(y0 + y) * width + (x0 + x)] ?? 0;
  return out;
}

const report = [];
let failures = 0;

for (const theme of themes) {
  await page.goto(`${base}/`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]', { timeout: 30000 });
  if (await page.locator('[data-leave-setup]').count()) {
    await page.evaluate(() => document.querySelector('[data-leave-setup]')?.click());
    await page.waitForSelector('[data-home-hello]');
  }
  const reset = await page.evaluate(RESET_PERSONA_EXPRESSION);
  if (!reset) throw new Error('the persona reset never reached Home');
  await page.evaluate(FILL_EVERY_FEATURE_EXPRESSION);
  await page.waitForTimeout(1500);

  for (const scene of SCENES) {
    for (let pass = 1; pass <= passes; pass++) {
      await page.goto(`${base}${scene.at}`, { waitUntil: 'networkidle' });
      await page.waitForSelector('[data-app-root][data-boot="ready"]', { timeout: 30000 });
      await page.evaluate(SETTLE_PAGE_EXPRESSION(theme));
      await page.waitForTimeout(1400);

      /* A full-height sheet (doses-sheet, regimen-add) rises to cover the
         bar's own crop within well under a second, on top of the withdrawal
         this reads - so the crop is the bar's own top edge, the last strip
         a rising sheet reaches, rather than its whole box. 14px still
         carries real content (part of the icon row), which is what the
         cover heuristic below needs to tell "still the bar" from "now the
         sheet's own surface" apart. */
      const box = await page.evaluate(() => {
        const el = document.querySelector('[data-app-nav]');
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: Math.min(14, r.height) };
      });
      if (!box) throw new Error(`${scene.name}: no [data-app-nav] on screen`);

      const { cast } = await screencast(page, async (cast) => {
        await page.locator(scene.act).first().click();
        await page.waitForTimeout(450);
        return { cast };
      });

      const decoded = cast.map((f) => {
        const png = decodePng(Buffer.from(f.data, 'base64'));
        return { gray: grayFrame(png), width: png.width, at: f.at };
      });
      const crops = decoded.map((d) => crop(d.gray, d.width, box));
      if (crops.length < 3) {
        report.push({ scene: scene.name, theme, pass, error: `only ${crops.length} frames` });
        failures++;
        console.log(`[${theme}] ${scene.name} p${pass}: FAIL only ${crops.length} frames`);
        continue;
      }

      /* A full-height sheet (doses-sheet, regimen-add) physically rises
         over the bar's own crop within well under a second, and once it
         has, every later frame in the crop is the sheet's own flat
         surface, not the bar - comparing those frames measures the sheet
         sweeping past, which is real, wanted motion and has nothing to do
         with the withdrawal. A crop that is still the bar has real
         content in it (icons, labels) and a real spread between its
         darkest and lightest pixel; the sheet's own surface is close to
         flat. So a crop is "covered" once its own range collapses, and
         everything from the first covered frame onward - including the
         frame that covered it, which is the sheet arriving rather than
         the bar changing - is out of scope for both the worst-frame
         search and the fully-withdrawn reference. */
      const range = (c) => {
        let min = 255;
        let max = 0;
        for (let i = 0; i < c.length; i++) {
          if (c[i] < min) min = c[i];
          if (c[i] > max) max = c[i];
        }
        return max - min;
      };
      const COVERED_RANGE = 10;
      let lastUncovered = crops.length - 1;
      for (let i = 0; i < crops.length; i++) {
        if (range(crops[i]) < COVERED_RANGE) {
          lastUncovered = i - 1;
          break;
        }
      }
      if (lastUncovered < 2) {
        report.push({ scene: scene.name, theme, pass, error: `covered by frame ${lastUncovered + 1} of ${crops.length}` });
        failures++;
        console.log(`[${theme}] ${scene.name} p${pass}: FAIL bar covered by frame ${lastUncovered + 1} of ${crops.length}`);
        continue;
      }

      const fullDiff = meanAbsDiff(crops[0], crops[lastUncovered]);
      /* The ticket's own evidence is one transition, the very first
         (`u000 -> u001`) - before a full-height sheet's own rise has
         travelled far enough to physically sweep its bouncing edge back
         through this crop, which later frames of a tall sheet's settle
         demonstrably do (measured: doses-sheet's "worst" moved to a late
         frame once regimen-add's, a shorter sheet, stopped). Reported
         alongside the whole-window worst rather than instead of it. */
      const firstStep = meanAbsDiff(crops[0], crops[1]);
      const perFrame = [];
      let worst = 0;
      let worstAt = 0;
      for (let i = 1; i <= lastUncovered; i++) {
        const d = meanAbsDiff(crops[i - 1], crops[i]);
        perFrame.push({ at: Math.round(decoded[i].at), diff: Math.round(d * 100) / 100 });
        if (d > worst) {
          worst = d;
          worstAt = decoded[i].at;
        }
      }
      const ratio = fullDiff > 0.5 ? worst / fullDiff : 0;
      const firstStepRatio = fullDiff > 0.5 ? firstStep / fullDiff : 0;
      const ok = fullDiff <= 0.5 || ratio < FRACTION;
      if (!ok) failures++;
      report.push({ scene: scene.name, theme, pass, fullDiff: Math.round(fullDiff * 100) / 100, worst: Math.round(worst * 100) / 100, worstAt: Math.round(worstAt), ratio: Math.round(ratio * 1000) / 1000, firstStep: Math.round(firstStep * 100) / 100, firstStepRatio: Math.round(firstStepRatio * 1000) / 1000, frames: crops.length, uncoveredFrames: lastUncovered + 1, ok });
      console.log(
        `[${theme}] ${scene.name} p${pass}: ${ok ? 'PASS' : 'FAIL'} full=${fullDiff.toFixed(1)} worst=${worst.toFixed(1)}@${Math.round(worstAt)}ms ratio=${ratio.toFixed(3)} firstStep=${firstStep.toFixed(1)} firstStepRatio=${firstStepRatio.toFixed(3)} (${lastUncovered + 1}/${crops.length} frames before cover)`
      );
      if (!ok && process.argv.includes('--dump-worst')) {
        const i = perFrame.findIndex((p) => p.at === Math.round(worstAt)) + 1;
        for (const [suffix, idx] of [['a', i - 1], ['b', i]])
          if (cast[idx])
            await writeFile(
              `${outDir}/${scene.name}-${theme}-p${pass}-${suffix}.png`,
              Buffer.from(cast[idx].data, 'base64')
            );
      }
    }
  }
}

await writeFile(`${outDir}/report.json`, JSON.stringify({ threshold: FRACTION, report }, null, 2));
await page.close();
await browser.close();
await app.close();

console.log(`\n${report.length} run(s), ${failures} failure(s); report in ${outDir}/report.json`);
process.exit(failures ? 1 : 0);
