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
import { markJournalBusy } from '../data/journal-busy';
import { setupJournalPassphrase, unlockJournalPassphrase } from '../data/journal-passphrase';
import { readKeystoreSource } from '../data/keystore-file';
import {
  deviceBoundJournalExists,
  DeviceBoundKeyUnavailableError,
  unlockDeviceBoundJournal
} from '../data/device-bound-journal';
import { finishRetirement, prepareConversion, runConversion } from '../data/conversion/conversion';
import { opfsConversionMarker } from '../data/conversion/marker-file';
import {
  JOURNAL_DATABASE,
  plaintextJournalPresent,
  removePlaintextRemnants,
  webConversionPorts,
  webConversionPrecheckPorts
} from '../data/conversion/web-ports';
import { LATEST_SCHEMA_VERSION } from '../data/sqlite/schema-version';
import { localStorageCache } from '../data/prefs/boot-cache';
import { clearBrowserMirrors, wipeLocalData } from '../data/reset';
import { androidKeystore } from '../lock/keystore-bridge';
import type { ListableDirectory } from '../data/photos/opfs-file-store';
import type { BootEffect, BootEvent } from './boot-machine';

type BootDispatch = (event: BootEvent) => void;

/** Everything the reducer can ask for that needs no rune and no open journal. */
type PlatformEffect = Extract<
  BootEffect,
  {
    type:
      | 'survey-web'
      | 'survey-android'
      | 'finish-retirement'
      | 'wipe-demo-journal'
      | 'demo-setup'
      | 'demo-unlock'
      | 'precheck-conversion'
      | 'auto-unlock-device-bound'
      | 'run-conversion';
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
        plaintextJournalPresent: await plaintextJournalPresent(),
        marker: await opfsConversionMarker().read()
      });
      return;
    }

    /* Android takes none of the web's survey (ticket 11): OPFS and the
       conversion marker are about a web install that predated the keystore,
       and a phone has neither - this is the first build that runs on one. */
    case 'survey-android': {
      const keystoreSecretSource = await readKeystoreSource();
      const { hasKey } = await androidKeystore.status();
      dispatch({
        type: 'android-surveyed',
        keystoreSecretSource,
        nativeDeviceKeyExists: hasKey,
        plaintextJournalPresent: await androidJournalIsPlaintext(JOURNAL_DATABASE)
      });
      return;
    }

    case 'finish-retirement':
      await finishRetirement(opfsConversionMarker(), removePlaintextRemnants);
      await performPlatformEffect({ type: 'survey-web' }, dispatch);
      return;

    case 'wipe-demo-journal':
    case 'demo-setup':
    case 'demo-unlock':
      await performDemoEffect(effect, dispatch);
      return;

    case 'precheck-conversion':
      dispatch({
        type: 'conversion-prechecked',
        result: await prepareConversion(webConversionPrecheckPorts(), LATEST_SCHEMA_VERSION)
      });
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

    case 'run-conversion': {
      /* The longest of the four windows an update must not land in (ticket
         04): a whole Journal and every photo, rewritten on a phone. The
         conversion survives being killed and resumes, but code replaced under
         it mid-write is not an interruption it can reason about. */
      const converting = markJournalBusy();
      try {
        await runConversion(webConversionPorts(effect.dataKey), (progress) => {
          dispatch({ type: 'conversion-progressed', progress });
        });
      } finally {
        converting();
      }
      dispatch({ type: 'converted', dataKey: effect.dataKey, accessMode: effect.accessMode });
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
  effect: Extract<PlatformEffect, { type: 'wipe-demo-journal' | 'demo-setup' | 'demo-unlock' }>,
  dispatch: BootDispatch
): Promise<void> {
  if (!__DEMO__) return;
  const DEMO_PASSPHRASE = 'demo';

  switch (effect.type) {
    /* A demo journal is throwaway by definition - reseeded from the persona
       on every empty boot - so a plaintext leftover from before encryption is
       wiped rather than converted. */
    case 'wipe-demo-journal':
      await wipeLocalData({
        closeDatabase: async () => {},
        storageRoot: async () => (await navigator.storage.getDirectory()) as ListableDirectory,
        clearBrowserMirrors: () => clearBrowserMirrors(localStorage),
        clearBootCache: () => localStorageCache().clear()
      });
      dispatch({ type: 'demo-journal-wiped' });
      return;

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
