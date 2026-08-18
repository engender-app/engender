import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  COLLAGE_MAX_EDGE,
  collageLayout,
  fitContain,
  fitCover,
  journeyFileName,
  journeyRangeBounds,
  journeySelection,
  TIMELAPSE_MS_PER_PHOTO,
  timelapseDurationMs
} from './journey.ts';
import type { DatedPhoto } from '../journal/photos.ts';

const photos = (): DatedPhoto[] => [
  { id: 'p1', fileName: 'p1.jpg', epochDay: 20000, milestoneName: null },
  { id: 'p2', fileName: 'p2.jpg', epochDay: 20020, milestoneName: 'Started HRT' },
  { id: 'p3', fileName: 'p3.jpg', epochDay: 20050, milestoneName: null },
  { id: 'p4', fileName: 'p4.jpg', epochDay: 20100, milestoneName: 'Name change' }
];

const ids = (selected: DatedPhoto[]) => selected.map((p) => p.id);

test('a range takes the photos inside it, inclusive at both ends', () => {
  assert.deepEqual(ids(journeySelection(photos(), { start: 20020, end: 20050 }, [])), ['p2', 'p3']);
  assert.deepEqual(ids(journeySelection(photos(), { start: 20000, end: 20100 }, [])), ['p1', 'p2', 'p3', 'p4']);
  assert.deepEqual(ids(journeySelection(photos(), { start: 20021, end: 20049 }, [])), []);
});

test('excluding a photo drops it without disturbing the rest of the order', () => {
  assert.deepEqual(ids(journeySelection(photos(), { start: 20000, end: 20100 }, ['p2'])), ['p1', 'p3', 'p4']);
  // An exclusion for a photo outside the range is not an error, just inert.
  assert.deepEqual(ids(journeySelection(photos(), { start: 20000, end: 20020 }, ['p4'])), ['p1', 'p2']);
});

test('the default range spans every photo in the journal', () => {
  assert.deepEqual(journeyRangeBounds(photos()), { start: 20000, end: 20100 });
  assert.equal(journeyRangeBounds([]), null);
});

test('a collage grid is as square as the count allows', () => {
  assert.deepEqual([collageLayout(1).columns, collageLayout(1).rows], [1, 1]);
  assert.deepEqual([collageLayout(2).columns, collageLayout(2).rows], [2, 1]);
  assert.deepEqual([collageLayout(3).columns, collageLayout(3).rows], [2, 2]);
  assert.deepEqual([collageLayout(4).columns, collageLayout(4).rows], [2, 2]);
  assert.deepEqual([collageLayout(9).columns, collageLayout(9).rows], [3, 3]);
  assert.deepEqual([collageLayout(10).columns, collageLayout(10).rows], [4, 3]);
});

test('every cell of the grid is accounted for by the canvas it is measured against', () => {
  const layout = collageLayout(7);
  assert.equal(layout.width, layout.pad * 2 + layout.columns * layout.cell + (layout.columns - 1) * layout.gap);
  assert.equal(
    layout.height,
    layout.pad * 2 + layout.rows * (layout.cell + layout.caption) + (layout.rows - 1) * layout.gap
  );
});

test('a long journey scales the whole grid down rather than growing past the canvas cap', () => {
  const small = collageLayout(6);
  assert.equal(small.cell, 360, 'a short journey gets full-size cells');

  const long = collageLayout(400);
  assert.ok(Math.max(long.width, long.height) <= COLLAGE_MAX_EDGE, `got ${long.width}x${long.height}`);
  assert.ok(long.cell < small.cell, 'cells shrink to fit');
  assert.ok(long.cell > 0 && long.fontSize > 0 && long.caption > 0, 'and nothing collapses to nothing');
});

test('contain fits the whole photo inside the box and centres what is left over', () => {
  // A landscape photo in a square box: full width, letterboxed top and bottom.
  assert.deepEqual(fitContain(1000, 500, 100, 100), { x: 0, y: 25, width: 100, height: 50 });
  // A portrait photo in a square box: full height, bars at the sides.
  assert.deepEqual(fitContain(500, 1000, 100, 100), { x: 25, y: 0, width: 50, height: 100 });
  // Smaller than the box is still scaled up, because a video frame has one size.
  assert.deepEqual(fitContain(50, 50, 100, 100), { x: 0, y: 0, width: 100, height: 100 });
});

test('cover crops the photo to the box centre instead of letterboxing it', () => {
  // A landscape photo cropped to a square: the middle square of the source.
  assert.deepEqual(fitCover(1000, 500, 100, 100), { sx: 250, sy: 0, sWidth: 500, sHeight: 500 });
  assert.deepEqual(fitCover(500, 1000, 100, 100), { sx: 0, sy: 250, sWidth: 500, sHeight: 500 });
  assert.deepEqual(fitCover(400, 400, 100, 100), { sx: 0, sy: 0, sWidth: 400, sHeight: 400 });
});

test('a timelapse lasts as long as the photos it shows', () => {
  assert.equal(timelapseDurationMs(0), 0);
  assert.equal(timelapseDurationMs(12), 12 * TIMELAPSE_MS_PER_PHOTO);
});

test('the file name says journey, not journal, and carries the right extension', () => {
  assert.equal(journeyFileName('Alicja', 'collage', 20313), 'alicja-journey-2025-08-13.jpg');
  assert.equal(journeyFileName('Alicja', 'timelapse', 20313), 'alicja-journey-2025-08-13.webm');
  assert.equal(journeyFileName('', 'collage', 20313), 'journey-2025-08-13.jpg');
  assert.equal(journeyFileName('Żaneta Kowalska', 'collage', 20313), 'zaneta-kowalska-journey-2025-08-13.jpg');
});
