import { expect, test } from 'vitest';
import { bootStates, bootTransitions } from './boot-state.ts';

test('starts in booting with no payload state', () => {
  expect(bootStates.booting()).toMatchObject({
    status: 'booting',
    accessMode: null,
    error: null,
    recoverable: false,
    journal: null,
    conversion: null,
    conversionRefusal: null,
    androidKey: null
  });
});

test('represents first-run setup and unlock paths', () => {
  const base = bootStates.booting();
  const setup = bootTransitions.toNeedsSetup(base, { accessMode: 'passphrase' });
  const unlock = bootTransitions.toNeedsUnlock(base, { accessMode: 'passphrase' });

  expect(setup.status).toBe('needs-setup');
  expect(setup.accessMode).toBe('passphrase');
  expect(setup.conversion).toBeNull();

  expect(unlock.status).toBe('needs-unlock');
  expect(unlock.accessMode).toBe('passphrase');
  expect(unlock.conversion).toBeNull();
});

test('represents conversion-required and conversion-refused paths', () => {
  const base = bootStates.booting();
  const conversionRequired = bootTransitions.toNeedsSetup(base, {
    accessMode: 'passphrase',
    conversionRequired: true
  });
  const refused = bootTransitions.toConversionRefused(base, {
    reason: 'not-enough-space',
    needBytes: 500,
    freeBytes: 120
  });

  expect(conversionRequired.status).toBe('needs-setup');
  expect(conversionRequired.conversion).toEqual({ progress: null });

  expect(refused.status).toBe('conversion-refused');
  expect(refused.conversionRefusal).toEqual({
    reason: 'not-enough-space',
    needBytes: 500,
    freeBytes: 120
  });
});

test('represents schema-too-new, authentication-required, recovery-required, and error paths', () => {
  const base = bootStates.booting();

  expect(bootTransitions.toSchemaTooNew(base).status).toBe('schema-too-new');
  expect(bootTransitions.toNeedsAuthentication(base).status).toBe('needs-authentication');
  expect(bootTransitions.toNeedsDeviceRecovery(base).status).toBe('needs-device-recovery');

  const failure = bootTransitions.toError(base, 'boot failed');
  expect(failure.status).toBe('error');
  expect(failure.error).toBe('boot failed');
  expect(failure.recoverable).toBe(false);

  const recoverable = bootTransitions.markErrorRecoverable(failure, true);
  expect(recoverable.recoverable).toBe(true);
});

test('valid conversion transitions carry progress payload', () => {
  const base = bootStates.booting();
  const setup = bootTransitions.toNeedsUnlock(base, {
    accessMode: 'passphrase',
    conversionRequired: true
  });
  const converting = bootTransitions.toConverting(setup);
  const progressed = bootTransitions.updateConversionProgress(converting, {
    stage: 'photos',
    done: 2,
    total: 5
  });

  expect(converting.status).toBe('converting');
  expect(progressed.conversion).toEqual({
    progress: {
      stage: 'photos',
      done: 2,
      total: 5
    }
  });
});

test('ready transition carries journal payload', () => {
  const base = bootStates.booting();
  const ready = bootTransitions.toReady(base, {
    journal: {} as never,
    persistDenied: true
  });

  expect(ready.status).toBe('ready');
  expect(ready.journal).not.toBeNull();
  expect(ready.persistDenied).toBe(true);
});

test('rejects invalid transitions', () => {
  const base = bootStates.booting();
  const unlock = bootTransitions.toNeedsUnlock(base, { accessMode: 'passphrase' });

  expect(() => bootTransitions.toConverting(base)).toThrow(/invalid transition/i);
  expect(() => bootTransitions.updateConversionProgress(unlock as never, { stage: 'database' })).toThrow(/invalid transition/i);
  expect(() => bootTransitions.toReady(unlock, { journal: {} as never, persistDenied: false })).toThrow(/invalid transition/i);
});
