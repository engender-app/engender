/* The bundled directory is the one place in this app where being out of date
   is a safety problem rather than a cosmetic one: a crisis line that moved
   number reads as help and gives none. So the invariants here are about what
   makes an entry usable at all - something to dial or open, a key that can
   carry its wording, and a review date that says when a person last checked.

   Node tier, so this imports directory.ts and never labels.ts (ADR-0016). */

import { test, expect } from 'vitest';
import { RESOURCES, RESOURCES_REVIEWED_ON, resourcesFor } from './directory.ts';

test('every entry carries a unique key', () => {
  const keys = RESOURCES.map((r) => r.key);

  expect(new Set(keys).size).toBe(keys.length);
});

test('every entry offers something to act on - a number to dial or a page to open', () => {
  const inert = RESOURCES.filter((r) => !r.phone && !r.url);

  expect(inert.map((r) => r.key)).toEqual([]);
});

test('every phone number is dialable as written', () => {
  // What a tel: URI may hold, minus the separators a person types.
  const dialable = /^\+?[0-9][0-9 ]*$/;
  const undialable = RESOURCES.filter((r) => r.phone && !dialable.test(r.phone));

  expect(undialable.map((r) => r.key)).toEqual([]);
});

test('every number carries its country code, so it dials from anywhere', () => {
  // Trevor and Mindline Trans+ publish theirs nationally, as 1-866 and 0300.
  // Neither rings from a Polish phone that way, and this app is used from one.
  const local = RESOURCES.filter((r) => r.phone && !r.phone.startsWith('+'));

  expect(local.map((r) => r.key)).toEqual([]);
});

test('every url is https, so nothing sends a person to a plaintext page', () => {
  const insecure = RESOURCES.filter((r) => r.url && !r.url.startsWith('https://'));

  expect(insecure.map((r) => r.key)).toEqual([]);
});

test('both regions carry a helpline, since neither audience is served by the other', () => {
  expect(resourcesFor('pl', 'helpline').length).toBeGreaterThan(0);
  expect(resourcesFor('int', 'helpline').length).toBeGreaterThan(0);
});

test('every helpline has a number to ring, and nothing else claims to be one', () => {
  const silent = RESOURCES.filter((r) => r.kind === 'helpline' && !r.phone);

  expect(silent.map((r) => r.key)).toEqual([]);
});

test('the review date is a plain ISO day', () => {
  expect(RESOURCES_REVIEWED_ON).toMatch(/^\d{4}-\d{2}-\d{2}$/);
});

test('helplines come first within a region, because that is the order distress reads in', () => {
  const order = { helpline: 0, support: 1, info: 2 };
  for (const region of ['pl', 'int'] as const) {
    const ranks = RESOURCES.filter((r) => r.region === region).map((r) => order[r.kind]);

    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  }
});
