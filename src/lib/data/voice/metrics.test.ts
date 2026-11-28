/* The metric registry's own invariants.

   What this file is for: the registry decides which figure is Referenced and which is read
   only against the person's own earlier takes. No figure draws a population band any more
   (ADR-0059), so what is left to protect is that every figure is explained, keyed once and
   typed into every prose map.

   Node tier, so this imports metrics.ts and never metricLabels.ts. */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test, expect } from 'vitest';
import {
  VOICE_METRICS,
  VOICE_METRICS_REVIEWED_ON,
  type VoiceMetricKey
} from './metrics.ts';

test('every metric carries a unique key', () => {
  const keys = VOICE_METRICS.map((metric) => metric.key);

  expect(new Set(keys).size).toBe(keys.length);
});

test('the seven figures a benchmark reports are the seven explained', () => {
  expect(VOICE_METRICS.map((metric) => metric.key)).toEqual([
    'pitch',
    'span',
    'spread',
    'rate',
    'resonance',
    'room',
    'scale'
  ]);
});

test('exactly one figure is Referenced, and it is speaking pitch', () => {
  const referenced = VOICE_METRICS.filter((metric) => metric.tier === 'referenced');

  expect(referenced.map((metric) => metric.key)).toEqual(['pitch']);
});

/* What makes the prose half exhaustive, proved by removing an entry rather
   than by restating the type. metricLabels.ts holds seven `Record<
   VoiceMetricKey, Message>` maps, so a metric added to metrics.ts and
   forgotten there is a typecheck failure; this is what that failure looks
   like, and `npm run check` fails if the line below ever stops erroring -
   which is what would happen if VoiceMetricKey widened to `string` or the
   key list stopped being `as const`. */
/* The check above proves the mechanism over a record written here, which leaves one gap:
   widening one of metricLabels.ts's own maps to a `Partial` or to `Record<string, Message>`
   would take the compile error away and this file would not notice. That file cannot be
   imported here at all - it reaches paraglide, which the Node tier has no business loading
   - so the shape is read off its source instead. The other half of this is a runtime one:
   the browser tier renders all six sections and fails unless each carries all seven fields,
   so a map that lost an entry is caught there whatever its type says. */
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
    room: '',
    scale: ''
  };

  expect(Object.keys(shortened)).toHaveLength(6);
});

test('the review date is a plain ISO day', () => {
  expect(VOICE_METRICS_REVIEWED_ON).toMatch(/^\d{4}-\d{2}-\d{2}$/);
});
