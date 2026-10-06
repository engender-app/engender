import { expect, test } from 'vitest';
import {
  Fts5UnavailableError,
  InterruptedRestoreError,
  JournalBelowBaselineError,
  SchemaTooNewError
} from '../data/sqlite/migration-runner.ts';
import { interpretAuthentication } from '../lock/biometric-outcome.ts';
import {
  initialBoot,
  reduce,
  deviceBoundSetupOutcome,
  type BootEffect,
  type BootEvent,
  type BootMachine
} from './boot-machine.ts';

const KEY = new Uint8Array(32) as Uint8Array<ArrayBuffer>;

/** Folds a run of events, keeping the effects the last one asked for - the
    shape every path below asserts on: where the sequence got to, and what it
    told the adapter to do next. */
function walk(...events: BootEvent[]): { machine: BootMachine; effects: BootEffect[] } {
  let machine = initialBoot();
  let effects: BootEffect[] = [];
  for (const event of events) {
    const step = reduce(machine, event);
    machine = step.machine;
    effects = step.effects;
  }
  return { machine, effects };
}

const started = (platform: 'web' | 'android', demo = false): BootEvent => ({
  type: 'started',
  platform,
  demo
});

function surveyedWeb(survey: Partial<Extract<BootEvent, { type: 'web-surveyed' }>> = {}): BootEvent {
  return {
    type: 'web-surveyed',
    keystoreSecretSource: null,
    deviceBoundKeystoreExists: false,
    legacyStoragePresent: false,
    ...survey
  };
}

function surveyedAndroid(
  survey: Partial<Extract<BootEvent, { type: 'android-surveyed' }>> = {}
): BootEvent {
  return {
    type: 'android-surveyed',
    keystoreSecretSource: null,
    nativeDeviceKeyExists: false,
    plaintextJournalPresent: false,
    ...survey
  };
}

test('a start asks for the cached preferences and then surveys its own platform', () => {
  expect(walk(started('web')).effects).toEqual([
    { type: 'apply-cached-preferences' },
    { type: 'survey-web' }
  ]);
  expect(walk(started('android')).effects).toEqual([
    { type: 'apply-cached-preferences' },
    { type: 'survey-android' }
  ]);
});

test('a web first run reaches the setup gate with no access mode yet', () => {
  const { machine, effects } = walk(started('web'), surveyedWeb());

  expect(machine.boot.status).toBe('needs-setup');
  expect(machine.boot.accessMode).toBeNull();
  expect(effects).toEqual([]);
});

test('a web journal with a passphrase keystore reaches the unlock gate', () => {
  const { machine, effects } = walk(
    started('web'),
    surveyedWeb({ keystoreSecretSource: 'passphrase' })
  );

  expect(machine.boot.status).toBe('needs-unlock');
  expect(machine.boot.accessMode).toBe('passphrase');
  expect(effects).toEqual([]);
});

test('a web journal held only by a device-bound key unlocks itself', () => {
  const { machine, effects } = walk(
    started('web'),
    surveyedWeb({ deviceBoundKeystoreExists: true })
  );

  expect(machine.boot.status).toBe('booting');
  expect(machine.boot.accessMode).toBe('device-bound');
  expect(effects).toEqual([{ type: 'auto-unlock-device-bound' }]);
});

test('a device-bound key the browser will not hand over reaches the recovery gate', () => {
  const { machine } = walk(
    started('web'),
    surveyedWeb({ deviceBoundKeystoreExists: true }),
    { type: 'device-key-unavailable' }
  );

  expect(machine.boot.status).toBe('needs-device-recovery');
});

test('a demo build unlocks itself, and falls back to the gate when the passphrase changed', () => {
  const unlocking = walk(started('web', true), surveyedWeb({ keystoreSecretSource: 'passphrase' }));
  expect(unlocking.effects).toEqual([{ type: 'demo-unlock' }]);

  const fallen = walk(started('web', true), surveyedWeb({ keystoreSecretSource: 'passphrase' }), {
    type: 'demo-unlock-failed'
  });
  expect(fallen.machine.boot.status).toBe('needs-unlock');
});

test('a demo build with nothing on disk sets its own passphrase', () => {
  expect(walk(started('web', true), surveyedWeb()).effects).toEqual([{ type: 'demo-setup' }]);
});

test('android reaches each of its four gates', () => {
  expect(walk(started('android'), surveyedAndroid()).machine.boot.status).toBe('needs-setup');

  expect(
    walk(started('android'), surveyedAndroid({ keystoreSecretSource: 'passphrase' })).machine.boot
  ).toMatchObject({ status: 'needs-unlock', accessMode: 'passphrase' });

  expect(
    walk(started('android'), surveyedAndroid({ nativeDeviceKeyExists: true })).machine.boot
  ).toMatchObject({ status: 'needs-authentication', accessMode: 'device-bound' });

  const plaintext = walk(started('android'), surveyedAndroid({ plaintextJournalPresent: true }));
  expect(plaintext.machine.boot).toMatchObject({
    status: 'error',
    failure: 'android-plaintext'
  });
});

test('android reaches auto-unlock when native device key requires no auth', () => {
  const { machine, effects } = walk(
    started('android'),
    surveyedAndroid({ nativeDeviceKeyExists: true, nativeDeviceKeyAuthRequired: false })
  );
  expect(machine.boot.status).toBe('booting');
  expect(machine.boot.accessMode).toBe('unlocked');
  expect(effects).toEqual([{ type: 'auto-unlock-android' }]);
});

test('a refused android key leaves the gate the refusal to render', () => {
  const refusal = {
    kind: 'refused' as const,
    authentication: interpretAuthentication('lockedOut')
  };
  const { machine } = walk(
    started('android'),
    surveyedAndroid({ nativeDeviceKeyExists: true }),
    { type: 'android-key-answered', result: refusal }
  );

  expect(machine.boot.status).toBe('needs-authentication');
  expect(machine.boot.androidKey).toEqual(refusal);

  const invalidated = walk(
    started('android'),
    surveyedAndroid({ nativeDeviceKeyExists: true }),
    { type: 'android-key-answered', result: { kind: 'invalidated' } }
  );
  expect(invalidated.machine.boot.androidKey).toEqual({ kind: 'invalidated' });
});

test('an android key that is handed over opens the journal and stands the lock down', () => {
  const { machine, effects } = walk(
    started('android'),
    surveyedAndroid({ nativeDeviceKeyExists: true }),
    { type: 'android-key-answered', result: { kind: 'key', dataKey: KEY } }
  );

  expect(machine.boot.status).toBe('booting');
  expect(effects).toEqual([
    { type: 'mark-unlocked' },
    { type: 'open-journal', dataKey: KEY, accessMode: 'device-bound' }
  ]);
});

test('a key nobody authenticated for leaves app lock its own question to ask', () => {
  const { effects } = walk(
    started('web'),
    surveyedWeb({ deviceBoundKeystoreExists: true }),
    { type: 'key-obtained', dataKey: KEY, accessMode: 'device-bound', unlocked: false }
  );

  expect(effects).toEqual([{ type: 'open-journal', dataKey: KEY, accessMode: 'device-bound' }]);
});

test('a key opens the journal straight away', () => {
  const { machine, effects } = walk(
    started('android'),
    surveyedAndroid({ nativeDeviceKeyExists: true }),
    { type: 'key-obtained', dataKey: KEY, accessMode: 'device-bound', unlocked: false }
  );

  expect(machine.boot.status).toBe('booting');
  expect(machine.boot.accessMode).toBe('device-bound');
  expect(effects).toEqual([{ type: 'open-journal', dataKey: KEY, accessMode: 'device-bound' }]);
});

test('an opened journal is ready, and journal-opened alone asks for no warning', () => {
  const quiet = walk(
    started('web'),
    surveyedWeb({ keystoreSecretSource: 'passphrase' }),
    { type: 'key-obtained', dataKey: KEY, accessMode: 'passphrase', unlocked: true },
    { type: 'journal-opened', journal: {} as never }
  );

  expect(quiet.machine.boot.status).toBe('ready');
  expect(quiet.machine.boot.journal).not.toBeNull();
  expect(quiet.machine.boot.persistDenied).toBe(false);
  expect(quiet.effects).toEqual([]);
});

/* ticket 202: the persistence request's answer no longer holds up
   journal-opened, so a refusal arrives as its own event - whenever the
   browser answers - and still reaches the same warning. */
test('a persist-request-denied event, once ready, still warns', () => {
  const denied = walk(
    started('web'),
    surveyedWeb({ keystoreSecretSource: 'passphrase' }),
    { type: 'key-obtained', dataKey: KEY, accessMode: 'passphrase', unlocked: true },
    { type: 'journal-opened', journal: {} as never },
    { type: 'persist-request-denied' }
  );
  expect(denied.machine.boot.persistDenied).toBe(true);
  expect(denied.effects).toEqual([{ type: 'warn-persist-denied' }]);
});

/* The other order: nothing awaits the request any more, so it can answer
   before ready just as easily as after - Chromium in particular denies
   fast enough that this is the common case, not the exotic one. A denial
   seen too early to mark on anything must not be dropped; it has to show
   up once ready is reached. */
test('a persist-request-denied event arriving before ready is not lost - it warns once ready is reached', () => {
  const early = walk(
    started('web'),
    surveyedWeb({ keystoreSecretSource: 'passphrase' }),
    { type: 'key-obtained', dataKey: KEY, accessMode: 'passphrase', unlocked: true },
    { type: 'persist-request-denied' }
  );
  // Not ready yet, so nothing to warn about on the spot.
  expect(early.machine.boot.status).toBe('booting');
  expect(early.effects).toEqual([]);

  const ready = walk(
    started('web'),
    surveyedWeb({ keystoreSecretSource: 'passphrase' }),
    { type: 'key-obtained', dataKey: KEY, accessMode: 'passphrase', unlocked: true },
    { type: 'persist-request-denied' },
    { type: 'journal-opened', journal: {} as never }
  );
  expect(ready.machine.boot.status).toBe('ready');
  expect(ready.machine.boot.persistDenied).toBe(true);
  expect(ready.effects).toEqual([{ type: 'warn-persist-denied' }]);
});

/** The three very different endings that arrive as one failed boot. */
function failedOpen(error: unknown, ...after: BootEvent[]) {
  return walk(
    started('web'),
    surveyedWeb({ keystoreSecretSource: 'passphrase' }),
    { type: 'key-obtained', dataKey: KEY, accessMode: 'passphrase', unlocked: true },
    { type: 'journal-open-failed', error },
    ...after
  );
}

test('a journal a newer build already migrated reaches the rollback screen', () => {
  const { machine, effects } = failedOpen(new SchemaTooNewError(44, 43));

  expect(machine.boot.status).toBe('schema-too-new');
  expect(effects).toEqual([]);
});

test('an interrupted restore finishes itself instead of reaching a screen', () => {
  const { machine, effects } = failedOpen(new InterruptedRestoreError());

  expect(machine.boot.status).toBe('booting');
  expect(effects).toEqual([{ type: 'restore-previous-journal' }]);
});

test('any other failed open asks the disk whether it can offer a way back', () => {
  const failed = failedOpen(new Error('no such table'));

  expect(failed.machine.boot).toMatchObject({
    status: 'error',
    error: 'no such table',
    recoverable: false
  });
  expect(failed.effects).toEqual([{ type: 'check-pre-migration-copy' }]);

  expect(
    failedOpen(new Error('no such table'), { type: 'pre-migration-copy-checked', usable: true })
      .machine.boot.recoverable
  ).toBe(true);

  expect(
    failedOpen(new Error('no such table'), { type: 'pre-migration-copy-checked', usable: false })
      .machine.boot.recoverable
  ).toBe(false);
});

/* After-release ticket 09: the failure screen says what happened in the
   person's words, so the state carries which failure this was and keeps the
   raw text only as the detail a bug report needs. */
test('a journal from below the baseline names itself and asks for no restore', () => {
  const { machine, effects } = failedOpen(new JournalBelowBaselineError(50, 78));

  expect(machine.boot).toMatchObject({ status: 'error', failure: 'below-baseline', recoverable: false });
  expect(machine.boot.error).toContain('50');
  /* Putting the previous journal back would reopen the same old journal, so
     the disk is not even asked whether there is a copy. */
  expect(effects).toEqual([]);
});

test('a below-baseline refusal that arrives as text is still named', () => {
  /* A bridge or a worker hands over the message, not the class. */
  const text = new JournalBelowBaselineError(50, 78).message;
  expect(walk(started('web'), { type: 'boot-failed', message: text }).machine.boot.failure).toBe('below-baseline');
});

test('a key that does not read the file is the unreadable failure, however it arrives', () => {
  expect(failedOpen(new Error('file is not a database (code 26)')).machine.boot.failure).toBe('unreadable');
  expect(
    walk(started('web'), { type: 'boot-failed', message: 'SQLITE_NOTADB: file is not a database' }).machine.boot
      .failure
  ).toBe('unreadable');
});

test('a database that never starts is the engine failure', () => {
  expect(failedOpen(new Fts5UnavailableError(new Error('no such module: fts5'))).machine.boot.failure).toBe(
    'engine'
  );
  expect(
    walk(started('web'), { type: 'boot-failed', message: 'the database worker stopped: no message' }).machine.boot
      .failure
  ).toBe('engine');
});

test('a failure nobody has named yet is unknown, and still keeps its text for the bug report', () => {
  const failed = failedOpen(new Error('no such table: entry'));
  expect(failed.machine.boot).toMatchObject({ failure: 'unknown', error: 'no such table: entry' });
});

test('anything else that goes wrong is the plain failure screen, with nothing to offer', () => {
  const { machine, effects } = walk(started('web'), {
    type: 'boot-failed',
    message: 'keystore unreadable'
  });

  expect(machine.boot).toMatchObject({ status: 'error', error: 'keystore unreadable' });
  expect(effects).toEqual([]);
});

test('changing the access mode of an open journal moves it without leaving ready', () => {
  const { machine } = walk(
    started('web'),
    surveyedWeb({ deviceBoundKeystoreExists: true }),
    { type: 'key-obtained', dataKey: KEY, accessMode: 'device-bound', unlocked: false },
    { type: 'journal-opened', journal: {} as never },
    { type: 'access-mode-changed', accessMode: 'passphrase' }
  );

  expect(machine.boot.accessMode).toBe('passphrase');
  expect(machine.boot.status).toBe('ready');
});

/* PIN mode is a cold-start gate like passphrase mode, not an auto-unlock:
   the whole point is that something has to be typed. */
test('a PIN journal boots into a gate and reports its mode', () => {
  const { machine, effects } = walk(started('web'), surveyedWeb({ keystoreSecretSource: 'pin' }));

  expect(machine.boot.status).toBe('needs-unlock');
  expect(machine.boot.accessMode).toBe('pin');
  expect(effects).toEqual([]);
});

test('a PIN journal on Android boots into a gate rather than a Keystore prompt', () => {
  const { machine } = walk(started('android'), surveyedAndroid({ keystoreSecretSource: 'pin' }));

  expect(machine.boot.status).toBe('needs-unlock');
  expect(machine.boot.accessMode).toBe('pin');
});

/* The interrupted mode change (data/journal-access-mode.ts states the rule).
   The new keystore is written before the old device key is cleared, so this
   is a reachable state, and it must not send the boot down the auto-unlock
   path with a key that no longer opens the journal. */
test('a PIN keystore beside a leftover device key still boots as PIN', () => {
  const { machine, effects } = walk(
    started('web'),
    surveyedWeb({ keystoreSecretSource: 'pin', deviceBoundKeystoreExists: true })
  );

  expect(machine.boot.accessMode).toBe('pin');
  expect(machine.boot.status).toBe('needs-unlock');
  expect(effects).toEqual([]);
});

test('choosing device-bound mode names what the android refusal leaves to do', () => {
  expect(deviceBoundSetupOutcome({ kind: 'key', dataKey: KEY })).toBe('ok');
  expect(
    deviceBoundSetupOutcome({
      kind: 'refused',
      authentication: interpretAuthentication('noDeviceCredential')
    })
  ).toBe('needs-device-lock');
  expect(
    deviceBoundSetupOutcome({ kind: 'refused', authentication: interpretAuthentication('lockedOut') })
  ).toBe('device-bound-unavailable');
  expect(deviceBoundSetupOutcome({ kind: 'invalidated' })).toBe('device-bound-unavailable');
});

test('journal-open-failed with database lock preserves the lock error and allows retry with key-obtained', () => {
  const lockError = new Error('database is locked (code 5): , while compiling: SELECT COUNT(*) FROM sqlite_schema;');
  const failed = walk(
    started('android'),
    surveyedAndroid({ nativeDeviceKeyExists: true }),
    { type: 'android-key-answered', result: { kind: 'key', dataKey: KEY } },
    { type: 'journal-open-failed', error: lockError }
  );

  expect(failed.machine.boot.status).toBe('error');
  expect(failed.machine.boot.error).toContain('database is locked (code 5)');
  expect(failed.machine.boot.error).not.toContain('FTS5 is not available');

  const retried = reduce(failed.machine, {
    type: 'key-obtained',
    dataKey: KEY,
    accessMode: 'device-bound',
    unlocked: true
  });

  expect(retried.machine.boot.status).toBe('booting');
  expect(retried.machine.boot.error).toBeNull();
  expect(retried.machine.boot.failure).toBeNull();
  expect(retried.effects).toEqual([
    { type: 'mark-unlocked' },
    { type: 'open-journal', dataKey: KEY, accessMode: 'device-bound' }
  ]);
});

test.each(['pin', 'passphrase'] as const)(
  'a cached %s access mode starts in needs-unlock and survives survey',
  (mode) => {
    const machine = initialBoot(mode);
    expect(machine.boot.status).toBe('needs-unlock');
    expect(machine.boot.accessMode).toBe(mode);

    const afterStart = reduce(machine, started('web'));
    expect(afterStart.machine.boot.status).toBe('needs-unlock');

    const afterSurvey = reduce(afterStart.machine, surveyedWeb({ keystoreSecretSource: mode }));
    expect(afterSurvey.machine.boot.status).toBe('needs-unlock');
    expect(afterSurvey.machine.boot.accessMode).toBe(mode);
  }
);

/* A cached mode only ever seeds a guess for frame 0 - the survey that follows
   is still the one that decides anything. Unlike the happy path above, these
   two put the seeded needs-unlock through the same refusal screens the
   uncached boot already reaches (see the equivalent uncached tests further
   up), to prove a stale or merely unconfirmed cache doesn't trade a proper
   refusal screen for the generic boot-failed one. */
test('a cached access mode does not block a device-key refusal from reaching its screen', () => {
  const seeded = reduce(initialBoot('pin'), started('web'));
  const surveyed = reduce(seeded.machine, surveyedWeb({ deviceBoundKeystoreExists: true }));
  expect(surveyed.machine.boot.status).toBe('needs-unlock');

  const { machine } = reduce(surveyed.machine, { type: 'device-key-unavailable' });

  expect(machine.boot.status).toBe('needs-device-recovery');
});

for (const demo of [false, true]) {
  for (const keystoreSecretSource of [null, 'passphrase'] as const) {
    test(`legacy storage refuses boot without write effects, demo=${demo}, keystore=${keystoreSecretSource}`, () => {
      const { machine, effects } = walk(started('web', demo), surveyedWeb({ legacyStoragePresent: true, keystoreSecretSource }));
      expect(machine.boot.status).toBe('legacy-refused');
      expect(effects).toEqual([]);
      expect(reduce(machine, { type: 'key-obtained', dataKey: KEY, accessMode: 'passphrase', unlocked: true }).effects).toEqual([]);
    });
  }
}

/* After-release ticket 10: a web lock closes the journal, and the handle
   boot state held for the page is built over the key a lock lets go of. */
test('a lock takes the journal handle out of ready state and the unlock puts the new one in', () => {
  const before = {} as never;
  const after = {} as never;
  const opened = walk(started('web'), surveyedWeb({ keystoreSecretSource: 'passphrase' }), {
    type: 'key-obtained',
    dataKey: KEY,
    accessMode: 'passphrase',
    unlocked: true
  }, { type: 'journal-opened', journal: before });

  const closed = reduce(opened.machine, { type: 'journal-closed' });
  expect(closed.machine.boot.status).toBe('ready');
  expect(closed.machine.boot.journal).toBeNull();
  expect(closed.effects).toEqual([]);

  const reopened = reduce(closed.machine, { type: 'journal-reopened', journal: after });
  expect(reopened.machine.boot.status).toBe('ready');
  expect(reopened.machine.boot.journal).toBe(after);
  expect(reopened.effects).toEqual([]);
});

test('a lock that lands after the boot left ready changes nothing', () => {
  const failed = walk(started('web'), { type: 'boot-failed', message: 'the database worker stopped' });
  expect(reduce(failed.machine, { type: 'journal-closed' }).machine).toEqual(failed.machine);
  expect(reduce(failed.machine, { type: 'journal-reopened', journal: {} as never }).machine).toEqual(failed.machine);
});


test('a second key while the journal opens leaves the first open alone', () => {
  const first = walk(started('web'), surveyedWeb({ keystoreSecretSource: 'passphrase' }), {
    type: 'key-obtained', dataKey: KEY, accessMode: 'passphrase', unlocked: true
  });
  const duplicate = reduce(first.machine, {
    type: 'key-obtained', dataKey: new Uint8Array(32), accessMode: 'pin', unlocked: true
  });
  expect(duplicate.effects).toEqual([]);
  expect(duplicate.machine.boot).toBe(first.machine.boot);
});


test('a duplicate key never replaces a ready journal or changes its access mode', () => {
  const opened = walk(started('web'), surveyedWeb({ keystoreSecretSource: 'passphrase' }), {
    type: 'key-obtained', dataKey: KEY, accessMode: 'passphrase', unlocked: true
  }, { type: 'journal-opened', journal: {} as never });
  const before = KEY.slice();
  const duplicate = reduce(opened.machine, { type: 'key-obtained', dataKey: KEY, accessMode: 'pin', unlocked: true });
  expect(duplicate.effects).toEqual([]);
  expect(duplicate.machine.boot).toBe(opened.machine.boot);
  expect(KEY).toEqual(before);
});
