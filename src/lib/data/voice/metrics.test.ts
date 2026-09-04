/* The metric registry's own invariants (phase 8 features ticket 27,
   ADR-0060).

   What this file is for: the registry decides which figure may carry a
   cited band and which may not, and both halves of that are a safety
   claim rather than a formatting one. A band drawn against the wrong
   language reads as a verdict with a citation behind it, and a missing
   band that nothing explains reads as a bug.

   Node tier, so this imports metrics.ts and never metricLabels.ts
   (ADR-0016).

   `bandsOf` is driven over entries written here rather than only over the
   shipped table: the shipped table has one Referenced figure and two
   sourced languages, so every interesting case - a language nobody
   measured, an own-series figure asked for a band - is unreachable
   through it. The rule under test is the production one either way. */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test, expect } from 'vitest';
import {
  VOICE_METRICS,
  VOICE_METRICS_REVIEWED_ON,
  bandsOf,
  type VoiceMetric,
  type VoiceMetricKey
} from './metrics.ts';

test('every metric carries a unique key', () => {
  const keys = VOICE_METRICS.map((metric) => metric.key);

  expect(new Set(keys).size).toBe(keys.length);
});

test('the six figures a benchmark reports are the six explained', () => {
  expect(VOICE_METRICS.map((metric) => metric.key)).toEqual([
    'pitch',
    'span',
    'spread',
    'rate',
    'resonance',
    'room'
  ]);
});

test('exactly one figure is Referenced, and it is speaking pitch (ADR-0060)', () => {
  const referenced = VOICE_METRICS.filter((metric) => metric.tier === 'referenced');

  expect(referenced.map((metric) => metric.key)).toEqual(['pitch']);
});

test('an Own-series figure carries no sourced language to draw a band from', () => {
  const banded = VOICE_METRICS.filter(
    (metric) => metric.tier === 'ownSeries' && metric.bandLanguages.length > 0
  );

  expect(banded.map((metric) => metric.key)).toEqual([]);
});

test('the Referenced figure names both languages the app has passages in', () => {
  const pitch = VOICE_METRICS.find((metric) => metric.key === 'pitch')!;

  expect([...pitch.bandLanguages].sort()).toEqual(['en', 'pl']);
});

/* The rule ADR-0060 exists for. Three cases, and the middle one is the
   harmful one: an English-sourced band against a Polish read puts an
   ordinary Polish cis man inside the range captioned cis woman. */
const sourcedInEnglishOnly: VoiceMetric = { key: 'pitch', tier: 'referenced', bandLanguages: ['en'] };

test('a Referenced figure draws bands for a language its citation covers', () => {
  const bands = bandsOf(sourcedInEnglishOnly, 'en');

  expect(bands?.map((band) => band.key)).toEqual(['cisMan', 'cisWoman', 'between']);
});

test('a language the citation does not cover draws no band, not the English one', () => {
  expect(bandsOf(sourcedInEnglishOnly, 'pl')).toBe(null);
});

test('an Own-series figure draws no band in any language', () => {
  const spread = VOICE_METRICS.find((metric) => metric.key === 'spread')!;

  expect(bandsOf(spread, 'en')).toBe(null);
  expect(bandsOf(spread, 'pl')).toBe(null);
});

test('the shipped table draws the pitch bands for both passages', () => {
  const pitch = VOICE_METRICS.find((metric) => metric.key === 'pitch')!;

  expect(bandsOf(pitch, 'en')).not.toBe(null);
  expect(bandsOf(pitch, 'pl')).not.toBe(null);
});

/* What makes the prose half exhaustive, proved by removing an entry rather
   than by restating the type. metricLabels.ts holds seven `Record<
   VoiceMetricKey, Message>` maps, so a metric added to metrics.ts and
   forgotten there is a typecheck failure; this is what that failure looks
   like, and `npm run check` fails if the line below ever stops erroring -
   which is what would happen if VoiceMetricKey widened to `string` or the
   key list stopped being `as const`. */
/* The check above proves the mechanism over a record written here, which
   leaves one gap: widening one of metricLabels.ts's own maps to a
   `Partial` or to `Record<string, Message>` would take the compile error
   away and this file would not notice. That file cannot be imported here
   at all - it reaches paraglide, which the Node tier has no business
   loading (ADR-0016) - so the shape is read off its source instead. The
   other half of this is a runtime one: the browser tier renders all six
   sections and fails unless each carries all seven fields, so a map that
   lost an entry is caught there whatever its type says. */
test('every prose map is still typed against the whole key union', () => {
  const source = readFileSync(fileURLToPath(new URL('./metricLabels.ts', import.meta.url)), 'utf8');
  const maps = [...source.matchAll(/const ([A-Z_]+): ([^=]+) = \{/g)].map(([, name, type]) => [
    name,
    type.trim()
  ]);

  // The seven fields, plus the figure's own name.
  const overMetrics = maps.filter(([, type]) => type.includes('VoiceMetricKey'));
  expect(overMetrics.length).toBe(8);
  expect(overMetrics.filter(([, type]) => type !== 'Record<VoiceMetricKey, Message>')).toEqual([]);
});

test('a prose map missing one metric does not typecheck', () => {
  // @ts-expect-error 'spread' is missing, which is exactly the state of a
  // metric registered in metrics.ts and never explained in metricLabels.ts.
  const shortened: Record<VoiceMetricKey, string> = {
    pitch: '',
    span: '',
    rate: '',
    resonance: '',
    room: ''
  };

  expect(Object.keys(shortened)).toHaveLength(5);
});

test('the review date is a plain ISO day', () => {
  expect(VOICE_METRICS_REVIEWED_ON).toMatch(/^\d{4}-\d{2}-\d{2}$/);
});
