import { afterEach, expect, test } from 'vitest';
import {
  forgetHeldRecoveryKey,
  holdShownRecoveryKey,
  openHeldRecoveryKey,
  recoveryKeyHeld
} from './recovery-key-held.ts';
import { DecryptionFailedError } from '../crypto/aesGcm.ts';

const aDataKey = (): Uint8Array<ArrayBuffer> => crypto.getRandomValues(new Uint8Array(32));
const KEY = 'ABCDE-FGHJK-LMNPQ-RSTVW-XYZ23';

afterEach(forgetHeldRecoveryKey);

test('a key held across a lock opens back to the same characters under the same data key', async () => {
  const dataKey = aDataKey();
  holdShownRecoveryKey(KEY, dataKey);

  expect(recoveryKeyHeld()).toBe(true);
  expect(await openHeldRecoveryKey(dataKey)).toBe(KEY);
});

test('nothing held opens to nothing', async () => {
  expect(recoveryKeyHeld()).toBe(false);
  expect(await openHeldRecoveryKey(aDataKey())).toBeNull();
});

test('the held copy is sealed: another data key cannot open it', async () => {
  holdShownRecoveryKey(KEY, aDataKey());

  await expect(openHeldRecoveryKey(aDataKey())).rejects.toBeInstanceOf(DecryptionFailedError);
});

test('a forgotten key stays forgotten, even when it was still being sealed', async () => {
  const dataKey = aDataKey();
  holdShownRecoveryKey(KEY, dataKey);
  forgetHeldRecoveryKey();

  expect(recoveryKeyHeld()).toBe(false);
  expect(await openHeldRecoveryKey(dataKey)).toBeNull();
});

test('a newer key replaces the one held before it', async () => {
  const dataKey = aDataKey();
  holdShownRecoveryKey(KEY, dataKey);
  holdShownRecoveryKey('ZYXWV-TSRQP-NMLKJ-HGFED-CBA98', dataKey);

  expect(await openHeldRecoveryKey(dataKey)).toBe('ZYXWV-TSRQP-NMLKJ-HGFED-CBA98');
});

test('forgetting while an open is under way answers nothing', async () => {
  const dataKey = aDataKey();
  holdShownRecoveryKey(KEY, dataKey);
  const opening = openHeldRecoveryKey(dataKey);
  forgetHeldRecoveryKey();

  expect(await opening).toBeNull();
});
