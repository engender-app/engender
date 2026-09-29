/* Where the blind's edge is painted, frame by frame, read off the pixels of
   a field-text probe recording (ticket 285, Android half).

   The probe's sampler reads the edge from computed style, which is the
   main thread's value. A compositor animation would draw something else
   (a straight ramp between the ends) without the style ever saying so, so
   the question "is the edge drawn on the curve?" has to be answered on
   the pixels. For every kept screencast frame this finds the lowest pure
   blue row in a few columns clear of the type and the rings, in CSS
   pixels, and sets it against (a) the sampler's edge at the same moment
   and (b) a straight line between the pixel edge at the start and the end
   of the travel. Whichever model the pixels sit closer to is the answer.

   Run: node tests/field-text-edge-series.mjs <frames dir> [<frames dir>...]
   where each dir was written by field-text-probe.mjs --frames (--keep-all). */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { decodePng } from './png-decode.mjs';

const DPR = Number(process.env.DPR ?? 2.625);

function blueBottom(png) {
  const { width, height, channels, pixels } = png;
  const cols = [0.15, 0.3, 0.45, 0.6].map((f) => Math.round(width * f));
  const rows = [];
  for (const x of cols) {
    let last = -1;
    for (let y = 0; y < Math.min(height, 900 * DPR); y++) {
      const i = (y * width + x) * channels;
      if (pixels[i + 2] > 200 && pixels[i + 2] - Math.max(pixels[i], pixels[i + 1]) > 60) last = y;
    }
    rows.push(last);
  }
  rows.sort((a, b) => a - b);
  return rows[Math.floor(rows.length / 2)] / DPR;
}

const at = (series, t) => {
  if (t <= series[0].t) return series[0].edge;
  for (let i = 1; i < series.length; i++) {
    if (t <= series[i].t) {
      const k = (t - series[i - 1].t) / (series[i].t - series[i - 1].t || 1);
      return series[i - 1].edge + k * (series[i].edge - series[i - 1].edge);
    }
  }
  return series.at(-1).edge;
};

for (const dir of process.argv.slice(2)) {
  const manifest = JSON.parse(await readFile(resolve(dir, 'manifest.json'), 'utf8'));
  const series = manifest.rows.filter((r) => r.edge !== undefined);
  if (series.length < 4) {
    console.log(`${manifest.name}: no edge series`);
    continue;
  }
  const t0 = series[0].t;
  const t1 = series.at(-1).t;
  const px = [];
  for (const f of manifest.frames) {
    if (f.at < t0 - 60 || f.at > t1 + 60) continue;
    px.push({ t: f.at, y: blueBottom(decodePng(await readFile(resolve(dir, f.file)))) });
  }
  if (px.length < 3) {
    console.log(`${manifest.name}: only ${px.length} frames in the travel`);
    continue;
  }
  const y0 = px[0].y;
  const y1 = px.at(-1).y;
  let curve = 0;
  let line = 0;
  let n = 0;
  const lines = [];
  for (const p of px) {
    const s = at(series, p.t);
    const ramp = y0 + ((p.t - px[0].t) / (px.at(-1).t - px[0].t)) * (y1 - y0);
    if (Math.abs(y1 - y0) > 4 && p !== px[0] && p !== px.at(-1)) {
      curve += Math.abs(p.y - s);
      line += Math.abs(p.y - ramp);
      n++;
    }
    lines.push(`  ${String(Math.round(p.t)).padStart(5)}ms pixels ${p.y.toFixed(1)}  sampler ${s.toFixed(1)}  straight ${ramp.toFixed(1)}`);
  }
  console.log(`${manifest.name} (run ${manifest.run}): edge ${y0.toFixed(1)} to ${y1.toFixed(1)}px over ${Math.round(t1 - t0)}ms`);
  console.log(lines.join('\n'));
  if (n) console.log(`  mean gap to the sampler's curve ${(curve / n).toFixed(2)}px, to a straight ramp ${(line / n).toFixed(2)}px (${n} frames)`);
}
