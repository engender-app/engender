/* Ticket 10's acceptance, most of it in one loop: kill the conversion at
   every point where it has left something on disk, and prove the app is
   either able to finish or still holding the Journal it started with.

   The kill is a throw nobody catches, from inside the port that just made
   something durable - a killed process runs no cleanup, so the test may not
   either. A restart is the same flow run again over the same files. What
   the world underneath is made of, and what it fakes, is in
   test-support/fake-world.ts. */

import { test, describe, expect } from 'vitest';
import {
  ConversionVerificationError,
  describeJournalState,
  finishRetirement,
  prepareConversion,
  runConversion,
  spaceRequiredFor,
  type ConversionPorts,
  type ConversionRefusal,
  type JournalState
} from './conversion.ts';
import { fakeWorld, KILL_POINTS, ProcessKilled, type FakeWorld, type KillPoint } from './test-support/fake-world.ts';
import { migrations } from '../sqlite/migrations.ts';

const KNOWN_SCHEMA = migrations[migrations.length - 1].version;

const NOTES = ['woke up early', 'zażółć gęślą jaźń', 'first appointment'];
const PHOTOS = ['aaa.jpg', 'bbb.jpg', 'ccc.jpg', 'ddd.jpg'];

type Attempt = { ok: true; state: JournalState } | { ok: false; refusal: ConversionRefusal };

/** One boot, in the order the app boots in: survey, finish a retirement
    that needs no key, convert what needs converting, and only then say
    where the app ended up. stores/boot.svelte.ts composes these same four
    calls in this same order. */
async function attempt(world: FakeWorld, kill: KillPoint | null = null): Promise<Attempt> {
  world.killAt(kill);
  let state = describeJournalState(await world.survey());

  if (state === 'retire') {
    await finishRetirement(world.ports.marker, world.ports.removePlaintextRemnants);
    state = describeJournalState(await world.survey());
  }

  if (state === 'convert') {
    const precheck = await prepareConversion(world.ports, KNOWN_SCHEMA);
    if (!precheck.ok) return { ok: false, refusal: precheck };
    // The passphrase step: the keystore has to land after the marker, never
    // before it.
    world.writeKeystore();
    await runConversion(world.ports);
    state = describeJournalState(await world.survey());
  }

  return { ok: true, state };
}

/** The acceptance's last line, asked of whatever is on disk right now: if
    the app would go on to open the encrypted Journal, that Journal holds
    every Entry; if it would not, the Journal it came from still does. There
    is no third answer, and no state in between. */
async function expectNoMixedState(world: FakeWorld): Promise<JournalState> {
  const state = describeJournalState(await world.survey());
  if (state === 'convert') expect(world.sourceNotes()).toEqual(NOTES);
  else expect(world.encryptedNotes()).toEqual(NOTES);
  return state;
}

/** Everything a finished conversion owes: the Journal moved across whole,
    every photo reads back byte for byte, and nothing plaintext is left. */
async function expectConverted(world: FakeWorld): Promise<void> {
  expect(world.encryptedNotes()).toEqual(NOTES);
  expect(world.sourceNotes()).toBeNull();
  expect(world.rootFiles()).toEqual(['encrypted-journal.sqlite3']);
  expect((await world.survey()).marker).toBeNull();
  expect(describeJournalState(await world.survey())).toBe('unlock');

  const { plaintext, ciphertext } = await world.photos();
  expect(plaintext).toEqual([]);
  expect(ciphertext).toEqual(PHOTOS);
  for (const name of PHOTOS) {
    expect(await world.readPhoto(name)).toEqual(world.seededPhoto(name));
  }
}

describe('what a boot finds', () => {
  const survey = (
    keystoreExists: boolean,
    plaintextJournalPresent: boolean,
    marker: Parameters<typeof describeJournalState>[0]['marker'] = null
  ) => describeJournalState({ keystoreExists, plaintextJournalPresent, marker });

  test('no journal of either kind is a first run', () => {
    expect(survey(false, false)).toBe('first-run');
  });

  test('an encrypted journal on its own just needs unlocking', () => {
    expect(survey(true, false)).toBe('unlock');
  });

  test('a plaintext journal with no keystore is the conversion this ticket exists for', () => {
    expect(survey(false, true)).toBe('convert');
  });

  test('a marker short of retirement means an interrupted conversion, keystore or not', () => {
    expect(survey(false, true, 'preparing')).toBe('convert');
    expect(survey(true, true, 'preparing')).toBe('convert');
    expect(survey(true, true, 'database')).toBe('convert');
    expect(survey(true, true, 'photos')).toBe('convert');
  });

  test('a retire marker means converted, with plaintext still to delete', () => {
    expect(survey(true, true, 'retire')).toBe('retire');
    expect(survey(true, false, 'retire')).toBe('retire');
  });

  test('an encrypted journal beside a plaintext one, with no marker, retires the plaintext', () => {
    // Nothing here produces that state; the answer it gets is still not a
    // guess (see describeJournalState).
    expect(survey(true, true)).toBe('retire');
  });
});

describe('before anything is written', () => {
  test('refuses when there is not enough room for a second copy, and says how much', async () => {
    const world = await fakeWorld({ notes: NOTES, photoNames: PHOTOS });
    try {
      world.setFreeBytes(1024);
      const result = await attempt(world);

      expect(result).toEqual({
        ok: false,
        refusal: expect.objectContaining({ reason: 'not-enough-space', freeBytes: 1024 })
      });
      // A refusal is not a conversion: nothing was written, not even the
      // marker that would make the next boot think one had started.
      expect((await world.survey()).marker).toBeNull();
      expect((await world.survey()).keystoreExists).toBe(false);
      expect(world.sourceNotes()).toEqual(NOTES);
    } finally {
      world.dispose();
    }
  });

  test('needs room for the copy and the journal that encrypts it, plus a floor', () => {
    expect(spaceRequiredFor(0)).toBe(4 * 1024 * 1024);
    expect(spaceRequiredFor(10 * 1024 * 1024)).toBe(29 * 1024 * 1024);
  });

  test('a platform that will not say how much room there is does not block the conversion', async () => {
    const world = await fakeWorld({ notes: NOTES, photoNames: PHOTOS });
    try {
      world.setFreeBytes(null);
      expect(await attempt(world)).toEqual({ ok: true, state: 'unlock' });
      await expectConverted(world);
    } finally {
      world.dispose();
    }
  });

  test('refuses a schema this build does not know, rather than converting a journal it cannot open', async () => {
    const world = await fakeWorld({ notes: NOTES, photoNames: PHOTOS });
    try {
      const fromTheFuture: ConversionPorts = {
        ...world.ports,
        inspectSource: async () => ({ sizeBytes: 4096, schemaVersion: KNOWN_SCHEMA + 1 })
      };
      const precheck = await prepareConversion(fromTheFuture, KNOWN_SCHEMA);

      expect(precheck).toEqual({
        ok: false,
        reason: 'schema-too-new',
        foundVersion: KNOWN_SCHEMA + 1,
        knownVersion: KNOWN_SCHEMA
      });
      expect((await world.survey()).marker).toBeNull();
      expect(world.sourceNotes()).toEqual(NOTES);
    } finally {
      world.dispose();
    }
  });
});

test('an uninterrupted conversion moves the whole journal and retires the plaintext', async () => {
  const world = await fakeWorld({ notes: NOTES, photoNames: PHOTOS, pinHash: 'a-pin-hash' });
  try {
    expect(await attempt(world)).toEqual({ ok: true, state: 'unlock' });
    await expectConverted(world);
  } finally {
    world.dispose();
  }
});

test('preferences the archive format would not carry travel with the database', async () => {
  // A whole-database copy is what makes this true: an export/import would
  // leave the pref table alone by design (restore.ts, ADR-0003), taking the
  // PIN, the app-lock flags and the disguise settings with it.
  const world = await fakeWorld({ notes: NOTES, photoNames: PHOTOS, pinHash: 'a-pin-hash' });
  try {
    await attempt(world);
    expect(world.encryptedPref('pinHash')).toBe(JSON.stringify('a-pin-hash'));
  } finally {
    world.dispose();
  }
});

describe('killed at every durable stage', () => {
  for (const point of KILL_POINTS) {
    test(`killed at ${point}: the app resumes, and never reports a half-converted journal`, async () => {
      const world = await fakeWorld({ notes: NOTES, photoNames: PHOTOS });
      try {
        await expect(attempt(world, point)).rejects.toThrow(ProcessKilled);
        expect(world.reached()).toContain(point);

        // What the next boot would find, before it does anything about it.
        await expectNoMixedState(world);

        // And what it does about it.
        expect(await attempt(world)).toEqual({ ok: true, state: 'unlock' });
        await expectConverted(world);
      } finally {
        world.dispose();
      }
    });
  }

  test('killed twice in the same conversion still finishes', async () => {
    const world = await fakeWorld({ notes: NOTES, photoNames: PHOTOS });
    try {
      await expect(attempt(world, 'copy:partial')).rejects.toThrow(ProcessKilled);
      await expectNoMixedState(world);
      await expect(attempt(world, 'photo:2')).rejects.toThrow(ProcessKilled);
      await expectNoMixedState(world);

      expect(await attempt(world)).toEqual({ ok: true, state: 'unlock' });
      await expectConverted(world);
    } finally {
      world.dispose();
    }
  });
});

describe('what each kill leaves behind', () => {
  test('killed before the copy is verified, the plaintext journal is untouched', async () => {
    for (const point of ['marker:preparing', 'keystore', 'marker:database', 'copy:partial', 'copy:complete'] as const) {
      const world = await fakeWorld({ notes: NOTES, photoNames: PHOTOS });
      try {
        await expect(attempt(world, point)).rejects.toThrow(ProcessKilled);

        expect(world.sourceNotes()).toEqual(NOTES);
        expect((await world.photos()).ciphertext).toEqual([]);
        expect(world.rootFiles()).toContain('gender-diary.sqlite3');
      } finally {
        world.dispose();
      }
    }
  });

  test('killed part way through the photos, the ones already done are not encrypted twice', async () => {
    const world = await fakeWorld({ notes: NOTES, photoNames: PHOTOS });
    try {
      await expect(attempt(world, 'photo:2')).rejects.toThrow(ProcessKilled);
      const midway = await world.photos();
      expect(midway.ciphertext).toEqual(['aaa.jpg', 'bbb.jpg']);
      expect(midway.plaintext).toEqual(['ccc.jpg', 'ddd.jpg']);

      await attempt(world);
      // Encrypting an already-encrypted file would read back as ciphertext
      // rather than as the photo, so this is the assertion that catches it.
      for (const name of PHOTOS) expect(await world.readPhoto(name)).toEqual(world.seededPhoto(name));
    } finally {
      world.dispose();
    }
  });

  test('a partial copy is never counted, verified or opened - it is written again', async () => {
    const world = await fakeWorld({ notes: NOTES, photoNames: PHOTOS });
    try {
      await expect(attempt(world, 'copy:partial')).rejects.toThrow(ProcessKilled);
      // Half a database file is on disk and reads as nothing.
      expect(world.encryptedNotes()).toBeNull();
      expect(describeJournalState(await world.survey())).toBe('convert');

      await attempt(world);
      expect(world.encryptedNotes()).toEqual(NOTES);
    } finally {
      world.dispose();
    }
  });
});

test('a copy that comes back short is refused, and the plaintext journal survives it', async () => {
  const world = await fakeWorld({ notes: NOTES, photoNames: PHOTOS });
  try {
    await prepareConversion(world.ports, KNOWN_SCHEMA);
    const lying: ConversionPorts = {
      ...world.ports,
      censusOfEncryptedCopy: async () => ({ ...(await world.ports.censusOfEncryptedCopy()), entry: 1 })
    };

    await expect(runConversion(lying)).rejects.toThrow(ConversionVerificationError);

    // Not reported as success, and nothing destroyed: the marker is still
    // short of the point of no return and the source is whole.
    expect((await world.survey()).marker).toBe('database');
    expect(world.sourceNotes()).toEqual(NOTES);
    expect((await world.photos()).ciphertext).toEqual([]);

    // And the next attempt, against a copy that does match, goes through.
    expect(await attempt(world)).toEqual({ ok: true, state: 'unlock' });
    await expectConverted(world);
  } finally {
    world.dispose();
  }
});
