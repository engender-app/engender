/* Inspect full compositor captures from the dedicated quick-add-close scene.
   Capture: node tests/yank-sweep-device.mjs SERIAL --skip-seed --profiles persona
     --scenes quick-add-close --themes light,dark --passes 3 --dump --out DIRECTORY
   Assert: node tests/quick-add-close-motion.mjs DIRECTORY OUTPUT.json
   The whole-screen yank threshold does not measure this small text region. */
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { decodePng, grayFrame } from './png-decode.mjs';

const source = resolve(process.argv[2]);
const output = resolve(process.argv[3]);
const report = JSON.parse(await readFile(join(source, 'report.json'), 'utf8'));
assert.equal(report.target, 'device', 'close probe requires physical compositor captures');
assert.equal(report.complete, true, 'close capture did not complete');
assert.deepEqual(report.errors, [], 'close capture contains runtime or cleanup errors');
const runs = report.report.filter(row => row.scene === 'quick-add-close' && row.profile === 'persona');
assert(runs.length >= 6, 'close probe needs at least three passes in both themes');
const results = [];
for (const theme of ['light', 'dark']) {
  const themeRuns = runs.filter(row => row.theme === theme);
  assert(new Set(themeRuns.map(row => row.pass)).size >= 3, `missing distinct ${theme} close repeats`);
  assert.equal(new Set(themeRuns.map(row => row.pass)).size, themeRuns.length,
    `duplicate ${theme} close pass`);
}
for (const run of runs) {
  assert(!run.error && !run.skipped, 'close action was not measured');
  assert(run.action?.verified && run.action.requested === '.fan-scrim', 'unverified dedicated close action');
  assert.equal(run.action.beforeRoute, '/');
  assert.equal(run.action.afterRoute, '/');
  assert.equal(run.action.beforeTheme, run.theme);
  assert.equal(run.action.afterTheme, run.theme);
  assert.equal(run.profileProof.prepared, 'persona');
  assert.equal(run.profileProof.hasEntries, '1');
  const label = `quick-add-close-persona-${run.theme}-p${run.pass}`;
  const directory = join(source, `${label}-cast`);
  const frames = JSON.parse(await readFile(join(directory, 'frames.json'), 'utf8'));
  const styles = JSON.parse(await readFile(join(source, `${label}.frames.json`), 'utf8'));
  const bar = Object.values(styles[0].rows).find(row => row.semantic.startsWith('.app-nav|'));
  assert(bar?.v && bar.w > 0 && bar.h > 0, 'missing visible bottom-bar geometry');
  const samples = [];
  for (const frame of frames) {
    const png = decodePng(await readFile(join(directory, frame.file)));
    const gray = grayFrame(png);
    const scale = png.width / run.action.bounds.width;
    const left = Math.ceil((bar.x + 8) * scale);
    const right = Math.floor((bar.x + bar.w - 8) * scale);
    const top = Math.ceil((bar.y + 8) * scale);
    const bottom = Math.floor((bar.y + bar.h - 8) * scale);
    assert(left >= 0 && right < png.width && top >= 0 && bottom < png.height, 'bar crop outside capture');
    let energy = 0;
    let count = 0;
    for (let y = top; y < bottom; y++) {
      for (let x = left; x < right; x++) {
        // Exclude the rotating add mark. Only unchanged navigation text and icons count.
        if (x > left + (right - left) * 0.4 && x < left + (right - left) * 0.6) continue;
        const index = y * png.width + x;
        energy += (gray[index] - gray[index + 1]) ** 2 + (gray[index] - gray[index + png.width]) ** 2;
        count++;
      }
    }
    samples.push({ ...frame, file: join(directory, frame.file), edgeEnergy: energy / count });
  }
  assert(samples.length >= 3, 'close probe needs before, during and after frames');
  const first = samples[0];
  const last = samples.at(-1);
  const minimum = samples.reduce((a, b) => a.edgeEnergy < b.edgeEnergy ? a : b);
  const reference = Math.min(first.edgeEnergy, last.edgeEnergy);
  assert(reference > 10, 'sharp endpoints must contain legible navigation edges');
  assert(last.ms >= 500, 'close capture ends before stable after state');
  const ratio = minimum.edgeEnergy / reference;
  results.push({ theme: run.theme, pass: run.pass, route: '/', profile: 'persona', action: run.action,
    source: directory, first, minimum, last, ratio, blurred: ratio < 0.5, samples });
}
await writeFile(output, JSON.stringify({ source, serial: report.serial, results }, null, 2));
for (const result of results) {
  console.log(`${result.blurred ? 'FAIL' : 'PASS'} ${result.theme}/p${result.pass}: minimum edge ratio ${result.ratio.toFixed(4)} at frame ${result.minimum.index}, ${result.minimum.ms}ms`);
}
assert(results.every(result => !result.blurred), 'bottom bar loses navigation edge detail during Quick add close');
