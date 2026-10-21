/* Benchmark metric keys and comparison tiers (ADR-0060). Pitch survives a
   microphone change better than other figures, but no metric draws a
   population reference band (ADR-0059). */

/** Comparison tier for one metric. */
type MetricTier = 'referenced' | 'ownSeries';

interface VoiceMetricShape {
  key: string;
  tier: MetricTier;
}

/** The day a person last checked every figure quoted on the metric
    reference screen against its source. */
export const VOICE_METRICS_REVIEWED_ON = '2026-09-04';

/* The order the summary lists them in, which is the order the reference
   screen reads in: the two pitch figures, how much the pitch moved, the
   rate, then the two figures that are as much about the recording as about
   the voice. */
const ENTRIES = [
  {
    key: 'pitch',
    tier: 'referenced'
  },
  { key: 'span', tier: 'ownSeries' },
  { key: 'spread', tier: 'ownSeries' },
  { key: 'rate', tier: 'ownSeries' },
  { key: 'resonance', tier: 'ownSeries' },
  { key: 'room', tier: 'ownSeries' },
  /* The corner-vowel scaling factor (phase 8 features ticket 30). Fitted
     across the two extra held vowels alongside the one `resonance` already
     reads, so it carries no band for the same reason: it is built from the
     same two formants the only Polish sex-split data finds no difference in. */
  { key: 'scale', tier: 'ownSeries' }
] as const satisfies readonly VoiceMetricShape[];

export type VoiceMetricKey = (typeof ENTRIES)[number]['key'];

/** Figures read against the person's earlier takes. */
export type OwnSeriesMetricKey = Extract<(typeof ENTRIES)[number], { tier: 'ownSeries' }>['key'];

interface OwnSeriesMetric extends VoiceMetric {
  key: OwnSeriesMetricKey;
}

export const OWN_SERIES_METRICS: readonly OwnSeriesMetric[] = ENTRIES.filter(
  (entry): entry is Extract<(typeof ENTRIES)[number], { tier: 'ownSeries' }> => entry.tier === 'ownSeries'
);

/** Metric key and comparison tier for callers. */
export interface VoiceMetric extends VoiceMetricShape {
  key: VoiceMetricKey;
}

export const VOICE_METRICS: readonly VoiceMetric[] = ENTRIES;

/** Where the explanations live: a sheet over the voice screen rather than
    a screen of its own since ticket 17. */
const VOICE_METRICS_ROUTE = '/voice';

/** Where one figure's own explanation lives. Here rather than written out
    at each call site so that a link and the section it opens cannot
    drift: the sheet reads the same key out of the query
    (`voice/+page.svelte`) that names which section to land on
    (ticket 27's own rule that renaming and explaining are one edit
    applies to the query key too). A query rather than the `#anchor`
    ticket 27 shipped; `?metric=` opens the section on a cold load. */
export const metricHref = (key: VoiceMetricKey): string => `${VOICE_METRICS_ROUTE}?metric=${key}`;
