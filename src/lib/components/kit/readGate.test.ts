import { describe, expect, it } from 'vitest';
import { gateBranch } from './readGate.ts';

const read = (over = {}) => ({
  loading: false, empty: false, failed: false, stale: false, ...over
});

describe('gateBranch', () => {
  it('shows loading before the first result', () => {
    expect(gateBranch(read({ loading: true }))).toBe('loading');
  });
  it('shows successful rows', () => {
    expect(gateBranch(read())).toBe('rows');
  });
  it('shows the domain empty state only on success', () => {
    expect(gateBranch(read({ empty: true }))).toBe('empty');
  });
  it('shows initial failure without an opt-in snippet', () => {
    expect(gateBranch(read({ failed: true }))).toBe('failed');
  });
  it('keeps a stale result separate from initial failure', () => {
    expect(gateBranch(read({ failed: true, stale: true }))).toBe('stale');
  });
});
