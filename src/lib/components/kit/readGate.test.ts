import { describe, expect, it } from 'vitest';

import { gateBranch } from './readGate.ts';

const read = (over: Partial<{ loading: boolean; empty: boolean; failed: boolean }> = {}) => ({
  loading: false,
  empty: false,
  failed: false,
  ...over
});

describe('gateBranch', () => {
  it('shows the placeholder while the first read is out', () => {
    expect(gateBranch(read({ loading: true, empty: true }), false)).toBe('loading');
  });

  it('shows the rows once there are rows', () => {
    expect(gateBranch(read(), false)).toBe('rows');
  });

  it('shows the empty state when the read answered with nothing', () => {
    expect(gateBranch(read({ empty: true }), false)).toBe('empty');
  });

  it('keeps showing rows through a re-run, placeholder or not', () => {
    expect(gateBranch(read({ loading: false }), false)).toBe('rows');
  });

  it('renders a failed read as the empty state when the screen has no words for it', () => {
    expect(gateBranch(read({ empty: true, failed: true }), false)).toBe('empty');
  });

  it('says the read failed where the screen asked to say so', () => {
    expect(gateBranch(read({ empty: true, failed: true }), true)).toBe('failed');
  });

  it('does not say a read failed while it still has rows to show', () => {
    expect(gateBranch(read({ failed: true }), true)).toBe('rows');
  });

  it('does not say a read failed while a later run is still out', () => {
    expect(gateBranch(read({ loading: true, empty: true, failed: true }), true)).toBe('loading');
  });
});
