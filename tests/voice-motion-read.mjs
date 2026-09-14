/* What the voice motion samples say, before anybody looks at the frames
   (redesign ticket 42).

   Alicja's test for a yank is mechanical: nothing painted at its
   destination before it travelled there, and no frame in which a thing is
   in neither place. Both are measurable off the per-animation-frame samples
   the recorder stored, so they are measured here rather than judged by eye
   - and the frames the numbers point at are named, so a review can go
   straight to them.

   Run: node tests/voice-motion-read.mjs [dir] */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const dir = resolve(process.argv[2] ?? '.claude/voice-motion');
const { scenes } = JSON.parse(await readFile(resolve(dir, 'manifest.json'), 'utf8'));

/** The inset a clip-path names, as a percentage of the box, whichever of
    the one-, two- or four-value forms the browser hands back. */
function insetOf(clip) {
  if (!clip || clip === 'none') return null;
  const numbers = [...clip.matchAll(/(-?[\d.]+)(px|%)/g)].map((m) => ({
    value: Number(m[1]),
    unit: m[2]
  }));
  if (numbers.length === 0) return 0;
  // The right edge is the second value of inset(top right bottom left), and
  // the one every clip in this ticket travels on.
  const right = numbers[1] ?? numbers[0];
  return right.unit === '%' ? right.value : 0;
}

/** How far a run of numbers travelled, and the biggest single step in it -
    the two numbers that separate a journey from a jump. */
function travel(values) {
  const seen = values.filter((v) => v !== null && Number.isFinite(v));
  if (seen.length < 2) return null;
  let biggest = { step: 0, at: 0 };
  for (let i = 1; i < seen.length; i++) {
    const step = Math.abs(seen[i] - seen[i - 1]);
    if (step > biggest.step) biggest = { step, at: i };
  }
  return {
    from: seen[0],
    to: seen.at(-1),
    distance: Math.abs(seen.at(-1) - seen[0]),
    frames: seen.length,
    biggestStep: Number(biggest.step.toFixed(2)),
    biggestStepAt: biggest.at,
    /* A movement that happens in one frame is a teleport whatever its
       length: the share of the whole journey the largest step took. */
    worstShare: Number((biggest.step / Math.max(1e-6, Math.abs(seen.at(-1) - seen[0]))).toFixed(2))
  };
}

const report = {};
for (const scene of scenes) {
  const samples = scene.samples ?? [];
  const reduced = scene.name.startsWith('reduce-');
  const row = { frames: scene.frames.length, samples: samples.length, reduced };

  if (samples.some((s) => 'density' in s)) {
    row.density = travel(samples.map((s) => insetOf(s.density)));
    row.firstBlock = travel(samples.map((s) => insetOf(s.firstBlock)));
    row.lastBlock = travel(samples.map((s) => insetOf(s.lastBlock)));
    /* The stagger: the last block is still covered after the first one has
       finished, which is what a stagger step looks like in numbers. */
    const settled = (key) => samples.findIndex((s) => insetOf(s[key]) === 0);
    row.stagger = { firstSettledAt: settled('firstBlock'), lastSettledAt: settled('lastBlock') };
  }

  if (samples.some((s) => 'clip' in s)) {
    row.clip = travel(samples.map((s) => insetOf(s.clip)));
    row.earlierMode = travel(samples.map((s) => s.earlier));
    row.laterMode = travel(samples.map((s) => s.later));
    row.earlierMedian = travel(samples.map((s) => s.earlierMedian));
    row.laterMedian = travel(samples.map((s) => s.laterMedian));
  }

  report[scene.name] = row;
}

console.log(JSON.stringify(report, null, 2));

/* The verdict, in the terms the ticket states them. Reduced motion is the
   opposite claim: one frame, no travel. */
const lines = [];
const still = [];
for (const [name, row] of Object.entries(report)) {
  for (const [what, moved] of Object.entries(row)) {
    if (!moved || typeof moved !== 'object' || !('worstShare' in moved)) continue;
    /* Under reduced motion the substitute is a cut, which in these numbers
       is the whole distance in one step - or no movement at all, where the
       transition never applied a property to begin with. Anything in
       between is the clamp not being honoured. */
    if (row.reduced) {
      if (moved.distance > 0.5 && moved.worstShare < 1) {
        lines.push(`${name}/${what}: moved over ${moved.frames} frames under reduced motion`);
      }
      continue;
    }
    /* Held still is not a defect on its own: a pair view opening moves its
       clip and nothing else, and stepping one side of a pair moves that
       side only. It is listed rather than flagged, so a movement that was
       meant to happen and did not is still visible. */
    if (moved.distance < 1) still.push(`${name}/${what} (${moved.from})`);
    else if (moved.worstShare > 0.5)
      lines.push(
        `${name}/${what}: ${Math.round(moved.worstShare * 100)}% of the journey in frame ${moved.biggestStepAt}`
      );
  }
}
if (still.length) console.log(`\nHELD STILL (check each is meant to):\n  ${still.join('\n  ')}`);
console.log(lines.length ? `\nTO LOOK AT:\n  ${lines.join('\n  ')}` : '\nNo teleports in any scene.');
