import { expect, test } from 'vitest';
import { interpretAuthentication } from '../lock/biometric-outcome.ts';
import {
  initialBoot,
  reduce,
  skipSetupOutcome,
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
    passphraseKeystoreExists: false,
    deviceBoundKeystoreExists: false,
    plaintextJournalPresent: false,
    marker: null,
    ...survey
  };
}

function surveyedAndroid(
  survey: Partial<Extract<BootEvent, { type: 'android-surveyed' }>> = {}
): BootEvent {
  return {
    type: 'android-surveyed',
    passphraseKeystoreExists: false,
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
  expect(machine.boot.conversion).toBeNull();
  expect(effects).toEqual([]);
});

test('a web journal with a passphrase keystore reaches the unlock gate', () => {
  const { machine, effects } = walk(
    started('web'),
    surveyedWeb({ passphraseKeystoreExists: true })
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

test('plaintext left behind by a finished conversion is retired once, then surveyed again', () => {
  const retire = surveyedWeb({ passphraseKeystoreExists: true, plaintextJournalPresent: true });
  const first = walk(started('web'), retire);

  expect(first.effects).toEqual([{ type: 'finish-retirement' }]);

  /* The second survey is the one the retirement itself asked for. Even if it
     still reads as retire - a delete that did not take - the sequence moves on
     rather than retiring in a circle. */
  const second = walk(started('web'), retire, retire);
  expect(second.effects).toEqual([]);
  expect(second.machine.boot.status).toBe('needs-unlock');
});

test('a plaintext journal is prechecked before anyone is asked for a passphrase', () => {
  const { machine, effects } = walk(
    started('web'),
    surveyedWeb({ plaintextJournalPresent: true })
  );

  expect(machine.boot.status).toBe('booting');
  expect(effects).toEqual([{ type: 'precheck-conversion' }]);
});

test('a refused conversion reaches the refusal screen with its reason', () => {
  const { machine } = walk(started('web'), surveyedWeb({ plaintextJournalPresent: true }), {
    type: 'conversion-prechecked',
    result: { ok: false, reason: 'not-enough-space', needBytes: 500, freeBytes: 120 }
  });

  expect(machine.boot.status).toBe('conversion-refused');
  expect(machine.boot.conversionRefusal).toMatchObject({
    reason: 'not-enough-space',
    needBytes: 500,
    freeBytes: 120
  });
});

test('an accepted conversion asks for a new passphrase, or for the saved one when resuming', () => {
  const fresh = walk(started('web'), surveyedWeb({ plaintextJournalPresent: true }), {
    type: 'conversion-prechecked',
    result: { ok: true }
  });

  expect(fresh.machine.boot.status).toBe('needs-setup');
  expect(fresh.machine.boot.accessMode).toBe('passphrase');
  expect(fresh.machine.boot.conversion).toEqual({ progress: null });

  const resuming = walk(
    started('web'),
    surveyedWeb({ plaintextJournalPresent: true, passphraseKeystoreExists: true, marker: 'database' }),
    { type: 'conversion-prechecked', result: { ok: true } }
  );

  expect(resuming.machine.boot.status).toBe('needs-unlock');
  expect(resuming.machine.boot.conversion).toEqual({ progress: null });
});

test('a demo build wipes a plaintext journal rather than converting it, then sets up', () => {
  const wiping = walk(started('web', true), surveyedWeb({ plaintextJournalPresent: true }));
  expect(wiping.effects).toEqual([{ type: 'wipe-demo-journal' }]);

  const afterWipe = walk(
    started('web', true),
    surveyedWeb({ plaintextJournalPresent: true }),
    { type: 'demo-journal-wiped' }
  );
  expect(afterWipe.effects).toEqual([{ type: 'demo-setup' }]);
});

test('a demo build unlocks itself, and falls back to the gate when the passphrase changed', () => {
  const unlocking = walk(started('web', true), surveyedWeb({ passphraseKeystoreExists: true }));
  expect(unlocking.effects).toEqual([{ type: 'demo-unlock' }]);

  const fallen = walk(started('web', true), surveyedWeb({ passphraseKeystoreExists: true }), {
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
    walk(started('android'), surveyedAndroid({ passphraseKeystoreExists: true })).machine.boot
  ).toMatchObject({ status: 'needs-unlock', accessMode: 'passphrase' });

  expect(
    walk(started('android'), surveyedAndroid({ nativeDeviceKeyExists: true })).machine.boot
  ).toMatchObject({ status: 'needs-authentication', accessMode: 'device-bound' });

  const plaintext = walk(started('android'), surveyedAndroid({ plaintextJournalPresent: true }));
  expect(plaintext.machine.boot).toMatchObject({
    status: 'error',
    error: 'android-plaintext-journal'
  });
});

test('a refused android key leaves the gate the refusal to render', () => {
  const refusal = {
    kind: 'refused' as const,
    authentication: interpretAuthentication('lockedOut')
  };
  const { machine } = walk(
    started('android'),
    surveyedAndroid({ nativeDeviceKeyExists: true }),
    { type: 'android-key-refused', refusal }
  );

  expect(machine.boot.status).toBe('needs-authentication');
  expect(machine.boot.androidKey).toEqual(refusal);

  const invalidated = walk(
    started('android'),
    surveyedAndroid({ nativeDeviceKeyExists: true }),
    { type: 'android-key-refused', refusal: { kind: 'invalidated' } }
  );
  expect(invalidated.machine.boot.androidKey).toEqual({ kind: 'invalidated' });
});

test('a key with no conversion waiting opens the journal straight away', () => {
  const { machine, effects } = walk(
    started('android'),
    surveyedAndroid({ nativeDeviceKeyExists: true }),
    { type: 'key-obtained', dataKey: KEY, accessMode: 'device-bound' }
  );

  expect(machine.boot.status).toBe('booting');
  expect(machine.boot.accessMode).toBe('device-bound');
  expect(effects).toEqual([{ type: 'open-journal', dataKey: KEY, accessMode: 'device-bound' }]);
});

test('a key with a conversion waiting converts first, reporting progress, then opens', () => {
  const upToKey: BootEvent[] = [
    started('web'),
    surveyedWeb({ plaintextJournalPresent: true }),
    { type: 'conversion-prechecked', result: { ok: true } },
    { type: 'key-obtained', dataKey: KEY, accessMode: 'passphrase' }
  ];

  const converting = walk(...upToKey);
  expect(converting.machine.boot.status).toBe('converting');
  expect(converting.effects).toEqual([
    { type: 'run-conversion', dataKey: KEY, accessMode: 'passphrase' }
  ]);

  const progressed = walk(...upToKey, {
    type: 'conversion-progressed',
    progress: { stage: 'photos', done: 2, total: 5 }
  });
  expect(progressed.machine.boot.conversion).toEqual({
    progress: { stage: 'photos', done: 2, total: 5 }
  });

  const opened = walk(...upToKey, { type: 'converted', dataKey: KEY, accessMode: 'passphrase' });
  expect(opened.machine.boot.status).toBe('booting');
  expect(opened.effects).toEqual([
    { type: 'open-journal', dataKey: KEY, accessMode: 'passphrase' }
  ]);
});

test('an opened journal is ready, and a browser that refused storage gets a warning', () => {
  const quiet = walk(
    started('web'),
    surveyedWeb({ passphraseKeystoreExists: true }),
    { type: 'key-obtained', dataKey: KEY, accessMode: 'passphrase' },
    { type: 'journal-opened', journal: {} as never, persistDenied: false }
  );

  expect(quiet.machine.boot.status).toBe('ready');
  expect(quiet.machine.boot.journal).not.toBeNull();
  expect(quiet.effects).toEqual([]);

  const denied = walk(
    started('web'),
    surveyedWeb({ passphraseKeystoreExists: true }),
    { type: 'key-obtained', dataKey: KEY, accessMode: 'passphrase' },
    { type: 'journal-opened', journal: {} as never, persistDenied: true }
  );
  expect(denied.machine.boot.persistDenied).toBe(true);
  expect(denied.effects).toEqual([{ type: 'warn-persist-denied' }]);
});

test('a journal a newer build already migrated reaches the rollback screen', () => {
  const { machine } = walk(
    started('web'),
    surveyedWeb({ passphraseKeystoreExists: true }),
    { type: 'key-obtained', dataKey: KEY, accessMode: 'passphrase' },
    { type: 'journal-schema-too-new' }
  );

  expect(machine.boot.status).toBe('schema-too-new');
});

test('an interrupted restore finishes itself instead of reaching a screen', () => {
  const { machine, effects } = walk(
    started('web'),
    surveyedWeb({ passphraseKeystoreExists: true }),
    { type: 'key-obtained', dataKey: KEY, accessMode: 'passphrase' },
    { type: 'restore-interrupted' }
  );

  expect(machine.boot.status).toBe('booting');
  expect(effects).toEqual([{ type: 'restore-previous-journal' }]);
});

test('a failed open asks the disk whether it can offer a way back', () => {
  const failed = walk(
    started('web'),
    surveyedWeb({ passphraseKeystoreExists: true }),
    { type: 'key-obtained', dataKey: KEY, accessMode: 'passphrase' },
    { type: 'journal-open-failed', message: 'no such table' }
  );

  expect(failed.machine.boot).toMatchObject({
    status: 'error',
    error: 'no such table',
    recoverable: false
  });
  expect(failed.effects).toEqual([{ type: 'check-pre-migration-copy' }]);

  const recoverable = walk(
    started('web'),
    surveyedWeb({ passphraseKeystoreExists: true }),
    { type: 'key-obtained', dataKey: KEY, accessMode: 'passphrase' },
    { type: 'journal-open-failed', message: 'no such table' },
    { type: 'pre-migration-copy-checked', usable: true }
  );
  expect(recoverable.machine.boot.recoverable).toBe(true);
});

test('anything else that goes wrong is the plain failure screen, with nothing to offer', () => {
  const { machine, effects } = walk(started('web'), {
    type: 'boot-failed',
    message: 'keystore unreadable'
  });

  expect(machine.boot).toMatchObject({ status: 'error', error: 'keystore unreadable' });
  expect(effects).toEqual([]);
});

test('adding a passphrase to an open journal moves its access mode', () => {
  const { machine } = walk(
    started('web'),
    surveyedWeb({ deviceBoundKeystoreExists: true }),
    { type: 'key-obtained', dataKey: KEY, accessMode: 'device-bound' },
    { type: 'journal-opened', journal: {} as never, persistDenied: false },
    { type: 'passphrase-added' }
  );

  expect(machine.boot.accessMode).toBe('passphrase');
  expect(machine.boot.status).toBe('ready');
});

test('illegal events throw rather than moving the boot somewhere it cannot be', () => {
  const setup = walk(started('web'), surveyedWeb()).machine;

  expect(() =>
    reduce(setup, { type: 'conversion-progressed', progress: { stage: 'database' } })
  ).toThrow(/invalid transition/i);
  expect(() =>
    reduce(setup, { type: 'journal-opened', journal: {} as never, persistDenied: false })
  ).toThrow(/invalid transition/i);
  expect(() => reduce(setup, { type: 'pre-migration-copy-checked', usable: true })).toThrow(
    /invalid transition/i
  );
});

test('skipping setup names what the android refusal leaves to do', () => {
  expect(skipSetupOutcome({ kind: 'key', dataKey: KEY })).toBe('ok');
  expect(
    skipSetupOutcome({
      kind: 'refused',
      authentication: interpretAuthentication('noDeviceCredential')
    })
  ).toBe('needs-device-lock');
  expect(
    skipSetupOutcome({ kind: 'refused', authentication: interpretAuthentication('lockedOut') })
  ).toBe('device-bound-unavailable');
  expect(skipSetupOutcome({ kind: 'invalidated' })).toBe('device-bound-unavailable');
});
