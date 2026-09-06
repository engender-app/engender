/* The one API pdf.js needs that the WebView floor does not have (phase 8
   features ticket 55).

   Run against a realm with `.at` taken away, which is the only way to
   watch the polyfill work: on the machine running this it is native on all
   three prototypes, so an import that did nothing would pass every
   assertion below. The removal happens before the import, since that is
   when the module decides. */

import assert from 'node:assert/strict';
import { afterAll, test } from 'vitest';

const nativeAt = { array: Array.prototype.at, string: String.prototype.at };
const typedArray = Object.getPrototypeOf(Uint8Array.prototype) as { at?: unknown };
const nativeTypedAt = typedArray.at;

delete (Array.prototype as { at?: unknown }).at;
delete (String.prototype as { at?: unknown }).at;
delete typedArray.at;

await import('./pdf-floor.ts');

afterAll(() => {
  Object.defineProperty(Array.prototype, 'at', { value: nativeAt.array, writable: true, configurable: true });
  Object.defineProperty(String.prototype, 'at', { value: nativeAt.string, writable: true, configurable: true });
  Object.defineProperty(typedArray, 'at', { value: nativeTypedAt, writable: true, configurable: true });
});

test('an array reads from the end, which is what pdf.js asks for', () => {
  assert.equal([1, 2, 3].at(-1), 3);
  assert.equal([1, 2, 3].at(0), 1);
  assert.equal([1, 2, 3].at(-4), undefined);
  assert.equal([1, 2, 3].at(3), undefined);
  assert.equal(([] as number[]).at(-1), undefined);
});

test('bytes and strings get it too, because they lost it in the same browser version', () => {
  assert.equal(new Uint8Array([7, 8, 9]).at(-2), 8);
  assert.equal('paper'.at(-1), 'r');
});

test('it stays out of a for...in, the way the native one does', () => {
  const keys: string[] = [];
  for (const key in [1, 2]) keys.push(key);
  assert.deepEqual(keys, ['0', '1']);
});
