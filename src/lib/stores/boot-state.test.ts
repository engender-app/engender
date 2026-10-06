import { expect, test } from 'vitest';
import {
  bootStates,
  bootTransitions,
  midSessionLockApplies,
  needsOnboardingAccessMode
} from './boot-state.ts';

test('starts in booting with no payload state', () => {
  expect(bootStates.booting()).toMatchObject({
    status: 'booting',
    accessMode: null,
    error: null,
    recoverable: false,
    journal: null,
    androidKey: null
  });
});

test('represents first-run setup and unlock paths', () => {
  const base = bootStates.booting();
  const setup = bootTransitions.toNeedsSetup(base, { accessMode: 'passphrase' });
  const unlock = bootTransitions.toNeedsUnlock(base, { accessMode: 'passphrase' });

  expect(setup.status).toBe('needs-setup');
  expect(setup.accessMode).toBe('passphrase');

  expect(unlock.status).toBe('needs-unlock');
  expect(unlock.accessMode).toBe('passphrase');
});

test('represents schema-too-new, authentication-required, recovery-required, and error paths', () => {
  const base = bootStates.booting();

  expect(bootTransitions.toSchemaTooNew(base).status).toBe('schema-too-new');
  expect(bootTransitions.toNeedsAuthentication(base).status).toBe('needs-authentication');
  expect(bootTransitions.toNeedsDeviceRecovery(base).status).toBe('needs-device-recovery');

  const failure = bootTransitions.toError(base, 'boot failed', 'unknown');
  expect(failure.status).toBe('error');
  expect(failure.error).toBe('boot failed');
  expect(failure.recoverable).toBe(false);

  const recoverable = bootTransitions.markErrorRecoverable(failure, true);
  expect(recoverable.recoverable).toBe(true);
});

test('ready transition carries journal payload, persistDenied starting false', () => {
  const base = bootStates.booting();
  const ready = bootTransitions.toReady(base, { journal: {} as never });

  expect(ready.status).toBe('ready');
  expect(ready.journal).not.toBeNull();
  expect(ready.persistDenied).toBe(false);
});

/* ticket 202: the persistence request's answer arrives on its own, after
   ready rather than folded into it - so its own transition marks it. */
test('markPersistDenied sets persistDenied once ready, and is a no-op otherwise', () => {
  const ready = bootTransitions.toReady(bootStates.booting(), { journal: {} as never });
  expect(bootTransitions.markPersistDenied(ready).persistDenied).toBe(true);

  const booting = bootStates.booting();
  expect(bootTransitions.markPersistDenied(booting)).toBe(booting);
});


test('refusal keeps onboarding and session lock out; only ready journals can lock', () => {
  const base = bootStates.booting();
  const refused = bootTransitions.toLegacyRefused(base);
  expect(needsOnboardingAccessMode(refused)).toBe(false);
  expect(midSessionLockApplies(refused)).toBe(false);
  expect(needsOnboardingAccessMode(bootTransitions.toNeedsSetup(base))).toBe(true);
  expect(needsOnboardingAccessMode(bootTransitions.toNeedsUnlock(base))).toBe(false);
  expect(midSessionLockApplies(base)).toBe(false);
  expect(midSessionLockApplies(bootTransitions.toNeedsSetup(base))).toBe(false);
  expect(midSessionLockApplies(bootTransitions.toReady(base, { journal: {} as never }))).toBe(true);
  expect(() => bootTransitions.toReady(refused, { journal: {} as never })).toThrow(/invalid transition/i);
});
