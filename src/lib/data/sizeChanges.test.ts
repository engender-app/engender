import { test } from 'vitest';
import assert from 'node:assert/strict';
import { sizeChanges } from './sizeChanges.ts';
import type { SizeRecord } from './types.ts';

let n = 0;
const rec = (category: string, brand: string, size: string, epochDay: number): SizeRecord => ({
  id: `r${n++}`,
  epochDay,
  category,
  brand,
  size,
  fitNote: ''
});

test('a category and brand worn in two sizes reports the change with both dates', () => {
  const changes = sizeChanges([
    rec('skirts', 'Uniqlo', 'L', 20400),
    rec('skirts', 'Uniqlo', 'M', 20640)
  ]);

  assert.deepEqual(changes, [
    {
      category: 'skirts',
      brand: 'Uniqlo',
      from: { size: 'L', epochDay: 20400 },
      to: { size: 'M', epochDay: 20640 }
    }
  ]);
});

test('one size however many times it was logged is not a change', () => {
  const changes = sizeChanges([
    rec('skirts', 'Uniqlo', 'L', 20400),
    rec('skirts', 'Uniqlo', 'L', 20500),
    rec('skirts', 'Uniqlo', 'L', 20600)
  ]);

  assert.deepEqual(changes, []);
});

test('the dates are the last day of the old size and the first day of the new one', () => {
  const changes = sizeChanges([
    rec('skirts', 'Uniqlo', 'L', 20400),
    rec('skirts', 'Uniqlo', 'L', 20440),
    rec('skirts', 'Uniqlo', 'M', 20640),
    rec('skirts', 'Uniqlo', 'M', 20700)
  ]);

  assert.deepEqual(changes[0].from, { size: 'L', epochDay: 20440 });
  assert.deepEqual(changes[0].to, { size: 'M', epochDay: 20640 });
});

test('only the last two sizes are reported, however many came before', () => {
  const changes = sizeChanges([
    rec('skirts', 'Uniqlo', 'XL', 20200),
    rec('skirts', 'Uniqlo', 'L', 20400),
    rec('skirts', 'Uniqlo', 'M', 20640)
  ]);

  assert.equal(changes.length, 1);
  assert.deepEqual(changes[0].from, { size: 'L', epochDay: 20400 });
  assert.deepEqual(changes[0].to, { size: 'M', epochDay: 20640 });
});

test('a size returned to is the change, so the line can report going back up', () => {
  const changes = sizeChanges([
    rec('skirts', 'Uniqlo', 'L', 20200),
    rec('skirts', 'Uniqlo', 'M', 20400),
    rec('skirts', 'Uniqlo', 'L', 20640)
  ]);

  assert.deepEqual(changes[0].from, { size: 'M', epochDay: 20400 });
  assert.deepEqual(changes[0].to, { size: 'L', epochDay: 20640 });
});

test('a line never crosses two brands: a letter at one label is not a letter at another', () => {
  const changes = sizeChanges([
    rec('pants', 'Levi', 'L', 20400),
    rec('pants', 'H&M', 'M', 20640)
  ]);

  assert.deepEqual(changes, []);
});

test('a brand with no change of its own draws nothing while its neighbour does', () => {
  const changes = sizeChanges([
    rec('pants', 'Levi', 'L', 20400),
    rec('pants', 'Levi', 'M', 20640),
    rec('pants', 'H&M', 'M', 20500)
  ]);

  assert.equal(changes.length, 1);
  assert.equal(changes[0].brand, 'Levi');
});

test('a record with no brand joins no line', () => {
  const changes = sizeChanges([
    rec('skirts', '', 'L', 20400),
    rec('skirts', '', 'M', 20640),
    rec('skirts', '   ', 'S', 20700)
  ]);

  assert.deepEqual(changes, []);
});

test('an unbranded record between two branded ones does not break their run', () => {
  const changes = sizeChanges([
    rec('skirts', 'Uniqlo', 'L', 20400),
    rec('skirts', '', 'S', 20500),
    rec('skirts', 'Uniqlo', 'M', 20640)
  ]);

  assert.deepEqual(changes[0].from, { size: 'L', epochDay: 20400 });
  assert.deepEqual(changes[0].to, { size: 'M', epochDay: 20640 });
});

test('the brand and the size are read trimmed, and reported trimmed', () => {
  const changes = sizeChanges([
    rec('skirts', ' Uniqlo ', ' L ', 20400),
    rec('skirts', 'Uniqlo', 'M', 20640)
  ]);

  assert.equal(changes[0].brand, 'Uniqlo');
  assert.deepEqual(changes[0].from, { size: 'L', epochDay: 20400 });
});

test('records arrive in any order and the run is read by day', () => {
  const changes = sizeChanges([
    rec('skirts', 'Uniqlo', 'M', 20640),
    rec('skirts', 'Uniqlo', 'L', 20400)
  ]);

  assert.deepEqual(changes[0].from, { size: 'L', epochDay: 20400 });
  assert.deepEqual(changes[0].to, { size: 'M', epochDay: 20640 });
});

test('two sizes logged on one day keep the order they were written in', () => {
  const changes = sizeChanges([
    rec('skirts', 'Uniqlo', 'L', 20400),
    rec('skirts', 'Uniqlo', 'M', 20400)
  ]);

  assert.deepEqual(changes[0].from, { size: 'L', epochDay: 20400 });
  assert.deepEqual(changes[0].to, { size: 'M', epochDay: 20400 });
});

test('lines run in the catalogue order of their categories, then by brand', () => {
  const changes = sizeChanges([
    rec('skirts', 'Uniqlo', 'L', 20400),
    rec('skirts', 'Uniqlo', 'M', 20640),
    rec('shirts', 'Zara', 'L', 20400),
    rec('shirts', 'Zara', 'M', 20640),
    rec('shirts', 'Arket', 'L', 20400),
    rec('shirts', 'Arket', 'M', 20640)
  ]);

  assert.deepEqual(
    changes.map((c) => [c.category, c.brand]),
    [
      ['shirts', 'Arket'],
      ['shirts', 'Zara'],
      ['skirts', 'Uniqlo']
    ]
  );
});

test('a category outside the catalogue still draws its line, after the ones in it', () => {
  const changes = sizeChanges([
    rec('hats', 'Uniqlo', 'L', 20400),
    rec('hats', 'Uniqlo', 'M', 20640),
    rec('shoes', 'Uniqlo', '39', 20400),
    rec('shoes', 'Uniqlo', '40', 20640)
  ]);

  assert.deepEqual(
    changes.map((c) => c.category),
    ['shoes', 'hats']
  );
});

test('nothing logged is no lines', () => {
  assert.deepEqual(sizeChanges([]), []);
});
