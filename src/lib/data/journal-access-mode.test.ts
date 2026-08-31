import { test, expect } from 'vitest';
import {
  accessModeHasSecret,
  chooseJournalAccessMode,
  describeAndroidBootPlan,
  describeWebBootPlan
} from './journal-access-mode.ts';

test('first run keeps no access mode until somebody chooses one', () => {
  expect(chooseJournalAccessMode({ keystoreSecretSource: null, deviceBoundKeystoreExists: false })).toBeNull();
});

test('a passphrase journal stays passphrase-led even if stale device-bound material is still around', () => {
  expect(chooseJournalAccessMode({ keystoreSecretSource: 'passphrase', deviceBoundKeystoreExists: true })).toBe('passphrase');
});

test('a PIN journal is read off the keystore that says so', () => {
  expect(chooseJournalAccessMode({ keystoreSecretSource: 'pin', deviceBoundKeystoreExists: false })).toBe('pin');
});

/* Changing mode writes the new keystore before clearing the old device key,
   so this is the state a crash in between leaves behind. It must not read as
   device-bound: the journal is already wrapped under the new secret, and the
   leftover key no longer opens it. */
test('a PIN journal wins over a device key an interrupted mode change left behind', () => {
  expect(chooseJournalAccessMode({ keystoreSecretSource: 'pin', deviceBoundKeystoreExists: true })).toBe('pin');
});

test('web first run asks for setup, not unlock', () => {
  expect(
    describeWebBootPlan({
      keystoreSecretSource: null,
      deviceBoundKeystoreExists: false,
      plaintextJournalPresent: false,
      marker: null
    })
  ).toBe('needs-setup');
});

test('web device-bound mode cold-boots straight into an automatic local unlock', () => {
  expect(
    describeWebBootPlan({
      keystoreSecretSource: null,
      deviceBoundKeystoreExists: true,
      plaintextJournalPresent: false,
      marker: null
    })
  ).toBe('auto-unlock');
});

test('web passphrase mode cold-boots into the passphrase gate', () => {
  expect(
    describeWebBootPlan({
      keystoreSecretSource: 'passphrase',
      deviceBoundKeystoreExists: false,
      plaintextJournalPresent: false,
      marker: null
    })
  ).toBe('needs-unlock');
});

test('web PIN mode cold-boots into a gate rather than unlocking itself', () => {
  expect(
    describeWebBootPlan({
      keystoreSecretSource: 'pin',
      deviceBoundKeystoreExists: false,
      plaintextJournalPresent: false,
      marker: null
    })
  ).toBe('needs-unlock');
});

test('web conversion stays on the existing conversion plan rather than offering a mode choice', () => {
  expect(
    describeWebBootPlan({
      keystoreSecretSource: null,
      deviceBoundKeystoreExists: false,
      plaintextJournalPresent: true,
      marker: null
    })
  ).toBe('convert');
});

test('android first run becomes an explicit setup choice', () => {
  expect(
    describeAndroidBootPlan({
      keystoreSecretSource: null,
      nativeDeviceKeyExists: false,
      plaintextJournalPresent: false
    })
  ).toBe('needs-setup');
});

test('android journals already using the native device key keep their current cold-boot behaviour', () => {
  expect(
    describeAndroidBootPlan({
      keystoreSecretSource: null,
      nativeDeviceKeyExists: true,
      plaintextJournalPresent: false
    })
  ).toBe('needs-authentication');
});

test('android passphrase mode cold-boots into the passphrase gate', () => {
  expect(
    describeAndroidBootPlan({
      keystoreSecretSource: 'passphrase',
      nativeDeviceKeyExists: true,
      plaintextJournalPresent: false
    })
  ).toBe('needs-unlock');
});

test('android PIN mode cold-boots into a gate too', () => {
  expect(
    describeAndroidBootPlan({
      keystoreSecretSource: 'pin',
      nativeDeviceKeyExists: false,
      plaintextJournalPresent: false
    })
  ).toBe('needs-unlock');
});

test('android still refuses a plaintext journal when there is no usable key model for it', () => {
  expect(
    describeAndroidBootPlan({
      keystoreSecretSource: null,
      nativeDeviceKeyExists: false,
      plaintextJournalPresent: true
    })
  ).toBe('plaintext-error');
});

/* What mid-session locking can ask for. The web's device-bound mode is the
   one gap, and it is a real one rather than an oversight: there is no secret
   to re-ask, so lock-on-leave there can only blank the screen. */
test('a mode has a secret to re-ask for only where one exists', () => {
  expect(accessModeHasSecret('passphrase', false)).toBe(true);
  expect(accessModeHasSecret('pin', false)).toBe(true);
  expect(accessModeHasSecret('device-bound', true)).toBe(true);
  expect(accessModeHasSecret('device-bound', false)).toBe(false);
  expect(accessModeHasSecret(null, true)).toBe(false);
});
