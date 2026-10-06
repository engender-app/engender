import { test } from 'vitest';
import assert from 'node:assert/strict';
import { firstResult } from './firstResult';

test('failed reads never consume the first successful result, including undefined', () => {
  const filled: (string | undefined)[] = [];
  const fill = firstResult<string>((value) => filled.push(value));
  fill({ value: undefined, loading: true, failed: false });
  fill({ value: undefined, loading: false, failed: true });
  fill({ value: undefined, loading: false, failed: true });
  assert.deepEqual(filled, []);
  fill({ value: undefined, loading: false, failed: false });
  fill({ value: 'later', loading: false, failed: false });
  assert.deepEqual(filled, [undefined]);
});
