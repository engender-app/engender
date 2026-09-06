import { describe, expect, it } from 'vitest';

import { nextRadioIndex } from './rovingRadioIndex';

describe('nextRadioIndex', () => {
  it('moves right on ArrowRight and ArrowDown', () => {
    expect(nextRadioIndex('ArrowRight', 1, 5)).toBe(2);
    expect(nextRadioIndex('ArrowDown', 1, 5)).toBe(2);
  });

  it('moves left on ArrowLeft and ArrowUp', () => {
    expect(nextRadioIndex('ArrowLeft', 2, 5)).toBe(1);
    expect(nextRadioIndex('ArrowUp', 2, 5)).toBe(1);
  });

  it('wraps past the last option back to the first', () => {
    expect(nextRadioIndex('ArrowRight', 4, 5)).toBe(0);
  });

  it('wraps past the first option back to the last', () => {
    expect(nextRadioIndex('ArrowLeft', 0, 5)).toBe(4);
  });

  it('wraps a single-option group to itself', () => {
    expect(nextRadioIndex('ArrowRight', 0, 1)).toBe(0);
    expect(nextRadioIndex('ArrowLeft', 0, 1)).toBe(0);
  });

  it('ignores every other key', () => {
    expect(nextRadioIndex('Enter', 1, 5)).toBeNull();
    expect(nextRadioIndex(' ', 1, 5)).toBeNull();
    expect(nextRadioIndex('Tab', 1, 5)).toBeNull();
  });
});
