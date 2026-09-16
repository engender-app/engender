import { describe, expect, it } from 'vitest';

import {
  backToDetail,
  backToList,
  chooseMode,
  continueToSecret,
  needsSecret,
  type AccessModeScreen
} from './accessModeSetup.ts';

describe('needsSecret', () => {
  it('is true for the two modes with something to type', () => {
    expect(needsSecret('pin')).toBe(true);
    expect(needsSecret('passphrase')).toBe(true);
  });

  it('is false for the modes with nothing to type', () => {
    expect(needsSecret('device-bound')).toBe(false);
    expect(needsSecret('biometric')).toBe(false);
    expect(needsSecret('unlocked')).toBe(false);
  });
});

describe('chooseMode', () => {
  it('lands on the detail screen whatever the mode, secret or not', () => {
    expect(chooseMode('pin')).toEqual({ screen: 'detail', mode: 'pin' });
    expect(chooseMode('passphrase')).toEqual({ screen: 'detail', mode: 'passphrase' });
    expect(chooseMode('device-bound')).toEqual({ screen: 'detail', mode: 'device-bound' });
    expect(chooseMode('biometric')).toEqual({ screen: 'detail', mode: 'biometric' });
    expect(chooseMode('unlocked')).toEqual({ screen: 'detail', mode: 'unlocked' });
  });
});

describe('continueToSecret', () => {
  it('moves a secret-needing mode from its detail screen to its secret screen', () => {
    expect(continueToSecret({ screen: 'detail', mode: 'pin' })).toEqual({ screen: 'secret', mode: 'pin' });
    expect(continueToSecret({ screen: 'detail', mode: 'passphrase' })).toEqual({
      screen: 'secret',
      mode: 'passphrase'
    });
  });

  it('does nothing for a mode with no secret to type - there is no screen to show', () => {
    const detail: AccessModeScreen = { screen: 'detail', mode: 'device-bound' };
    expect(continueToSecret(detail)).toBe(detail);
    const unlocked: AccessModeScreen = { screen: 'detail', mode: 'unlocked' };
    expect(continueToSecret(unlocked)).toBe(unlocked);
  });

  it('does nothing off the bare list', () => {
    const list: AccessModeScreen = { screen: 'list' };
    expect(continueToSecret(list)).toBe(list);
  });
});

describe('backToDetail', () => {
  it('returns from the secret screen to the detail screen, mode still chosen', () => {
    expect(backToDetail({ screen: 'secret', mode: 'pin' })).toEqual({ screen: 'detail', mode: 'pin' });
    expect(backToDetail({ screen: 'secret', mode: 'passphrase' })).toEqual({
      screen: 'detail',
      mode: 'passphrase'
    });
  });

  it('does nothing off a screen that is not the secret one', () => {
    const detail: AccessModeScreen = { screen: 'detail', mode: 'pin' };
    expect(backToDetail(detail)).toBe(detail);
    const list: AccessModeScreen = { screen: 'list' };
    expect(backToDetail(list)).toBe(list);
  });
});

describe('backToList', () => {
  it('always returns the bare list', () => {
    expect(backToList()).toEqual({ screen: 'list' });
  });
});
