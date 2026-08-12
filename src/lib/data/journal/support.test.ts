/* The uuid fallback (ticket 11).

   Found on a device, not by reading: the API 26 emulator's WebView is
   Chrome 69, and crypto.randomUUID arrived in Chrome 92. Every journal write
   mints an id (ADR-0002), so on a WebView older than that the app could not
   write a single row - it threw "crypto.randomUUID is not a function" from
   the first save. The Android tier's contract run is what surfaced it.

   crypto.getRandomValues has been there since long before either, so the
   fallback costs a few lines and removes the whole class of failure. */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { mintUuid, uuidFromRandomBytes } from './support.ts';
import { UUID_PATTERN } from './test-support.ts';

test('the fallback mints a well-formed v4 uuid', () => {
  for (let i = 0; i < 200; i++) {
    const uuid = uuidFromRandomBytes();
    assert.match(uuid, UUID_PATTERN, uuid);
    // Version 4 and RFC 4122 variant, which the pattern alone does not pin.
    assert.equal(uuid[14], '4', `version nibble in ${uuid}`);
    assert.ok('89ab'.includes(uuid[19]), `variant nibble in ${uuid}`);
  }
});

test('the fallback does not repeat itself', () => {
  const minted = new Set(Array.from({ length: 1000 }, uuidFromRandomBytes));
  assert.equal(minted.size, 1000);
});

test('mintUuid falls back when the platform has no randomUUID', () => {
  const original = crypto.randomUUID;
  try {
    // A WebView older than Chrome 92, which is what API 26 ships.
    Reflect.deleteProperty(crypto, 'randomUUID');
    assert.match(mintUuid(), UUID_PATTERN);
  } finally {
    Object.defineProperty(crypto, 'randomUUID', { value: original, configurable: true, writable: true });
  }
});

test('mintUuid uses the platform implementation when there is one', () => {
  assert.match(mintUuid(), UUID_PATTERN);
});
