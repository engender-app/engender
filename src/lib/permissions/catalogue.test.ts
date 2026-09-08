import { describe, expect, it } from 'vitest';

import {
  AMBIENT_KEYS,
  GRANT_KEYS,
  ambientRows,
  grantRows,
  type GrantKey,
  type GrantStates
} from './catalogue';

/** Nothing granted, nothing asked for yet: what a first run meets. */
const NOTHING: GrantStates = {
  notifications: 'denied',
  exactAlarms: 'denied',
  microphone: 'denied',
  camera: 'denied'
};

const rowFor = (key: GrantKey, ...args: Parameters<typeof grantRows>) =>
  grantRows(...args).find((row) => row.key === key)!;

describe('the grantable list', () => {
  it('is the four things an OS dialog or a settings screen exists for', () => {
    expect(GRANT_KEYS).toEqual(['notifications', 'exactAlarms', 'microphone', 'camera']);
  });

  it('names every capability once, across both groups', () => {
    const all = [...GRANT_KEYS, ...AMBIENT_KEYS];
    expect(new Set(all).size).toBe(all.length);
  });

  it('draws every grantable row on Android, in the catalogue order', () => {
    expect(grantRows('android', NOTHING, new Set()).map((row) => row.key)).toEqual(GRANT_KEYS);
  });

  it('keeps the rows the web cannot reach, and marks them unavailable', () => {
    /* A dead button is worse than an absent one, and a missing row is worse
       than both: the point of the list is that it is the whole list. */
    const web = grantRows('web', NOTHING, new Set());
    expect(web.map((row) => row.key)).toEqual(GRANT_KEYS);
    expect(rowFor('notifications', 'web', NOTHING, new Set()).state).toBe('unavailable');
    expect(rowFor('exactAlarms', 'web', NOTHING, new Set()).state).toBe('unavailable');
    expect(rowFor('notifications', 'web', NOTHING, new Set()).action).toBe('none');
  });

  it('leaves the microphone and the camera askable on the web', () => {
    expect(rowFor('microphone', 'web', NOTHING, new Set()).action).toBe('prompt');
    expect(rowFor('camera', 'web', NOTHING, new Set()).action).toBe('prompt');
  });
});

describe('what a grant button does', () => {
  it('goes quiet once the capability is granted', () => {
    const granted: GrantStates = { ...NOTHING, microphone: 'granted' };
    expect(rowFor('microphone', 'android', granted, new Set()).action).toBe('none');
  });

  it('fires the real prompt the first time', () => {
    expect(rowFor('notifications', 'android', NOTHING, new Set()).action).toBe('prompt');
    expect(rowFor('camera', 'android', NOTHING, new Set()).action).toBe('prompt');
  });

  it('sends exact alarms to settings from the start, because Android has no prompt for it', () => {
    const row = rowFor('exactAlarms', 'android', NOTHING, new Set());
    expect(row.action).toBe('settings');
    expect(row.settingsTarget).toBe('exactAlarms');
  });

  it('turns into a settings link once a prompt has come back denied', () => {
    const asked = new Set<GrantKey>(['notifications', 'microphone', 'camera']);
    expect(rowFor('notifications', 'android', NOTHING, asked).settingsTarget).toBe('notifications');
    expect(rowFor('microphone', 'android', NOTHING, asked).settingsTarget).toBe('appInfo');
    expect(rowFor('camera', 'android', NOTHING, asked).settingsTarget).toBe('appInfo');
    for (const key of asked) {
      expect(rowFor(key, 'android', NOTHING, asked).action).toBe('settings');
    }
  });

  it('leaves a refused web prompt with no button, since a page cannot open site settings', () => {
    const asked = new Set<GrantKey>(['microphone']);
    const row = rowFor('microphone', 'web', NOTHING, asked);
    expect(row.action).toBe('none');
    expect(row.settingsTarget).toBe(null);
  });

  it('does not offer a second prompt after a refusal, on either platform', () => {
    for (const platform of ['android', 'web'] as const) {
      const asked = new Set<GrantKey>(['microphone']);
      expect(rowFor('microphone', platform, NOTHING, asked).action).not.toBe('prompt');
    }
  });
});

describe('the group that needs no permission', () => {
  it('is what the system hands over one file at a time, plus print and the clipboard', () => {
    expect(AMBIENT_KEYS).toEqual(['takePhoto', 'pickFile', 'backupFolder', 'print', 'clipboard']);
  });

  it('drops the backup folder on the web, which has no folder to grant', () => {
    expect(ambientRows('android').map((row) => row.key)).toEqual(AMBIENT_KEYS);
    expect(ambientRows('web').map((row) => row.key)).not.toContain('backupFolder');
  });

  it('gives every row an icon', () => {
    for (const row of [...ambientRows('android'), ...grantRows('android', NOTHING, new Set())]) {
      expect(row.icon, row.key).toBeTruthy();
    }
  });
});
