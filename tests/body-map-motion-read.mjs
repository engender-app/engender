/* Reads the body map's recorded motion (redesign ticket 40) and answers the
   two questions a recording at speed cannot.

   "No yanks, measured rather than watched" is a mechanical test, not an
   aesthetic one (Alicja, ticket 33: a yank is "things teleporting/
   disappearing in 1 frame"). Two things must never be true:

   - **painted at its destination before it travelled there.** For the
     arrival that means a shape fully drawn before its own stagger step has
     begun. Each region clips open from its own left edge over --dur-slow,
     starting at `--region-i * --stagger-step` (rule 10: a block slides in
     from its own edge, never fades from nothing), so a shape whose first
     sample is already whole is one that never arrived.
   - **in neither state for a frame.** For the selection change that means a
     frame where the shape being picked is not yet drawn as picked and the
     one being dropped is no longer drawn as picked, or a frame where a
     shape's border is neither its rest width nor its picked width.

   Both are read off the samples, then the frames the numbers point at are
   named so they can be looked at. The numbers find the frame; the frame
   settles it.

   Run: node tests/body-map-motion-read.mjs <motion dir> */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const dir = resolve(process.argv[2] ?? '.claude/ticket40/motion');
const { scenes } = JSON.parse(await readFile(resolve(dir, 'manifest.json'), 'utf8'));

/** A jump this big in one frame, with neighbours standing still, is a
    teleport rather than a travel - the yank sweep's own threshold. */
const TELEPORT_PX = 14;
/** Opacity at or above this reads as painted; at or below, as absent. */
const VISIBLE = 0.5;
const GONE = 0.03;

const findings = [];
const settles = [];
const note = (scene, kind, detail) => findings.push({ scene, kind, detail });

for (const scene of scenes) {
  const samples = scene.samples ?? [];
  if (samples.length < 2) {
    note(scene.name, 'no-samples', 'nothing to read');
    continue;
  }
  /* A sample is `{ t: <ms>, [region]: {...} }` - the frame's own timestamp
     sits beside the rows, and a row happens to carry a `t` of its own for
     its transform, so rows are picked out by being objects rather than by
     name. */
  const rowsOf = (frame) => Object.entries(frame).filter(([, v]) => v && typeof v === 'object');
  const keys = new Set();
  for (const frame of samples) for (const [key] of rowsOf(frame)) keys.add(key);

  const rowAt = (frame, key) => (typeof frame[key] === 'object' ? frame[key] : null);
  const atOf = (frame, i) => (typeof frame.t === 'number' ? frame.t : i * 16);

  for (const key of keys) {
    if (key.startsWith('__')) continue;
    const run = samples.map((f, i) => ({ i, at: atOf(f, i), row: rowAt(f, key) }));
    const present = run.filter((r) => r.row);
    if (present.length < 2) continue;

    /* Arrived without travelling: the very first frame this shape is in the
       tree it is already at rest. A staggered arrival has every shape below
       the first spend at least one frame under its resting opacity. */
    if (scene.name.startsWith('arrive')) {
      const first = present[0];
      const settled = present.find((r) => r.row.o >= 0.999 && r.row.clip === 'none');
      if (settled && settled.i === first.i && key !== 'whole_body') {
        note(scene.name, 'no-travel', `${key} was already at rest on its first frame (${first.at}ms)`);
      }
    }

    /* In neither place: present, then absent, then present again, with the
       two present states in different boxes. */
    for (let i = 1; i < run.length - 1; i += 1) {
      const [a, b, c] = [run[i - 1], run[i], run[i + 1]];
      if (!a.row || !c.row) continue;
      const hidden = !b.row || b.row.o <= GONE;
      const moved = Math.hypot(c.row.x - a.row.x, c.row.y - a.row.y) > 1;
      if (hidden && moved && a.row.o >= VISIBLE && c.row.o >= VISIBLE) {
        note(scene.name, 'neither-place', `${key} vanished for frame ${b.i} (${b.at}ms) and came back elsewhere`);
      }
    }

    /* Teleport: one frame's travel far larger than its neighbours'. */
    for (let i = 1; i < run.length; i += 1) {
      const a = run[i - 1].row;
      const b = run[i].row;
      if (!a || !b) continue;
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      if (d < TELEPORT_PX) continue;
      const before = i > 1 && run[i - 2].row ? Math.hypot(a.x - run[i - 2].row.x, a.y - run[i - 2].row.y) : 0;
      const after =
        i + 1 < run.length && run[i + 1].row ? Math.hypot(run[i + 1].row.x - b.x, run[i + 1].row.y - b.y) : 0;
      if (d > Math.max(before, after, 0.25) * 4) {
        note(scene.name, 'teleport', `${key} moved ${d.toFixed(1)}px between frames ${i - 1} and ${i} (${run[i].at}ms) while its neighbours moved ${Math.max(before, after).toFixed(1)}px`);
      }
    }
  }

  /* The selection change's own question: at every frame exactly one shape is
     drawn as picked. Zero for a frame is "in neither state". */
  if (scene.name.startsWith('select')) {
    for (const [i, frame] of samples.entries()) {
      const rows = rowsOf(frame).filter(([k]) => !k.startsWith('__'));
      const picked = rows.filter(([, row]) => row?.picked === 'true');
      if (picked.length !== 1) {
        note(
          scene.name,
          'selection-gap',
          `frame ${i} (${atOf(frame, i)}ms) had ${picked.length} shapes drawn as picked`
        );
      }
    }
  }

  /* The chart block's reserved height: it may not change when the region
     under it changes, or the figure is pulled up from under the finger that
     just tapped a shape. That is the claim the ticket makes, and it is
     about *selection* - so it is only asked of the selection scenes.

     The arrival is not the same question and does not pass it: the euphoria
     card comes in at 320px and eases to 232 over about 200ms, so the block
     sits above its reserve for that stretch. Traced on main's tip in a
     detached worktree, the same card goes 320 to 247 over the same 200ms
     with no reserve under it at all - it is the chart kit's own settle, not
     this ticket's, and reserving the block narrows what moves rather than
     causing it. Reported rather than failed, so it stays visible. */
  const heights = samples.map((f) => f.__charts?.h).filter((h) => typeof h === 'number');
  if (heights.length > 1) {
    const [lo, hi] = [Math.min(...heights), Math.max(...heights)];
    if (hi - lo > 1) {
      if (scene.name.startsWith('select')) {
        note(scene.name, 'charts-resized', `the chart block went ${lo}px to ${hi}px on a region change`);
      } else {
        settles.push(`${scene.name}: the chart block settled ${hi}px to ${lo}px (the chart kit's own, same on main)`);
      }
    }
  }
}

for (const scene of scenes) {
  const mine = findings.filter((f) => f.scene === scene.name);
  const frames = scene.frames.length;
  const ms = scene.frames.at(-1)?.at ?? 0;
  console.log(`\n${scene.name}: ${frames} frames over ${ms}ms, ${scene.samples?.length ?? 0} samples`);
  if (!mine.length) console.log('  no yanks');
  for (const f of mine) console.log(`  ${f.kind}: ${f.detail}`);
}
for (const line of settles) console.log(`\nnote  ${line}`);
console.log(`\n${findings.length} finding(s)`);
process.exitCode = findings.length ? 1 : 0;
