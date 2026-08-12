import { test, expect } from 'vitest';
import { chooseJournalAccessMode, describeAndroidBootPlan, describeWebBootPlan } from './journal-access-mode.ts';

test('first run keeps no access mode until somebody chooses one', () => {
  expect(chooseJournalAccessMode({ passphraseKeystoreExists: false, deviceBoundKeystoreExists: false })).toBeNull();
});

test('a passphrase journal stays passphrase-led even if stale device-bound material is still around', () => {
  expect(chooseJournalAccessMode({ passphraseKeystoreExists: true, deviceBoundKeystoreExists: true })).toBe('passphrase');
});

test('web first run asks for setup, not unlock', () => {
  expect(
    describeWebBootPlan({
      passphraseKeystoreExists: false,
      deviceBoundKeystoreExists: false,
      plaintextJournalPresent: false,
      marker: null
    })
  ).toBe('needs-setup');
});

test('web skip mode cold-boots straight into an automatic local unlock', () => {
  expect(
    describeWebBootPlan({
      passphraseKeystoreExists: false,
      deviceBoundKeystoreExists: true,
      plaintextJournalPresent: false,
      marker: null
    })
  ).toBe('auto-unlock');
});

test('web passphrase mode cold-boots into the passphrase gate', () => {
  expect(
    describeWebBootPlan({
      passphraseKeystoreExists: true,
      deviceBoundKeystoreExists: false,
      plaintextJournalPresent: false,
      marker: null
    })
  ).toBe('needs-unlock');
});

test('web conversion stays on the existing conversion plan rather than offering skip', () => {
  expect(
    describeWebBootPlan({
      passphraseKeystoreExists: false,
      deviceBoundKeystoreExists: false,
      plaintextJournalPresent: true,
      marker: null
    })
  ).toBe('convert');
});

test('android first run becomes an explicit setup choice', () => {
  expect(
    describeAndroidBootPlan({
      passphraseKeystoreExists: false,
      nativeDeviceKeyExists: false,
      plaintextJournalPresent: false
    })
  ).toBe('needs-setup');
});

test('android journals already using the native device key keep their current cold-boot behaviour', () => {
  expect(
    describeAndroidBootPlan({
      passphraseKeystoreExists: false,
      nativeDeviceKeyExists: true,
      plaintextJournalPresent: false
    })
  ).toBe('needs-authentication');
});

test('android passphrase mode cold-boots into the passphrase gate', () => {
  expect(
    describeAndroidBootPlan({
      passphraseKeystoreExists: true,
      nativeDeviceKeyExists: true,
      plaintextJournalPresent: false
    })
  ).toBe('needs-unlock');
});

test('android still refuses a plaintext journal when there is no usable key model for it', () => {
  expect(
    describeAndroidBootPlan({
      passphraseKeystoreExists: false,
      nativeDeviceKeyExists: false,
      plaintextJournalPresent: true
    })
  ).toBe('plaintext-error');
});