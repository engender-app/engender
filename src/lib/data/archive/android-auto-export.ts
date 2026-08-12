import { isAndroid } from '$lib/platform';
import type { PreferenceValues } from '../prefs/catalogue';
import type { ArchiveSnapshot } from '../journal/archive';
import { ARCHIVE_FILE_EXTENSION } from './container';
import { exportFileName } from './deliver';
import { packArchive } from './pack';
import { portablePreferences } from './payload';
import { androidAutoExport, type AutoExportStatus } from './android-auto-export-bridge';

// Large archives can overflow argument limits if one giant spread is used.
const BASE64_CHUNK = 0x8000;

export interface AndroidAutoExportSource {
  snapshot: ArchiveSnapshot;
  preferences: PreferenceValues;
  password: string;
}

export type AndroidAutoExportResult =
  | { outcome: 'ok'; writtenAt: number }
  | { outcome: 'needs-destination' }
  | { outcome: 'failed'; reason: string };

export interface AndroidAutoExportDeps {
  now?(): number;
  recordBackup(at: number): void;
}

const toBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  for (let i = 0; i < bytes.length; i += BASE64_CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + BASE64_CHUNK));
  }
  return btoa(binary);
};

async function collect(body: AsyncIterable<Uint8Array>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const piece of body) {
    chunks.push(piece);
    total += piece.length;
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

const reasonText = (error: unknown): string => {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  return 'auto-export failed';
};

const isDestinationFailure = (message: string): boolean =>
  message.includes('destination-revoked') || message.includes('destination-unavailable');

function timestampedFileName(name: string, at: number): string {
  const base = exportFileName(name, ARCHIVE_FILE_EXTENSION).slice(0, -ARCHIVE_FILE_EXTENSION.length);
  const stamp = new Date(at).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  return `${base}-${stamp}${ARCHIVE_FILE_EXTENSION}`;
}

async function disable(status: AutoExportStatus) {
  if (!status.enabled) return;
  await androidAutoExport.configure({ enabled: false, schedule: status.schedule });
}

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
  const fileName = timestampedFileName(source.preferences.name, writtenAt);
  const body = packArchive(
    {
      journal: source.snapshot.journal,
      preferences: portablePreferences(source.preferences),
      files: source.snapshot.files,
      readFile: source.snapshot.readFile
    },
    source.password
  );

  try {
    const bytes = await collect(body);
    await androidAutoExport.writeBackup({ fileName, base64: toBase64(bytes) });
    deps.recordBackup(writtenAt);
    return { outcome: 'ok', writtenAt };
  } catch (error) {
    const reason = reasonText(error);
    if (isDestinationFailure(reason)) {
      await disable(status);
      return { outcome: 'needs-destination' };
    }
    return { outcome: 'failed', reason };
  }
}
