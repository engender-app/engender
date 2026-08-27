/* Every decision a boot makes, in one rune-free place (phase 5 audit ticket
   14).

   boot-state.ts owns whether a transition is *allowed*. This owns which one is
   *taken*: web and Android, first run and unlock, a plaintext journal that has
   to be converted first, a key the platform will not hand over, a schema a
   newer build already migrated. Those used to be twenty-six branches spread
   through four near-parallel sequences in boot.svelte.ts, which carries runes
   and so cannot be imported by the node tier - the one module in the codebase
   with real ordering invariants was the one no test could reach.

   The shape is the usual one for an async sequence that has to stay testable:
   an event arrives, `reduce` returns the next state and the effects the
   adapter should perform, and each effect comes back as another event. The
   adapter (boot.svelte.ts) holds the I/O and the runes and decides nothing.

   The four sequences are one because their differences are events rather than
   code paths: `started` carries the platform, the two surveys carry what each
   platform found, and everything from the data key onwards is shared. */

import {
  describeJournalState,
  type ConversionProgress,
  type ConversionStage,
  type PrecheckResult
} from '../data/conversion/conversion.ts';
import {
  chooseJournalAccessMode,
  describeAndroidBootPlan,
  describeWebBootPlan,
  type JournalAccessMode
} from '../data/journal-access-mode.ts';
import type { Journal } from '../data/journal/journal.ts';
import { InterruptedRestoreError, SchemaTooNewError } from '../data/sqlite/migration-runner.ts';
import type { AndroidKeyResult } from '../lock/android-key.ts';
import { bootStates, bootTransitions, type BootState } from './boot-state.ts';

export type BootPlatform = 'web' | 'android';

/** The data key never lands in `BootState` - it travels through the machine
    from the platform that unwrapped it to the effect that opens the journal
    under it, and nothing reactive ever sees it. */
type DataKey = Uint8Array<ArrayBuffer>;

export type BootEvent =
  /** The app came up. Platform and demo build are facts, not branches. */
  | { type: 'started'; platform: BootPlatform; demo: boolean }
  /** What the web found: two keystores, a possible plaintext journal, and the
      marker an interrupted conversion leaves behind. */
  | {
      type: 'web-surveyed';
      passphraseKeystoreExists: boolean;
      deviceBoundKeystoreExists: boolean;
      plaintextJournalPresent: boolean;
      marker: ConversionStage | null;
    }
  /** What Android found. No marker and no OPFS: this is the first build that
      runs on a phone, so there is nothing from before encryption to convert. */
  | {
      type: 'android-surveyed';
      passphraseKeystoreExists: boolean;
      nativeDeviceKeyExists: boolean;
      plaintextJournalPresent: boolean;
    }
  | { type: 'demo-journal-wiped' }
  | { type: 'demo-unlock-failed' }
  | { type: 'conversion-prechecked'; result: PrecheckResult }
  | { type: 'device-key-unavailable' }
  /** What Android Keystore answered, whole. Which of the two destinations it
      means is decided here, not by the caller reading `kind`. */
  | { type: 'android-key-answered'; result: AndroidKeyResult }
  /** `unlocked` is whether somebody authenticated to get this key. A typed
      passphrase and an Android prompt both satisfy the casual-access gate;
      a key the platform handed over unasked does not. */
  | { type: 'key-obtained'; dataKey: DataKey; accessMode: JournalAccessMode; unlocked: boolean }
  | { type: 'conversion-progressed'; progress: ConversionProgress }
  | { type: 'converted'; dataKey: DataKey; accessMode: JournalAccessMode }
  | { type: 'journal-opened'; journal: Journal; persistDenied: boolean }
  /** However boot() ended badly, unread. Three very different destinations
      hide in this one value, and telling them apart is an ordering decision. */
  | { type: 'journal-open-failed'; error: unknown }
  | { type: 'pre-migration-copy-checked'; usable: boolean }
  | { type: 'boot-failed'; message: string }
  /** Settings, not boot: a device-bound journal grew a passphrase. */
  | { type: 'passphrase-added' };

export type BootEffect =
  | { type: 'apply-cached-preferences' }
  | { type: 'mark-unlocked' }
  | { type: 'survey-web' }
  | { type: 'survey-android' }
  /** Delete the plaintext files a finished conversion left, then survey again. */
  | { type: 'finish-retirement' }
  | { type: 'wipe-demo-journal' }
  | { type: 'demo-setup' }
  | { type: 'demo-unlock' }
  | { type: 'precheck-conversion' }
  | { type: 'auto-unlock-device-bound' }
  | { type: 'run-conversion'; dataKey: DataKey; accessMode: JournalAccessMode }
  | { type: 'open-journal'; dataKey: DataKey; accessMode: JournalAccessMode }
  | { type: 'restore-previous-journal' }
  | { type: 'check-pre-migration-copy' }
  | { type: 'warn-persist-denied' };

export interface BootMachine {
  boot: BootState;
  /** A demo build converts nothing: its journal is reseeded from the persona
      on every empty boot, so a plaintext leftover is wiped instead. */
  demo: boolean;
  /** Retirement gets one pass. A delete that did not take must not send the
      sequence round again. */
  retired: boolean;
  /** A keystore already there when the conversion was found means an earlier
      attempt got past the passphrase screen: ask for that passphrase rather
      than for a new one. Read from the survey, which is the same moment the
      old code re-read it - the precheck writes a marker, never a keystore. */
  conversionResumable: boolean;
}

export interface BootStep {
  machine: BootMachine;
  effects: BootEffect[];
}

export function initialBoot(): BootMachine {
  return {
    boot: bootStates.booting(),
    demo: false,
    retired: false,
    conversionResumable: false
  };
}

function step(machine: BootMachine, boot: BootState, effects: BootEffect[] = []): BootStep {
  return { machine: { ...machine, boot }, effects };
}

/** The data key is in hand: convert first if a plaintext journal is still
    waiting, otherwise open. Shared by the passphrase gates, the Android gate,
    the device-bound auto-unlock and the demo build - the point where the four
    sequences became one. */
function withDataKey(
  machine: BootMachine,
  dataKey: DataKey,
  accessMode: JournalAccessMode,
  unlocked: boolean
): BootStep {
  const unlocking: BootEffect[] = unlocked ? [{ type: 'mark-unlocked' }] : [];
  if (machine.boot.conversion !== null) {
    return step(machine, bootTransitions.toConverting(machine.boot), [
      ...unlocking,
      { type: 'run-conversion', dataKey, accessMode }
    ]);
  }
  return openingJournal(machine, dataKey, accessMode, unlocking);
}

function openingJournal(
  machine: BootMachine,
  dataKey: DataKey,
  accessMode: JournalAccessMode,
  before: BootEffect[] = []
): BootStep {
  return step(machine, bootTransitions.toBooting(bootTransitions.setAccessMode(machine.boot, accessMode)), [
    ...before,
    { type: 'open-journal', dataKey, accessMode }
  ]);
}

export function reduce(machine: BootMachine, event: BootEvent): BootStep {
  switch (event.type) {
    case 'started':
      return step({ ...machine, demo: event.demo }, machine.boot, [
        /* Before anything async: a gate is about to render, and it should do
           so in the person's theme and palette rather than the defaults. */
        { type: 'apply-cached-preferences' },
        { type: event.platform === 'android' ? 'survey-android' : 'survey-web' }
      ]);

    case 'web-surveyed': {
      const { passphraseKeystoreExists, deviceBoundKeystoreExists, plaintextJournalPresent, marker } = event;
      const surveyed = bootTransitions.setAccessMode(
        machine.boot,
        chooseJournalAccessMode({ passphraseKeystoreExists, deviceBoundKeystoreExists })
      );
      const journal = describeJournalState({
        keystoreExists: passphraseKeystoreExists || deviceBoundKeystoreExists,
        plaintextJournalPresent,
        marker
      });

      /* Nothing here needs a data key, so it happens before the gate renders
         rather than after somebody types a passphrase: ADR-0018's claim is
         false for as long as those plaintext files are readable. */
      if (journal === 'retire' && !machine.retired) {
        return step({ ...machine, retired: true }, surveyed, [{ type: 'finish-retirement' }]);
      }

      if (machine.demo) {
        if (journal === 'convert') return step(machine, surveyed, [{ type: 'wipe-demo-journal' }]);
        /* A reviewer may have changed the demo passphrase in Settings; the
           gate is the honest fallback, and that is `demo-unlock-failed`. */
        if (journal === 'unlock') return step(machine, surveyed, [{ type: 'demo-unlock' }]);
        return step(machine, surveyed, [{ type: 'demo-setup' }]);
      }

      /* Free space and the schema version, asked before anyone is made to
         choose a passphrase and write it down: a refusal leaves the plaintext
         journal exactly as it was. */
      if (journal === 'convert') {
        return step({ ...machine, conversionResumable: passphraseKeystoreExists }, surveyed, [
          { type: 'precheck-conversion' }
        ]);
      }

      /* Whatever the plaintext journal and the marker said, they have been
         dealt with by now: the plan left to make is the one the keystores
         describe on their own. */
      const plan = describeWebBootPlan({
        passphraseKeystoreExists,
        deviceBoundKeystoreExists,
        plaintextJournalPresent: false,
        marker: null
      });

      if (plan === 'auto-unlock') return step(machine, surveyed, [{ type: 'auto-unlock-device-bound' }]);
      return step(
        machine,
        plan === 'needs-unlock'
          ? bootTransitions.toNeedsUnlock(surveyed)
          : bootTransitions.toNeedsSetup(surveyed)
      );
    }

    case 'android-surveyed': {
      const { passphraseKeystoreExists, nativeDeviceKeyExists, plaintextJournalPresent } = event;
      const surveyed = bootTransitions.setAccessMode(
        machine.boot,
        chooseJournalAccessMode({
          passphraseKeystoreExists,
          deviceBoundKeystoreExists: nativeDeviceKeyExists
        })
      );
      const plan = describeAndroidBootPlan({
        passphraseKeystoreExists,
        nativeDeviceKeyExists,
        plaintextJournalPresent
      });

      switch (plan) {
        /* Rendered through i18n in +layout: this path is expected and needs a
           user sentence, not a raw SQLite failure string. */
        case 'plaintext-error':
          return step(machine, bootTransitions.toError(surveyed, 'android-plaintext-journal'));
        case 'needs-unlock':
          return step(machine, bootTransitions.toNeedsUnlock(surveyed));
        case 'needs-authentication':
          return step(machine, bootTransitions.toNeedsAuthentication(surveyed));
        case 'needs-setup':
          return step(machine, bootTransitions.toNeedsSetup(surveyed));
      }
    }

    case 'demo-journal-wiped':
      return step(machine, machine.boot, [{ type: 'demo-setup' }]);

    case 'demo-unlock-failed':
      return step(machine, bootTransitions.toNeedsUnlock(machine.boot));

    case 'conversion-prechecked': {
      if (!event.result.ok) {
        return step(machine, bootTransitions.toConversionRefused(machine.boot, event.result));
      }
      const options = { accessMode: 'passphrase', conversionRequired: true } as const;
      return step(
        machine,
        machine.conversionResumable
          ? bootTransitions.toNeedsUnlock(machine.boot, options)
          : bootTransitions.toNeedsSetup(machine.boot, options)
      );
    }

    case 'device-key-unavailable':
      return step(machine, bootTransitions.toNeedsDeviceRecovery(machine.boot));

    /* The authentication that unwrapped the key satisfies the casual-access
       gate too, the same way a typed passphrase does on the web: this is the
       strong case the spec allows app lock to stand down for. */
    case 'android-key-answered':
      return event.result.kind === 'key'
        ? withDataKey(machine, event.result.dataKey, 'device-bound', true)
        : step(machine, bootTransitions.toNeedsAuthentication(machine.boot, event.result));

    case 'key-obtained':
      return withDataKey(machine, event.dataKey, event.accessMode, event.unlocked);

    case 'conversion-progressed':
      return step(machine, bootTransitions.updateConversionProgress(machine.boot, event.progress));

    case 'converted':
      return openingJournal(machine, event.dataKey, event.accessMode);


    case 'journal-opened':
      return step(
        machine,
        bootTransitions.toReady(machine.boot, {
          journal: event.journal,
          persistDenied: event.persistDenied
        }),
        event.persistDenied ? [{ type: 'warn-persist-denied' }] : []
      );

    case 'journal-open-failed': {
      /* The rollback direction: older code has met a journal a newer build
         already migrated. Not the generic failure, because nothing is wrong
         with the journal and there is something to do about it. */
      if (event.error instanceof SchemaTooNewError) {
        return step(machine, bootTransitions.toSchemaTooNew(machine.boot));
      }

      /* A restore that was interrupted between unlinking the database and
         writing the copy over it. Finished rather than shown to anybody: the
         decision to restore was already made, and this is it reaching its
         end. */
      if (event.error instanceof InterruptedRestoreError) {
        return step(machine, machine.boot, [{ type: 'restore-previous-journal' }]);
      }

      /* Whether the failure screen can offer a way back is asked of the disk
         rather than assumed from the failure, so the error lands first and
         the answer follows. */
      return step(machine, bootTransitions.toError(machine.boot, describeError(event.error)), [
        { type: 'check-pre-migration-copy' }
      ]);
    }

    case 'pre-migration-copy-checked':
      return step(machine, bootTransitions.markErrorRecoverable(machine.boot, event.usable));

    case 'boot-failed':
      return step(machine, bootTransitions.toError(machine.boot, event.message));

    case 'passphrase-added':
      return step(machine, bootTransitions.setAccessMode(machine.boot, 'passphrase'));
  }
}

/** The one place a thrown value becomes a sentence for the error screen. */
export function describeError(error: unknown): string {
  return String((error as Error)?.message ?? error);
}

export type SkipSetupResult = 'ok' | 'needs-device-lock' | 'device-bound-unavailable';

/** What the "skip the passphrase" button has to say when the platform will not
    mint a device-bound key. A device with no lock screen is the one refusal
    with something to fix; everything else is the same dead end. */
export function skipSetupOutcome(result: AndroidKeyResult): SkipSetupResult {
  if (result.kind === 'key') return 'ok';
  return result.kind === 'refused' && result.authentication.wayForward === 'setDeviceLock'
    ? 'needs-device-lock'
    : 'device-bound-unavailable';
}
