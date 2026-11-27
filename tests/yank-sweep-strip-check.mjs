// Check that .app-strip stays at --bg in every saved cast frame. Its height
// is --inset-top minus --field-bleed-top. Casts contain web content only.
// Run node tests/yank-sweep-strip-check.mjs <out> from a device sweep or one
// with --force-inset 58. --css-width defaults to the reported viewport width.
// --strip sets the height in CSS px and --json writes the result. Exit 1 on a bad frame.
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { decodePng } from './png-decode.mjs';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1] : fallback;
};
const dir = args[0];
const stripCss = Number(flag('strip', '49'));
const jsonOut = flag('json', '');
let cssWidth = Number(flag('css-width', '0'));
if (!cssWidth) {
  try {
    const report = JSON.parse(await readFile(join(dir, 'report.json'), 'utf8').catch(() => readFile(join(dir, 'report.partial.json'), 'utf8')));
    cssWidth = report.runtime?.viewport?.width ?? report.viewport?.width ?? 0;
  } catch {}
}
if (!dir) throw new Error('pass the sweep out dir: node tests/yank-sweep-strip-check.mjs <dir>');
if (!cssWidth) throw new Error('pass --css-width: no viewport in the report');

const BG = { light: [244, 248, 251], dark: [13, 20, 26] };
const TOL = 8;

/** Off-ground pixels in the band, and the band's rows that hold any. */
function band(png, expected) {
  const scale = png.width / cssWidth;
  const rows = Math.floor(stripCss * scale);
  let off = 0;
  const offRows = new Set();
  let worst = 0;
  // One row of margin at the band's lower edge: antialiasing where the strip
  // meets the field's bleed is not the strip moving.
  for (let y = 0; y < rows - 1; y++) {
    for (let x = 0; x < png.width; x++) {
      const at = (y * png.width + x) * png.channels;
      const d = Math.max(
        Math.abs(png.pixels[at] - expected[0]),
        Math.abs(png.pixels[at + 1] - expected[1]),
        Math.abs(png.pixels[at + 2] - expected[2])
      );
      if (d > TOL) {
        off++;
        offRows.add(y);
        worst = Math.max(worst, d);
      }
    }
  }
  // What covers the band when it is off: one flat colour (a scrim dimming the
  // ground, or a field painted over the whole band) or mixed content.
  let kind = 'ground';
  let colour = null;
  if (off) {
    const samples = [];
    for (let y = 0; y < rows - 1; y += 2) for (let x = 0; x < png.width; x += 3) {
      const at = (y * png.width + x) * png.channels;
      samples.push([png.pixels[at], png.pixels[at + 1], png.pixels[at + 2]]);
    }
    const median = [0, 1, 2].map((c) => samples.map((v) => v[c]).sort((a, b) => a - b)[samples.length >> 1]);
    const near = (v, ref, tol) => Math.max(...v.map((n, c) => Math.abs(n - ref[c]))) <= tol;
    const flat = samples.filter((v) => near(v, median, 10)).length / samples.length;
    colour = median;
    const ratios = median.map((n, c) => n / Math.max(1, expected[c]));
    const dimOfGround = Math.max(...median.map((n, c) => Math.abs(n - expected[c]))) <= 15 ||
      (Math.max(...ratios) - Math.min(...ratios) < 0.08 && ratios[0] < 1);
    if (flat >= 0.98) kind = dimOfGround ? 'dim' : 'flat';
    else {
      /* A sheet's scrim dims and blurs the whole frame, and the blur bleeds
         the field below into the band's last rows. If everything that is
         neither the ground nor the band's own dimmed colour sits in the
         bottom FRINGE rows, the band is the scrim's, not content. */
      const FRINGE = 8;
      let outside = 0;
      for (let y = 0; y < rows - 1 - FRINGE; y++) for (let x = 0; x < png.width; x++) {
        const at = (y * png.width + x) * png.channels;
        const v = [png.pixels[at], png.pixels[at + 1], png.pixels[at + 2]];
        if (!near(v, expected, TOL) && !near(v, median, 12)) outside++;
      }
      kind = outside === 0 && dimOfGround ? 'dim' : 'mixed';
    }
  }
  return { off, rows, offRows: offRows.size, worst, total: (rows - 1) * png.width, kind, colour };
}

const casts = (await readdir(dir, { withFileTypes: true }))
  .filter((d) => d.isDirectory() && d.name.endsWith('-cast'))
  .map((d) => d.name)
  .sort();
const results = [];
for (const name of casts) {
  const m = /^(.*)-(persona|empty)-(light|dark)-p(\d+)-cast$/.exec(name);
  if (!m) continue;
  const [, scene, profile, theme, pass] = m;
  const files = (await readdir(join(dir, name))).filter((f) => f.endsWith('.png')).sort();
  const frames = [];
  for (const file of files) {
    const png = decodePng(await readFile(join(dir, name, file)));
    const b = band(png, BG[theme]);
    const [, index, ms] = /^(\d+)-(-?\d+)ms\.png$/.exec(file);
    frames.push({ index: Number(index), ms: Number(ms), ...b, size: `${png.width}x${png.height}` });
  }
  // A scrim dimming the whole band evenly is the sheet's, not the strip
  // moving; only content (mixed) or another flat colour counts.
  const bad = frames.filter((f) => f.off > 0 && f.kind !== 'dim');
  const dim = frames.filter((f) => f.kind === 'dim').length;
  const first = bad[0] ?? null;
  results.push({
    scene, profile, theme, pass: Number(pass), cast: name, frames: frames.length,
    badFrames: bad.length,
    dimFrames: dim,
    first: first && { index: first.index, ms: first.ms, off: first.off, offRows: first.offRows, worst: first.worst, of: first.total, kind: first.kind, colour: first.colour },
    maxOff: Math.max(0, ...frames.map((f) => f.off)),
    bandPx: frames[0]?.rows,
    badList: bad.map((f) => `${f.index}@${f.ms}ms:${f.off}:${f.kind}${f.kind === 'flat' ? '(' + f.colour + ')' : ''}`)
  });
}

for (const r of results)
  console.log(
    `${r.badFrames ? 'MOVES' : 'holds'} ${r.scene} ${r.profile} ${r.theme} p${r.pass}: ${r.frames - r.badFrames - r.dimFrames}/${r.frames} frames hold --bg, ${r.dimFrames} dimmed evenly` +
      (r.first ? `; first leaves at frame ${r.first.index} (${r.first.ms} ms), ${r.first.off}/${r.first.of} px over ${r.first.offRows} rows, ${r.first.kind}${r.first.kind === 'flat' ? ' rgb(' + r.first.colour + ')' : ''}, worst channel diff ${r.first.worst}; ${r.badFrames} frames off` : '')
  );
const moved = results.filter((r) => r.badFrames);
console.log(`\n${results.length} cast(s), ${moved.length} with the strip leaving --bg (band ${results[0]?.bandPx ?? '?'} px of ${stripCss} CSS px at css width ${cssWidth})`);
if (jsonOut) await writeFile(jsonOut, JSON.stringify({ dir, stripCss, cssWidth, tol: TOL, results }, null, 1));
process.exitCode = moved.length ? 1 : 0;
