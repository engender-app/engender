/* The platform side of a boot (phase 5 audit ticket 14): what each step the
   reducer asks for actually asks of the disk, the keystore and the browser,
   and what it says back.

   Rune-free on purpose, the same way boot-machine.ts is. Between them they
   hold the whole sequence except the part ADR-0017 puts in the app-level
   module - constructing the journal over a driver - which is why what is left
   in boot.svelte.ts is a rune, three effects that touch reactive state, and
   the actions the gates call.

   Every function here asks one thing and dispatches one event. None of them
   catches an error it cannot name: the adapter's `run` turns anything that
   throws into a failed boot, which is what the four sequences this replaced
   each ended in. */

import { androidJournalIsPlaintext } from '../data/sqlite/android-driver';
import { setupJournalPassphrase, unlockJournalPassphrase } from '../data/journal-passphrase';
import { readKeystoreSource } from '../data/keystore-file';
import { surveyAndroid } from './android-survey';
import {
  deviceBoundJournalExists,
  DeviceBoundKeyUnavailableError,
  unlockDeviceBoundJournal
} from '../data/device-bound-journal';
import { JOURNAL_DATABASE, legacyStoragePresent } from '../data/legacy-journal';
import { openAndroidDataKey } from '../lock/android-key';
import { androidKeystore } from '../lock/keystore-bridge';
import type { BootEffect, BootEvent } from './boot-machine';

type BootDispatch = (event: BootEvent) => void;

/** Everything the reducer can ask for that needs no rune and no open journal. */
type PlatformEffect = Extract<
  BootEffect,
  {
    type:
      | 'survey-web'
      | 'survey-android'
      | 'demo-setup'
      | 'demo-unlock'
      | 'auto-unlock-device-bound'
      | 'auto-unlock-android';
  }
>;

export async function performPlatformEffect(effect: PlatformEffect, dispatch: BootDispatch): Promise<void> {
  switch (effect.type) {
    case 'survey-web': {
      const keystoreSecretSource = await readKeystoreSource();
      const deviceBoundKeystoreExists = await deviceBoundJournalExists();
      dispatch({
        type: 'web-surveyed',
        keystoreSecretSource,
        deviceBoundKeystoreExists,
        legacyStoragePresent: await legacyStoragePresent()
      });
      return;
    }

    /* Android takes none of the web's survey (ticket 11): OPFS and the
       conversion marker are about a web install that predated the keystore,
       and a phone has neither - this is the first build that runs on one. */
    case 'survey-android': {
      /* All three at once (android-survey.ts says why). */
      const survey = await surveyAndroid({
        readKeystoreSource,
        keystoreStatus: () => androidKeystore.status(),
        journalIsPlaintext: () => androidJournalIsPlaintext(JOURNAL_DATABASE)
      });
      dispatch({ type: 'android-surveyed', ...survey });
      return;
    }

    case 'demo-setup':
    case 'demo-unlock':
      await performDemoEffect(effect, dispatch);
      return;

    case 'auto-unlock-device-bound': {
      let dataKey;
      try {
        dataKey = await unlockDeviceBoundJournal();
      } catch (error) {
        if (!(error instanceof DeviceBoundKeyUnavailableError)) throw error;
        dispatch({ type: 'device-key-unavailable' });
        return;
      }
      /* Nobody authenticated for this one - the browser handed the key over
         because the device is the device. App lock still has its question to
         ask (ADR-0014). */
      dispatch({ type: 'key-obtained', dataKey, accessMode: 'device-bound', unlocked: false });
      return;
    }

    case 'auto-unlock-android': {
      /* Only planned when the survey found a device key
         (describeAndroidBootPlan), so the bridge is not asked again. */
      const result = await openAndroidDataKey(
        androidKeystore,
        { title: '', subtitle: '', cancel: '', deviceCredential: false },
        { hasKey: true }
      );
      if (result.kind === 'key') {
        dispatch({ type: 'key-obtained', dataKey: result.dataKey, accessMode: 'unlocked', unlocked: false });
      } else {
        dispatch({ type: 'android-key-answered', result });
      }
      return;
    }


  }
}

/** In a demo build the passphrase machinery runs for real - keystore, wrap,
    encrypted database - but under a fixed passphrase entered by no one, so
    reviewers and the walkthrough suite land in the journal instead of at a
    setup wall.

    `__DEMO__` is a compile-time constant, so the guard makes everything below
    it dead code a production build drops, fixed passphrase included (ticket
    05). The reducer emits none of these effects outside a demo build either;
    the guard is what keeps them out of the bundle. */
async function performDemoEffect(
  effect: Extract<PlatformEffect, { type: 'demo-setup' | 'demo-unlock' }>,
  dispatch: BootDispatch
): Promise<void> {
  if (!__DEMO__) return;
  const DEMO_PASSPHRASE = 'demo';

  switch (effect.type) {
    /* `unlocked: true`, unlike the two real setup paths, because nobody
       typed anything and nobody should have to. Until ticket 53 the casual-
       access gate read `prefs.pinHash`, which a demo journal never has, so
       `false` here reached no gate. It reads the access mode now - and a
       demo journal is in passphrase mode - so `false` would land every demo
       boot on a lock screen asking for a passphrase the reviewer was never
       given. */
    case 'demo-setup':
      dispatch({
        type: 'key-obtained',
        dataKey: await setupJournalPassphrase(DEMO_PASSPHRASE),
        accessMode: 'passphrase',
        unlocked: true
      });
      return;

    /* A reviewer may have changed the demo passphrase in Settings; the gate
       is the honest fallback. */
    case 'demo-unlock': {
      let dataKey;
      try {
        dataKey = await unlockJournalPassphrase(DEMO_PASSPHRASE);
      } catch {
        dispatch({ type: 'demo-unlock-failed' });
        return;
      }
      dispatch({ type: 'key-obtained', dataKey, accessMode: 'passphrase', unlocked: true });
      return;
    }
  }
}
