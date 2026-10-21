/* What a tick says beyond its name (phase 11 UI/UX ticket 49).

   `annotationLabel` writes "{name}, {kind}" and stops, which tells a reader
   that a milestone happened on the day under their finger and nothing about
   what the milestone was. The line builder here is the second half of that
   sentence, and every rule it follows is a rule about what a mark is allowed
   to say: a record with nothing written behind it draws no line, a disguised
   app draws no free text at all, and an era's own sentence replaces the pair
   rather than joining it.

   The assertions read the text a person sees rather than the fields behind
   it, so a kind that quietly stopped resolving its words would fail here. */

import assert from 'node:assert/strict';
import { test, vi } from 'vitest';
import type { ChartAnnotation, ChartAnnotationDetail, ChartAnnotationKind } from '$lib/charts/annotations';

/* vitest.config.ts (node tier) has no `$lib` alias, so every one of the
   module's own `$lib` value imports is pointed at the real file instead of
   failing to resolve - the pattern dayAheadRows.test.ts uses for the same
   reason, once per module rather than once. Type-only imports need none:
   they are erased before this runs. */
vi.mock('$lib/paraglide/messages', async () => await import('../../paraglide/messages.js'));
vi.mock('$lib/paraglide/runtime', async () => await import('../../paraglide/runtime.js'));
vi.mock('$lib/data/dates', async () => await import('../../data/dates.ts'));
vi.mock('$lib/data/areaGroups', async () => await import('../../data/areaGroups.ts'));
vi.mock('$lib/data/vocabulary/areaLabels', async () => await import('../../data/vocabulary/areaLabels.ts'));
vi.mock('$lib/data/vocabulary/doseLabels', async () => await import('../../data/vocabulary/doseLabels.ts'));
const { annotationReadout } = await import('./chartAnnotation.ts');
const { m } = await import('../../paraglide/messages.js');

const DAY = 20000;

const tick = (
  kind: ChartAnnotationKind,
  name: string | null,
  detail?: ChartAnnotationDetail
): ChartAnnotation => ({
  id: `${kind}-1`,
  kind,
  name,
  shape: 'point',
  fromEpochDay: DAY,
  toEpochDay: DAY,
  startsInRange: true,
  endsInRange: true,
  detail
});

const only = (annotation: ChartAnnotation) => {
  const { entries } = annotationReadout([annotation]);
  assert.equal(entries.length, 1);
  return entries[0];
};

test('a milestone reads its own description under its name', () => {
  const entry = only(tick('milestone', 'First injection', { type: 'note', text: 'hands shook the whole time' }));
  assert.equal(entry.label, m.chart_annotation_named({ name: 'First injection', kind: m.chart_annotation_milestone() }));
  assert.equal(entry.note, 'hands shook the whole time');
});

test('a procedure reads its notes and an appointment its note', () => {
  assert.equal(only(tick('surgery', 'Top surgery', { type: 'note', text: 'two nights in' })).note, 'two nights in');
  assert.equal(only(tick('appointment', 'endo', { type: 'note', text: 'bring the labs' })).note, 'bring the labs');
});

test('a record with nothing written behind it draws no line at all', () => {
  // The defect this guards: an added line that is present and empty reads as
  // the app having lost the text rather than as there never being any.
  const entry = only(tick('milestone', 'First injection'));
  assert.equal(entry.note, undefined);
  assert.ok(entry.label);
});

test('an era states its boundary as one line instead of the name and kind pair', () => {
  const entry = only(tick('era', 'First year'));
  assert.equal(entry.label, undefined);
  assert.equal(entry.note, m.chart_annotation_era_started({ name: 'First year' }));
});

test('the two area marks keep their labels', () => {
  for (const kind of ['finishedArea', 'suspendedArea'] as const) {
    const entry = only(tick(kind, 'hair'));
    assert.equal(entry.note, undefined);
    assert.ok(entry.label);
  }
});

test('a position standing for more than a day dates the line it draws', () => {
  const annotation = tick('milestone', 'First injection', { type: 'note', text: 'hands shook' });
  const dated = annotationReadout([annotation], { dated: true }).entries[0];
  assert.notEqual(dated.note, 'hands shook');
  assert.match(dated.note ?? '', /hands shook$/);
  // A tick with no line of its own gains no date: there is nothing to date.
  assert.equal(annotationReadout([tick('milestone', 'First injection')], { dated: true }).entries[0].note, undefined);
});

test('under disguise every tick keeps its pair and drops the free text', () => {
  const written: ChartAnnotation[] = [
    tick('milestone', 'First injection', { type: 'note', text: 'hands shook' }),
    tick('surgery', 'Top surgery', { type: 'note', text: 'two nights in' }),
    tick('era', 'First year')
  ];
  for (const annotation of written) {
    const { entries } = annotationReadout([annotation], { disguised: true, dated: true });
    assert.equal(entries[0].note, undefined, `${annotation.kind} drew text under disguise`);
    assert.ok(entries[0].label, `${annotation.kind} drew nothing at all under disguise`);
  }
});

test('the readout keeps its two-annotation cap and counts the rest', () => {
  const gathered = [
    tick('milestone', 'First injection', { type: 'note', text: 'hands shook' }),
    tick('surgery', 'Top surgery', { type: 'note', text: 'two nights in' }),
    tick('appointment', 'endo', { type: 'note', text: 'bring the labs' })
  ].map((annotation, index) => ({ ...annotation, id: `tick-${index}` }));
  const { entries, rest } = annotationReadout(gathered);
  assert.equal(entries.length, 2);
  assert.equal(rest, 1);
});
