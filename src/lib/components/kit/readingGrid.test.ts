import { describe, expect, it } from 'vitest';
import { cellPlaces } from './readingGrid';

describe('cellPlaces', () => {
  it('lays live cells out two to a row, the first row unruled', () => {
    expect(cellPlaces(5, 2)).toEqual([
      { col: 0, below: false },
      { col: 1, below: false },
      { col: 0, below: true },
      { col: 1, below: true },
      { col: 0, below: true }
    ]);
  });

  it('puts every cell in the one column when the grid stacks', () => {
    expect(cellPlaces(3, 1)).toEqual([
      { col: 0, below: false },
      { col: 0, below: true },
      { col: 0, below: true }
    ]);
  });

  it('treats a grid with no columns yet as one column', () => {
    expect(cellPlaces(2, 0).map((place) => place.col)).toEqual([0, 0]);
  });
});
