import { beforeEach, expect, test, vi } from 'vitest';

const { getContext } = vi.hoisted(() => ({ getContext: vi.fn() }));
vi.mock('svelte', () => ({ getContext, setContext: vi.fn() }));
import { useDoorActivity } from './doorActivity.svelte';

beforeEach(() => { getContext.mockReset(); });

test('queries in standalone effect roots have no hidden door', () => {
  getContext.mockImplementation(() => { throw new Error('lifecycle_outside_component'); });
  expect(useDoorActivity()()).toBe(true);
});

test('component reads without a retained door remain active', () => {
  expect(useDoorActivity()()).toBe(true);
});

test('retained queries keep the owning door activity getter', () => {
  const active = () => false;
  getContext.mockReturnValue(active);
  expect(useDoorActivity()).toBe(active);
});

test('unrelated context errors are not hidden', () => {
  const failure = new Error('unexpected context failure');
  getContext.mockImplementation(() => { throw failure; });
  expect(useDoorActivity).toThrow(failure);
});
