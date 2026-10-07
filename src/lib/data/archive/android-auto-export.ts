import { isAndroid } from '$lib/platform';
import type { PreferenceValues } from '../prefs/catalogue';
import type { ArchiveSnapshot } from '../journal/archive';
import { ARCHIVE_FILE_EXTENSION } from './container';
import { exportFileName } from './deliver';
import { packArchive, type KeyDerivation, type PackWatch } from './pack';
import { portablePreferences } from './payload';
import { androidAutoExport, type AutoExportStatus } from './android-auto-export-bridge';

// Large archives can overflow argument limits if one giant spread is used.
const BASE64_CHUNK = 0x8000;

interface AndroidAutoExportSource {
  snapshot: ArchiveSnapshot;
  preferences: PreferenceValues;
}

type AndroidAutoExportResult =
  | { outcome: 'ok'; writtenAt: number }
  | { outcome: 'needs-destination' }
  | { outcome: 'cancelled' }
  | { outcome: 'failed'; reason: string };

interface AndroidAutoExportDeps {
  now?(): number;
  recordBackup(at: number): void;
  /** How far the pack has got, and a way to stop it (phase 9 audit ticket
      11). Passed by the export screen's "Back up now"; the scheduler
      leaves it out, since nobody is watching a background run. */
  watch?: PackWatch;
}

const toBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  for (let i = 0; i < bytes.length; i += BASE64_CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + BASE64_CHUNK));
  }
  return btoa(binary);
};

const fromBase64 = (text: string): Uint8Array<ArrayBuffer> =>
  Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

const reasonText = (error: unknown): string => {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  return 'auto-export failed';
};

const isDestinationFailure = (message: string): boolean =>
  message.includes('destination-revoked');

const isTransientFailure = (message: string): boolean =>
  message.includes('verification-failed') || message.includes('destination-full') || message.includes('partial-write');

const DAY_MS = 24 * 60 * 60 * 1000;

export function nextDueAt(status: Pick<AutoExportStatus, 'schedule' | 'lastSuccessAt'>): number {
  const span = status.schedule === 'weekly' ? 7 * DAY_MS : 30 * DAY_MS;
  return (status.lastSuccessAt ?? 0) + span;
}

export function isDue(status: Pick<AutoExportStatus, 'enabled' | 'destinationUri' | 'hasPassword' | 'schedule' | 'lastSuccessAt'>, now: number): boolean {
  if (!status.enabled || !status.destinationUri || !status.hasPassword) return false;
  return now >= nextDueAt(status);
}

function timestampedFileName(name: string, at: number, disguised: boolean): string {
  const base = exportFileName(name, ARCHIVE_FILE_EXTENSION, undefined, disguised).slice(0, -ARCHIVE_FILE_EXTENSION.length);
  const stamp = new Date(at).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  return `auto-${base}-${stamp}${ARCHIVE_FILE_EXTENSION}`;
}

async function disable(status: AutoExportStatus) {
  if (!status.enabled) return;
  await androidAutoExport.configure({ enabled: false, schedule: status.schedule });
}

/* Writes the file and says what happened. Whether a failure also reaches the
   phone is not decided here any more (phase 6 ticket 04): it used to take a
   `trigger` argument whose only job was to gate `notifyFailure`, and the
   notice now answers to the unprompted registry - a preference, quiet hours
   and the disguise - which is the auto-export scheduler's business, since the
   scheduler is the only caller a notification was ever right for. */
export async function runAndroidAutoExport(
  source: AndroidAutoExportSource,
  deps: AndroidAutoExportDeps
): Promise<AndroidAutoExportResult> {
  if (!isAndroid()) return { outcome: 'failed', reason: 'android-only' };

  const status = await androidAutoExport.status();
  if (!status.destinationUri) {
    await disable(status);
    return { outcome: 'needs-destination' };
  }

  const writtenAt = deps.now?.() ?? Date.now();
  const fileName = timestampedFileName(source.preferences.name, writtenAt, source.preferences.disguise);
  const derivation: KeyDerivation = async (salt, kdf) => {
    const { key } = await androidAutoExport.deriveKey({
      salt: toBase64(salt),
      kdf
    });
    if (!key) throw new Error('no-password');
    return fromBase64(key);
  };

  const body = packArchive(
    {
      journal: source.snapshot.journal,
      preferences: portablePreferences(source.preferences),
      files: source.snapshot.files,
      readFile: source.snapshot.readFile
    },
    derivation,
    undefined,
    deps.watch
  );

  let transferId: string | undefined;
  try {
    deps.watch?.signal?.throwIfAborted();
    const { createSHA256 } = await import('hash-wasm');
    const digest = await createSHA256();
    ({ transferId } = await androidAutoExport.beginBackup({ fileName }));
    let byteLength = 0;
    for await (const piece of body) {
      deps.watch?.signal?.throwIfAborted();
      digest.update(piece);
      await androidAutoExport.appendBackup({ transferId, offset: byteLength, base64: toBase64(piece) });
      byteLength += piece.length;
    }
    deps.watch?.signal?.throwIfAborted();
    const payload = { transferId, byteLength, sha256: digest.digest('hex') };
    try {
      await androidAutoExport.finishBackup(payload);
    } catch (error) {
      const first = reasonText(error);
      if (!isTransientFailure(first)) throw error;
      await androidAutoExport.finishBackup(payload);
    }
    deps.recordBackup(writtenAt);
    return { outcome: 'ok', writtenAt };
  } catch (error) {
    /* A stopped pack is an answer, not a failure (ADR-0070): no completed archive
       reached the folder and nothing was stamped, so the screen has
       nothing to apologise for and disabling the schedule on it would be
       wrong. Checked before the reason strings below, because an
       AbortError's message is not one of them. */
    if ((error as Error)?.name === 'AbortError') return { outcome: 'cancelled' };
    const reason = reasonText(error);
    if (isDestinationFailure(reason)) {
      await disable(status);
      return { outcome: 'needs-destination' };
    }
    return { outcome: 'failed', reason };
  } finally {
    if (transferId) await androidAutoExport.abortBackup({ transferId }).catch(() => {});
  }
}
