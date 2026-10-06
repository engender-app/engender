/* Every decision a boot makes, in one rune-free place (phase 5 audit ticket
   14).

   boot-state.ts owns whether a transition is *allowed*. This owns which one is
   *taken*: web and Android, first run and unlock, a plaintext journal that cannot
   be opened by this build, a key the platform will not hand over, a schema a
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
  chooseJournalAccessMode,
  describeAndroidBootPlan,
  describeWebBootPlan,
  type JournalAccessMode
} from '../data/journal-access-mode.ts';
import type { CachedAccessMode } from '../data/prefs/boot-cache.ts';
import type { JournalSecretSource } from '../crypto/keystore.ts';
import type { Journal } from '../data/journal/journal.ts';
import {
  Fts5UnavailableError,
  InterruptedRestoreError,
  JournalBelowBaselineError,
  SchemaTooNewError
} from '../data/sqlite/migration-runner.ts';
import type { AndroidKeyResult } from '../lock/android-key.ts';
import { bootStates, bootTransitions, type BootFailure, type BootState } from './boot-state.ts';

type BootPlatform = 'web' | 'android';

/** The data key never lands in `BootState` - it travels through the machine
    from the platform that unwrapped it to the effect that opens the journal
    under it, and nothing reactive ever sees it. */
type DataKey = Uint8Array<ArrayBuffer>;

export type BootEvent =
  /** The app came up. Platform and demo build are facts, not branches. */
  | { type: 'started'; platform: BootPlatform; demo: boolean }
  /** What the web found: which kind of secret the keystore names (null for
      none), a device-bound key, and unsupported legacy storage. */
  | {
      type: 'web-surveyed';
      keystoreSecretSource: JournalSecretSource | null;
      deviceBoundKeystoreExists: boolean;
      legacyStoragePresent: boolean;
    }
  /** What Android found. No marker and no OPFS: this is the first build that
      runs on a phone, so there is nothing from before encryption to convert. */
  | {
      type: 'android-surveyed';
      keystoreSecretSource: JournalSecretSource | null;
      nativeDeviceKeyExists: boolean;
      nativeDeviceKeyAuthRequired?: boolean;
      plaintextJournalPresent: boolean;
    }
  | { type: 'demo-unlock-failed' }
  | { type: 'device-key-unavailable' }
  /** What Android Keystore answered, whole. Which of the two destinations it
      means is decided here, not by the caller reading `kind`. */
  | { type: 'android-key-answered'; result: AndroidKeyResult }
  /** `unlocked` is whether somebody authenticated to get this key. A typed
      passphrase and an Android prompt both satisfy the casual-access gate;
      a key the platform handed over unasked does not. */
  | { type: 'key-obtained'; dataKey: DataKey; accessMode: JournalAccessMode; unlocked: boolean }
  | { type: 'journal-opened'; journal: Journal }
  /** The persistence request came back denied, whenever the browser answers
      (ticket 202) - decoupled from `journal-opened` because that no longer
      waits for it. */
  | { type: 'persist-request-denied' }
  /** However boot() ended badly, unread. Three very different destinations
      hide in this one value, and telling them apart is an ordering decision. */
  | { type: 'journal-open-failed'; error: unknown }
  | { type: 'pre-migration-copy-checked'; usable: boolean }
  | { type: 'boot-failed'; message: string }
  /** Settings, not boot: the access mode was changed while the journal was
      open, so the same data key is now wrapped under a different secret. */
  | { type: 'access-mode-changed'; accessMode: JournalAccessMode }
  /** A web lock closed the journal (after-release ticket 10). The boot is
      still done - nothing is surveyed or migrated again - but the handle it
      published is built over the key the lock lets go of, so it goes too. */
  | { type: 'journal-closed' }
  /** The unlock after that lock opened it again under the same key. */
  | { type: 'journal-reopened'; journal: Journal };

export type BootEffect =
  | { type: 'apply-cached-preferences' }
  | { type: 'mark-unlocked' }
  | { type: 'survey-web' }
  | { type: 'survey-android' }
  | { type: 'demo-setup' }
  | { type: 'demo-unlock' }
  | { type: 'auto-unlock-device-bound' }
  | { type: 'auto-unlock-android' }
  | { type: 'open-journal'; dataKey: DataKey; accessMode: JournalAccessMode }
  | { type: 'restore-previous-journal' }
  | { type: 'check-pre-migration-copy' }
  | { type: 'warn-persist-denied' };

export interface BootMachine {
  boot: BootState;
  /** Demo journals use a fixed passphrase, but still refuse legacy storage. */
  demo: boolean;
  /** A `persist-request-denied` seen before the journal reached `ready`
      (ticket 202: the request is no longer awaited, so its answer can land
      before or after `journal-opened` - Chromium in particular denies fast
      enough that the race is not exotic). Consumed and cleared the moment
      `journal-opened` arrives; a denial seen after `ready` is applied right
      away instead, without ever setting this. */
  persistDeniedPending: boolean;
}

interface BootStep {
  machine: BootMachine;
  effects: BootEffect[];
}

export function initialBoot(cachedAccessMode: CachedAccessMode | null = null): BootMachine {
  return {
    boot:
      cachedAccessMode === null
        ? bootStates.booting(cachedAccessMode)
        : bootStates.needsUnlock(cachedAccessMode),
    demo: false,
    persistDeniedPending: false
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
  if (machine.boot.status === 'legacy-refused') return step(machine, machine.boot);
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
      const { keystoreSecretSource, deviceBoundKeystoreExists, legacyStoragePresent } = event;
      const surveyed = bootTransitions.setAccessMode(
        machine.boot,
        chooseJournalAccessMode({ keystoreSecretSource, deviceBoundKeystoreExists })
      );
      const plan = describeWebBootPlan({ keystoreSecretSource, deviceBoundKeystoreExists, legacyStoragePresent });
      // Refuse before any key creation, unlock or demo reset can change storage.
      if (plan === 'legacy-refused') return step(machine, bootTransitions.toLegacyRefused(surveyed));
      if (machine.demo) {
        return step(machine, surveyed, [{ type: plan === 'needs-setup' ? 'demo-setup' : 'demo-unlock' }]);
      }

      if (plan === 'auto-unlock') return step(machine, surveyed, [{ type: 'auto-unlock-device-bound' }]);
      return step(
        machine,
        plan === 'needs-unlock'
          ? bootTransitions.toNeedsUnlock(surveyed)
          : bootTransitions.toNeedsSetup(surveyed)
      );
    }

    case 'android-surveyed': {
      const {
        keystoreSecretSource,
        nativeDeviceKeyExists,
        nativeDeviceKeyAuthRequired,
        plaintextJournalPresent
      } = event;
      const surveyed = bootTransitions.setAccessMode(
        machine.boot,
        chooseJournalAccessMode({
          keystoreSecretSource,
          deviceBoundKeystoreExists: nativeDeviceKeyExists,
          nativeDeviceKeyAuthRequired
        })
      );
      const plan = describeAndroidBootPlan({
        keystoreSecretSource,
        nativeDeviceKeyExists,
        nativeDeviceKeyAuthRequired,
        plaintextJournalPresent
      });

      switch (plan) {
        /* Rendered through i18n in +layout: this path is expected and needs a
           user sentence, not a raw SQLite failure string. */
        case 'plaintext-error':
          return step(machine, bootTransitions.toError(surveyed, 'android-plaintext-journal', 'android-plaintext'));
        case 'needs-unlock':
          return step(machine, bootTransitions.toNeedsUnlock(surveyed));
        case 'needs-authentication':
          return step(machine, bootTransitions.toNeedsAuthentication(surveyed));
        case 'auto-unlock':
          return step(machine, surveyed, [{ type: 'auto-unlock-android' }]);
        case 'needs-setup':
          return step(machine, bootTransitions.toNeedsSetup(surveyed));
      }
    }

    case 'demo-unlock-failed':
      return step(machine, bootTransitions.toNeedsUnlock(machine.boot));

    case 'device-key-unavailable':
      return step(machine, bootTransitions.toNeedsDeviceRecovery(machine.boot));

    /* The authentication that unwrapped the key satisfies the casual-access
       gate too, the same way a typed passphrase does on the web: this is the
       strong case the spec allows app lock to stand down for. */
    case 'android-key-answered':
      return event.result.kind === 'key'
        ? withDataKey(machine, event.result.dataKey, machine.boot.accessMode ?? 'device-bound', true)
        : step(machine, bootTransitions.toNeedsAuthentication(machine.boot, event.result));

    case 'key-obtained':
      return withDataKey(machine, event.dataKey, event.accessMode, event.unlocked);

    case 'journal-opened': {
      const ready = bootTransitions.toReady(machine.boot, { journal: event.journal });
      /* A denial that arrived before ready is applied here rather than lost
         (ticket 202): the request is no longer awaited, so nothing orders it
         against journal-opened any more. */
      if (machine.persistDeniedPending) {
        return step({ ...machine, persistDeniedPending: false }, bootTransitions.markPersistDenied(ready), [
          { type: 'warn-persist-denied' }
        ]);
      }
      return step(machine, ready);
    }

    case 'persist-request-denied':
      /* Not ready yet: nothing to mark denied on, so the fact is carried on
         the machine instead and applied once journal-opened arrives. */
      if (machine.boot.status !== 'ready') {
        return step({ ...machine, persistDeniedPending: true }, machine.boot);
      }
      return step(machine, bootTransitions.markPersistDenied(machine.boot), [
        { type: 'warn-persist-denied' }
      ]);

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

      /* A development build's journal: the copy a restore would put back is
         the same old journal, so there is nothing to ask the disk about. The
         screen offers the way out instead (after-release ticket 09). */
      if (event.error instanceof JournalBelowBaselineError) {
        return step(machine, bootTransitions.toError(machine.boot, describeError(event.error), 'below-baseline'));
      }

      /* Whether the failure screen can offer a way back is asked of the disk
         rather than assumed from the failure, so the error lands first and
         the answer follows. */
      return step(
        machine,
        bootTransitions.toError(machine.boot, describeError(event.error), classifyFailure(event.error)),
        [{ type: 'check-pre-migration-copy' }]
      );
    }

    case 'pre-migration-copy-checked':
      return step(machine, bootTransitions.markErrorRecoverable(machine.boot, event.usable));

    case 'boot-failed':
      return step(machine, bootTransitions.toError(machine.boot, event.message, classifyFailure(event.message)));

    case 'access-mode-changed':
      return step(machine, bootTransitions.setAccessMode(machine.boot, event.accessMode));

    /* Only from ready: a lock or an unlock landing after the boot moved
       somewhere else has no handle to take or give back. */
    case 'journal-closed':
      return step(machine, bootTransitions.withJournal(machine.boot, null));

    case 'journal-reopened':
      return step(machine, bootTransitions.withJournal(machine.boot, event.journal));
  }
}

/** The one place a thrown value becomes text. Not a sentence for anybody to
    read on the failure screen any more (after-release ticket 09): it is the
    detail a bug report carries, and `classifyFailure` is what the screen
    speaks from. */
export function describeError(error: unknown): string {
  return String((error as Error)?.message ?? error);
}

/** Which named failure a thrown value or its text is. By type where the type
    survives - a failure from a worker or a bridge arrives as text only, so
    the text is read too. Unnamed text is `unknown`, never a guess. */
function classifyFailure(error: unknown): BootFailure {
  if (error instanceof JournalBelowBaselineError) return 'below-baseline';
  if (error instanceof Fts5UnavailableError) return 'engine';
  const text = typeof error === 'string' ? error : describeError(error);
  if (/older than this build's baseline/i.test(text)) return 'below-baseline';
  if (/not a database|SQLITE_NOTADB/i.test(text)) return 'unreadable';
  if (/database worker stopped|FTS5 is not available/i.test(text)) return 'engine';
  return 'unknown';
}

export type DeviceBoundSetupResult = 'ok' | 'needs-device-lock' | 'device-bound-unavailable';

/** What choosing device-bound mode has to say when the platform will not mint
    the key. A device with no lock screen is the one refusal with something to
    fix; everything else is the same dead end.

    Named for the mode rather than for a "skip" (ticket 53): device-bound is
    one of the module's equal choices now, not the way past a wall. */
export function deviceBoundSetupOutcome(result: AndroidKeyResult): DeviceBoundSetupResult {
  if (result.kind === 'key') return 'ok';
  return result.kind === 'refused' && result.authentication.wayForward === 'setDeviceLock'
    ? 'needs-device-lock'
    : 'device-bound-unavailable';
}
