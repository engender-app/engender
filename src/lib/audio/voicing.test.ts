import assert from 'node:assert/strict';
import { test } from 'vitest';
import { MIN_SPAN_FRACTION, voicedSpans } from './voicing.ts';

/* The reading step's own feedback (Alicja 2026-09-04: "during reading the
   passage, there should be some kind of a
   basic feedback to let the user know that their voice is being recorded
   successfully").

   Spans of the window where a voice was found, as fractions of it. No y
   axis, because presence has no magnitude - which is what makes this the
   one mark that step can carry without being the graph that just left it. */

const voiced = (count: number) =>
  Array.from({ length: count }, (_, i) => ({ atSeconds: i * 0.01, hz: 180 }));

test('a window with a voice all through it is one span, end to end', () => {
  assert.deepEqual(voicedSpans(voiced(200)), [{ from: 0, to: 1 }]);
});

test('a silent window has no spans at all, rather than one empty one', () => {
  const frames = Array.from({ length: 200 }, (_, i) => ({ atSeconds: i * 0.01, hz: null }));
  assert.deepEqual(voicedSpans(frames), []);
  assert.deepEqual(voicedSpans([]), []);
});

test('a gap in the voicing is a gap in the ribbon', () => {
  const frames = [
    ...Array.from({ length: 40 }, (_, i) => ({ atSeconds: i * 0.01, hz: 180 })),
    ...Array.from({ length: 20 }, (_, i) => ({ atSeconds: (40 + i) * 0.01, hz: null })),
    ...Array.from({ length: 40 }, (_, i) => ({ atSeconds: (60 + i) * 0.01, hz: 180 }))
  ];
  const spans = voicedSpans(frames);
  assert.equal(spans.length, 2);
  assert.equal(spans[0].from, 0);
  assert.ok(Math.abs(spans[0].to - 0.4) < 1e-9);
  assert.ok(Math.abs(spans[1].from - 0.6) < 1e-9);
  assert.equal(spans[1].to, 1);
});

test('a single voiced frame is still wide enough to see', () => {
  /* One frame of 200 is half a percent of the rail, which at the 390px
     floor is under two pixels and reads as nothing. A moment the tracker
     found a voice in has to be visible or the ribbon says "silence" about
     a take that was not silent. */
  const frames = Array.from({ length: 200 }, (_, i) => ({
    atSeconds: i * 0.01,
    hz: i === 100 ? 180 : null
  }));
  const [span] = voicedSpans(frames);
  assert.ok(span, 'the one voiced frame vanished');
  assert.ok(span.to - span.from >= MIN_SPAN_FRACTION, `${span.to - span.from} of the rail`);
  // Widened around where it actually was, not shunted to one side.
  assert.ok(span.from < 0.505 && span.to > 0.5, `${span.from} to ${span.to}`);
});

test('widening a span at the very end keeps it inside the rail', () => {
  const frames = Array.from({ length: 200 }, (_, i) => ({
    atSeconds: i * 0.01,
    hz: i === 199 ? 180 : null
  }));
  const [span] = voicedSpans(frames);
  assert.ok(span.to <= 1, `${span.to} runs off the rail`);
  assert.ok(span.from >= 0);
  assert.ok(span.to - span.from >= MIN_SPAN_FRACTION);
});

test('two voiced moments a frame apart are one span, not two slivers', () => {
  // Merged once widening makes them touch, so the ribbon does not stutter
  // where the voice did not.
  const frames = Array.from({ length: 200 }, (_, i) => ({
    atSeconds: i * 0.01,
    hz: i === 100 || i === 102 ? 180 : null
  }));
  assert.equal(voicedSpans(frames).length, 1);
});
