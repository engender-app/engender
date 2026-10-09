import { seedCompleteArchiveJournal } from '../src/lib/data/journal/test-support/complete-archive-journal';
import { ARCHIVE_SECTION_NAMES } from '../src/lib/data/journal/archiveSections';
import type { Journal, PhotoFileStore } from '../src/lib/data/journal/journal';
import type { SqliteDriver } from '../src/lib/data/sqlite/driver';
import type { ArchiveJournal } from '../src/lib/data/archive/payload';
import photoUrl from './archive-recovery-media/photo.jpg?url';
import audioUrl from './archive-recovery-media/audio.webm?url';
import videoUrl from './archive-recovery-media/video.webm?url';

export const RECOVERY_PASSWORD = 'invented installation loss password';

export async function seedRecoveryJournal(driver: SqliteDriver, journal: Journal) {
  const load = async (url: string) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`missing recovery media: ${url}`);
    return new Uint8Array(await response.arrayBuffer());
  };
  const [photo, audio, video] = await Promise.all([load(photoUrl), load(audioUrl), load(videoUrl)]);
  await seedCompleteArchiveJournal(driver, journal, (label) =>
    label === 'a video note' ? video :
    ['a voice note', 'passage', 'vowel'].includes(label) ? audio : photo);
  const snapshot = await journal.archive.snapshot();
  for (const section of ARCHIVE_SECTION_NAMES) {
    if (!snapshot.journal[section].length) throw new Error(`unseeded Archive section: ${section}`);
  }
}

export async function digest(bytes: Uint8Array) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>)), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function journalEvidence(journal: Journal, files: PhotoFileStore) {
  const snapshot = await journal.archive.snapshot();
  const attachments: Record<string, { length: number; sha256: string }> = {};
  for (const file of snapshot.files) {
    const bytes = await files.read(file.name);
    if (!bytes) throw new Error(`missing attachment: ${file.name}`);
    attachments[file.name] = { length: bytes.length, sha256: await digest(bytes) };
  }
  return { journal: snapshot.journal, attachments };
}

export type RecoveryEvidence = Awaited<ReturnType<typeof journalEvidence>>;

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
  return JSON.stringify(value);
}

export function reconcileRecovery(actual: RecoveryEvidence, expected: RecoveryEvidence) {
  for (const section of ARCHIVE_SECTION_NAMES) {
    // SQLite rowids differ between installations; row order is not portable identity.
    const rows = (journal: ArchiveJournal) => journal[section].map((row) => canonical(section === 'entries' ? { ...row, tags: [...(row as ArchiveJournal['entries'][number]).tags].sort() } : row)).sort();
    if (canonical(rows(actual.journal)) !== canonical(rows(expected.journal))) throw new Error(`restored section differs: ${section}: ${canonical(rows(actual.journal))} expected ${canonical(rows(expected.journal))}`);
  }
  if (canonical(actual.attachments) !== canonical(expected.attachments)) throw new Error('restored attachment metadata or bytes differ');
}
