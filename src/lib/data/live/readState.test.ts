import { describe, expect, it } from 'vitest';

import { emptyOf, gaveUp, landed, pending, rowsOf, type ReadState } from './readState.ts';

describe('pending', () => {
  it('is loading, with nothing to show and nothing wrong', () => {
    expect(pending<string[]>()).toEqual({ value: undefined, loading: true, failed: false });
  });
});

describe('landed', () => {
  it('stops loading and holds the result', () => {
    expect(landed(7)).toEqual({ value: 7, loading: false, failed: false });
  });

  it('clears a failure the run before it left behind', () => {
    const failed = gaveUp(landed(1));
    expect(failed.failed).toBe(true);
    expect(landed(2).failed).toBe(false);
  });
});

describe('gaveUp', () => {
  it('names the failure and stops loading', () => {
    const state = gaveUp(pending<number[]>());
    expect(state.failed).toBe(true);
    expect(state.loading).toBe(false);
  });

  it('leaves the last result standing rather than blanking the screen', () => {
    expect(gaveUp(landed([1, 2])).value).toEqual([1, 2]);
  });

  it('does not confuse an initial failure with an empty success', () => {
    const state: ReadState<number[]> = gaveUp(pending<number[]>());
    expect(rowsOf(state)).toEqual([]);
    expect(emptyOf(state)).toBe(false);
  });
});

describe('rowsOf', () => {
  it('defaults to an empty list before the first result', () => {
    expect(rowsOf(pending<number[]>())).toEqual([]);
  });

  it('is the result once there is one', () => {
    expect(rowsOf(landed([3]))).toEqual([3]);
  });
});

describe('emptyOf', () => {
  it('is not empty while the first read is still out', () => {
    expect(emptyOf(pending<number[]>())).toBe(false);
  });

  it('is empty when the read came back with no rows', () => {
    expect(emptyOf(landed([]))).toBe(true);
  });

  it('does not repeat an empty claim after refresh fails', () => {
    expect(emptyOf(gaveUp(landed([])))).toBe(false);
  });

  it('is not empty when there are rows', () => {
    expect(emptyOf(landed([1]))).toBe(false);
  });
});
