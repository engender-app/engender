/* The bundled directory is the one place in this app where being out of date is a safety
   problem rather than a cosmetic one: a crisis line that moved number reads as help and
   gives none. So the invariants here are about what makes an entry usable at all -
   something to dial or open, a key that can carry its wording, and a review date that says
   when a person last checked.

   Node tier, so this imports directory.ts and never labels.ts. */

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

test('every number dials from a Polish phone as written', () => {
  // Mindline Trans+ publishes its number nationally, as 0300, which does not
  // ring from a Polish phone, and this app is used from one. Polish 116 short
  // codes and 800 freephone numbers are the other way round: they exist only
  // inside the Polish network and are published without +48.
  const polishNational = /^(116 \d{3}|800 \d{2} \d{4})$/;
  const local = RESOURCES.filter(
    (r) => r.phone && !r.phone.startsWith('+') && !(r.region === 'pl' && polishNational.test(r.phone))
  );

  expect(local.map((r) => r.key)).toEqual([]);
});

test('an adult in Poland has a free line that answers at night and at weekends', () => {
  // Lambda answers on weekday evenings only. 116 123 and 800 70 2222 answer
  // at any hour; 116 111 does too, but only for under-18s.
  const polishLines = resourcesFor('pl').flatMap((r) => (r.kind === 'helpline' && r.phone ? [r.phone] : []));

  expect(polishLines).toEqual(expect.arrayContaining(['116 123', '800 70 2222']));
});

test('the UK and US group holds no line for under-25s only', () => {
  // The Trevor Project serves under-25s in the US. The person holding this
  // phone is in Poland, and under-25s only is not who the group is for.
  expect(RESOURCES.map((r) => r.key)).not.toContain('int-trevor');
});

test('no url points at a domain known to be parked, lapsed or broken', () => {
  // Each looks like the obvious address and is not: transfuzja.pl and
  // 116123.pl are for sale, mindlinetrans.org.uk serves casino spam, and
  // 116123.edu.pl shows a certificate for another host and stale hours.
  const known = ['transfuzja.pl', '116123.pl', '116123.edu.pl', 'mindlinetrans.org.uk'];
  const bad = RESOURCES.filter((r) => r.url && known.includes(new URL(r.url).host.replace(/^www\./, '')));

  expect(bad.map((r) => r.key)).toEqual([]);
});

test('every url is https, so nothing sends a person to a plaintext page', () => {
  const insecure = RESOURCES.filter((r) => r.url && !r.url.startsWith('https://'));

  expect(insecure.map((r) => r.key)).toEqual([]);
});

test('both regions carry a helpline, since neither audience is served by the other', () => {
  const helplines = (region: 'pl' | 'int') => resourcesFor(region).filter((r) => r.kind === 'helpline');

  expect(helplines('pl').length).toBeGreaterThan(0);
  expect(helplines('int').length).toBeGreaterThan(0);
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
