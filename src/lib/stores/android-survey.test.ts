import assert from 'node:assert/strict';
import { test } from 'vitest';
import { surveyAndroid } from './android-survey.ts';

/** Three questions that answer only when told to, recording the order they
    were asked in. */
function held() {
  const asked: string[] = [];
  const answers: Record<string, (value: unknown) => void> = {};
  const ask = <T>(name: string) => () =>
    new Promise<T>((resolve) => {
      asked.push(name);
      answers[name] = resolve as (value: unknown) => void;
    });
  return {
    asked,
    answers,
    ports: {
      readKeystoreSource: ask<null>('keystore file'),
      keystoreStatus: ask<{ hasKey: boolean; authRequired?: boolean }>('keystore status'),
      journalIsPlaintext: ask<boolean>('plaintext check')
    }
  };
}

test('all three questions are asked before any of them answers (ux-carpet 207)', async () => {
  const { asked, answers, ports } = held();
  const survey = surveyAndroid(ports);
  await Promise.resolve();

  /* Asked one after another, only the first would have gone out by now, and
     each later one would wait for the one before it to come back through
     the UI thread's queue. */
  assert.deepEqual(asked, ['keystore file', 'keystore status', 'plaintext check']);

  answers['plaintext check'](false);
  answers['keystore status']({ hasKey: true, authRequired: false });
  answers['keystore file'](null);
  assert.deepEqual(await survey, {
    keystoreSecretSource: null,
    nativeDeviceKeyExists: true,
    nativeDeviceKeyAuthRequired: false,
    plaintextJournalPresent: false
  });
});

test('a key whose authentication requirement is unknown reads as requiring it', async () => {
  const survey = await surveyAndroid({
    readKeystoreSource: async () => null,
    keystoreStatus: async () => ({ hasKey: true }),
    journalIsPlaintext: async () => false
  });
  assert.equal(survey.nativeDeviceKeyAuthRequired, true);
});
