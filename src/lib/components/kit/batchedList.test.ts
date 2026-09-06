import { describe, expect, it } from 'vitest';

import { BATCH, batchesFor, nextCount, remainingCount, shownCount } from './batchedList';

describe('shownCount', () => {
  it('renders one batch when one has been asked for', () => {
    expect(shownCount(1, 100)).toBe(BATCH);
  });

  it('grows by a batch each time another is asked for', () => {
    expect(shownCount(2, 100)).toBe(BATCH * 2);
    expect(shownCount(3, 100)).toBe(BATCH * 3);
  });

  it('never claims more rows than the list holds', () => {
    expect(shownCount(1, 4)).toBe(4);
    expect(shownCount(9, 4)).toBe(4);
  });

  it('shows nothing for an empty list', () => {
    expect(shownCount(1, 0)).toBe(0);
  });

  /* A remembered count comes back from another visit to the screen, so it
     can name a batch the list no longer has: the window moved on, or a
     record was deleted while the person was away. */
  it('holds at the end of a list that has shrunk since the count was taken', () => {
    expect(shownCount(40, 12)).toBe(12);
  });

  it('treats a count below one as one, never as none', () => {
    expect(shownCount(0, 100)).toBe(BATCH);
    expect(shownCount(-3, 100)).toBe(BATCH);
  });
});

describe('remainingCount', () => {
  it('counts the rows still unrendered', () => {
    expect(remainingCount(1, 100)).toBe(100 - BATCH);
  });

  it('is nothing once every row is rendered', () => {
    expect(remainingCount(4, 100)).toBe(0);
    expect(remainingCount(1, 10)).toBe(0);
    expect(remainingCount(1, 0)).toBe(0);
  });

  it('never goes below nothing on a list that has shrunk', () => {
    expect(remainingCount(40, 12)).toBe(0);
  });
});

describe('nextCount', () => {
  it('offers a whole batch where a whole batch is left', () => {
    expect(nextCount(1, 100)).toBe(BATCH);
  });

  it('offers only what is left where that is less than a batch', () => {
    expect(nextCount(1, BATCH + 4)).toBe(4);
  });

  it('offers nothing once the list is exhausted', () => {
    expect(nextCount(1, 10)).toBe(0);
  });
});

describe('batchesFor', () => {
  it('puts the first row in the first batch', () => {
    expect(batchesFor(0)).toBe(1);
  });

  it('puts the last row of a batch in that batch, not the next one', () => {
    expect(batchesFor(BATCH - 1)).toBe(1);
  });

  it('puts the first row past a batch boundary in the next batch', () => {
    expect(batchesFor(BATCH)).toBe(2);
  });

  it('counts whole batches for a row several batches deep', () => {
    expect(batchesFor(BATCH * 3)).toBe(4);
  });

  it('treats a negative index as the first row, never as fewer than one batch', () => {
    expect(batchesFor(-1)).toBe(1);
  });
});
