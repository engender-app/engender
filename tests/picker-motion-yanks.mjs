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
