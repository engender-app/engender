import { test } from 'vitest';
import assert from 'node:assert/strict';
import { createModelMemo } from './curveModelMemo.ts';

test('the same key and the same inputs reuse the cached result without calling compute again', () => {
  const memo = createModelMemo<number>();
  let calls = 0;
  const compute = () => {
    calls += 1;
    return 42;
  };

  const first = memo.remember('180', [1, 2, 3], compute);
  const second = memo.remember('180', [1, 2, 3], compute);

  assert.equal(first, 42);
  assert.equal(second, 42);
  assert.equal(calls, 1);
});

test('the same key with different inputs recomputes', () => {
  const memo = createModelMemo<number>();
  let calls = 0;
  const compute = () => ++calls;

  memo.remember('180', [1, 2, 3], compute);
  const second = memo.remember('180', [1, 2, 4], compute);

  assert.equal(second, 2);
  assert.equal(calls, 2);
});

test('different keys never share a cache slot, even with identical inputs', () => {
  const memo = createModelMemo<number>();
  let calls = 0;
  const compute = () => ++calls;

  memo.remember('180', [1, 2, 3], compute);
  memo.remember('30', [1, 2, 3], compute);

  assert.equal(calls, 2);
});

test('returning to a key already computed reuses it, even after a different key was computed in between', () => {
  const memo = createModelMemo<number>();
  let calls = 0;
  const compute = () => ++calls;

  memo.remember('180', [1], compute);
  memo.remember('30', [1], compute);
  memo.remember('180', [1], compute);

  assert.equal(calls, 2, 'the 180 slot was still there to reuse');
});

test('a field nested inside the inputs is part of the comparison, not just the top level', () => {
  const memo = createModelMemo<number>();
  let calls = 0;
  const compute = () => ++calls;

  memo.remember('180', [{ id: 'a', dose: 5 }], compute);
  memo.remember('180', [{ id: 'a', dose: 6 }], compute);

  assert.equal(calls, 2, 'a changed field inside an unchanged-length array must not be missed');
});
