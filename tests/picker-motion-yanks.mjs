/* The sampler runs on the main thread; compositor animations can advance
   across several frames while it is busy. Keep the 45% limit per 16ms,
   matching the elapsed-time normalization in yank-sweep-core.mjs. */
/** @typedef {{ t: number, open: false } | { t: number, open: true, seen: number, shown: number, op: number }} SurfaceSample */

/** @param {SurfaceSample[]} samples */
export function findSurfaceYanks(samples) {
  const yanks = [];
  /** @param {SurfaceSample} sample */
  const amount = (sample) => sample.open ? Math.min(sample.seen, sample.shown, sample.op) : 0;
  for (let i = 1; i < samples.length; i++) {
    const sample = samples[i];
    const previous = samples[i - 1];
    const elapsed = Math.max(1, sample.t - previous.t);
    const steps = Math.max(1, elapsed / 16);
    const from = amount(previous);
    const to = amount(sample);
    if (Math.abs(to - from) / steps > 0.45) {
      yanks.push({ t: sample.t, what: `surface ${from} to ${to} over ${elapsed}ms` });
    }
  }
  return yanks;
}

/** @typedef {{ t: number, open: false } | { t: number, open: true, drums: Record<string, { y: number, op: number }> }} DrumSample */

/** @param {DrumSample[]} samples */
export function findDrumYanks(samples) {
  const yanks = [];
  const windowSize = 5 * 48;
  for (let i = 1; i < samples.length; i++) {
    const sample = samples[i];
    const previous = samples[i - 1];
    if (!sample.open || !previous.open) continue;
    const elapsed = Math.max(1, sample.t - previous.t);
    const steps = Math.max(1, elapsed / 16);
    for (const [key, drum] of Object.entries(sample.drums)) {
      const before = previous.drums[key];
      if (!before || drum.op < 0.05 || before.op < 0.05) continue;
      const distance = Math.abs(drum.y - before.y);
      if (distance / steps >= windowSize) {
        yanks.push({ t: sample.t, what: `${key} drum moves ${Math.round(drum.y - before.y)}px over ${elapsed}ms` });
      }
    }
  }
  return yanks;
}

/** @typedef {{ t: number, open: false } | { t: number, open: true, vw: number, vop: number, panels: { k: number, l: number }[] }} MonthSample */

/* As with surfaces and drums, compare travel per elapsed 16ms frame.
   Samples bound average speed; they cannot locate a jump hidden in a gap. */
/** @param {MonthSample[]} samples */
export function findMonthYanks(samples) {
  const yanks = [];
  for (let i = 1; i < samples.length; i++) {
    const sample = samples[i];
    const previous = samples[i - 1];
    if (!sample.open || !previous.open || sample.vop < 0.05 || previous.vop < 0.05) continue;
    const elapsed = Math.max(1, sample.t - previous.t);
    const steps = Math.max(1, elapsed / 16);
    for (const panel of sample.panels) {
      const before = previous.panels.find((p) => p.k === panel.k);
      if (!before) continue;
      const distance = panel.l - before.l;
      if (Math.abs(distance) / steps > sample.vw * 0.5) {
        yanks.push({ t: sample.t, k: panel.k, what: `month jumps ${Math.round(distance)}px over ${elapsed}ms` });
      }
    }
  }
  return yanks;
}
