import type { Measurement } from './measure.ts';

interface FixtureMeasurements {
  summary: { entries: number };
  measurements: Pick<Measurement, 'name' | 'ms'>[];
}

// Set from the first two-size desktop run; rationale lives in tests/long-journal/README.md.
const SIZE_RATIO_HEADROOM = 2;

/** Both probes publish this gate so Android and desktop judge growth alike. */
export function compareJournalSizes(oneYear: FixtureMeasurements, tenYears: FixtureMeasurements) {
  if (!(oneYear.summary.entries > 0 && tenYears.summary.entries > oneYear.summary.entries)) {
    throw new Error('Scaling needs two nonempty fixtures with increasing entry counts');
  }
  const small = new Map(oneYear.measurements.map((m) => [m.name, m]));
  const large = new Set(tenYears.measurements.map((m) => m.name));
  if (
    small.size !== oneYear.measurements.length || large.size !== tenYears.measurements.length ||
    small.size !== large.size || [...small.keys()].some((name) => !large.has(name))
  ) {
    throw new Error('Scaling needs the same unique measurement names at both sizes');
  }
  const sizeRatio = tenYears.summary.entries / oneYear.summary.entries;
  const limit = sizeRatio * SIZE_RATIO_HEADROOM;
  const measurements = tenYears.measurements.map((m) => {
    const oneYearMs = small.get(m.name)!.ms;
    if (!Number.isFinite(oneYearMs) || oneYearMs <= 0 || !Number.isFinite(m.ms) || m.ms <= 0) {
      throw new Error(`Scaling needs positive finite times for ${m.name}`);
    }
    return { name: m.name, oneYearMs, tenYearMs: m.ms, ratio: m.ms / oneYearMs };
  });
  const breaches = measurements.filter((m) => m.ratio > limit).map((m) =>
    `${m.name}: ${m.ratio.toFixed(2)}x time growth over ${limit.toFixed(2)}x limit ` +
    `(${sizeRatio.toFixed(2)}x entries, ${SIZE_RATIO_HEADROOM}x noise headroom)`
  );
  return { sizeRatio, limit, measurements, breaches };
}
