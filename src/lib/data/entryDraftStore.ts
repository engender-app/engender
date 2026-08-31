/* Where an in-progress entry draft survives a killed process (ticket 14),
   the same read/write/clear shape as the boot cache and the PIN-attempt
   store (ADR-0009's mirror-outside-SQLite pattern): the journal stays the
   source of truth for saved entries, this is a throwaway mirror the editor
   keeps in step with itself and clears the moment it unmounts, so only a
   process death mid-edit ever leaves it behind to be found.

   What is left behind is ciphertext (sec-audit 02, finding G-01). The
   snapshot is journal content - the note, the mood, the tags, the region
   feelings - so writing it as bare JSON put readable journal text in the
   WebView's localStorage, next to the database whose whole purpose is that
   this text is unreadable. It is encrypted under the session data key,
   which is in memory exactly when an editor is mounted, so nothing new has
   to be kept anywhere. A draft that outlives a reset then decrypts to
   nothing, which is the right outcome rather than a loss: there is no
   journal left for it to belong to.

   Encrypting makes the write async, and everything that can go wrong on the
   way back - no key, a foreign key, a mirror from an older build, plain
   garbage - reads as no draft at all, the same discard the shape check has
   always done. */

import { decrypt, encrypt } from '../crypto/aesGcm';
import type { PersistedEntryDraft } from './entryDraftPersistence';

export interface EntryDraftStore {
  read(): Promise<PersistedEntryDraft | null>;
  write(draft: PersistedEntryDraft): Promise<void>;
  clear(): void;
}

export const ENTRY_DRAFT_STORE_KEY = 'gender-diary-entry-draft';

const NONCE_LENGTH = 12;

// Hand-editable storage: anything that is not this shape is no draft at
// all, the same rule attempt-store.ts applies to its own mirror.
export function isPersistedEntryDraft(value: unknown): value is PersistedEntryDraft {
  if (!value || typeof value !== 'object') return false;
  const d = value as Partial<PersistedEntryDraft>;
  return (
    (d.id === undefined || Number.isFinite(d.id)) &&
    Number.isFinite(d.epochDay) &&
    Number.isFinite(d.timestamp) &&
    (d.mood === null || Number.isFinite(d.mood)) &&
    typeof d.note === 'string' &&
    typeof d.dims === 'object' &&
    d.dims !== null &&
    !Array.isArray(d.dims) &&
    Array.isArray(d.tags) &&
    typeof d.bodyRegions === 'object' &&
    d.bodyRegions !== null &&
    !Array.isArray(d.bodyRegions) &&
    Object.values(d.bodyRegions).every(isBodyRegionFeeling) &&
    Array.isArray(d.removedPhotoIds)
  );
}

/* A draft saved before ticket 31 holds a bare number per region, not a pair.
   Checked rather than assumed: without this the old shape passes, and the
   editor then reads `values[id][axis]` off a number, writes an axis onto a
   spread of it and sends `undefined` down to the INSERT. A stale draft is
   cheap to throw away - it is one unsaved screen, and the read() around this
   already discards anything that fails - and there is no shape to migrate
   from, since the two are not the same kind of thing. */
function isBodyRegionFeeling(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const f = value as { dysphoria?: unknown; euphoria?: unknown };
  const axis = (v: unknown) => v === null || Number.isFinite(v);
  return axis(f.dysphoria) && axis(f.euphoria);
}

/* Chunked rather than `btoa(String.fromCharCode(...bytes))`, the spelling
   the keystore metadata uses: a long note's ciphertext is tens of kilobytes
   and spreading that many arguments overflows the call stack. */
function toBase64(bytes: Uint8Array): string {
  let text = '';
  for (let at = 0; at < bytes.length; at += 8192) {
    text += String.fromCharCode(...bytes.subarray(at, at + 8192));
  }
  return btoa(text);
}

const fromBase64 = (text: string): Uint8Array<ArrayBuffer> =>
  Uint8Array.from(atob(text), (char) => char.charCodeAt(0));

/** `journalKey` is read per call rather than captured: the editor is mounted
    across a whole session and the key it hands over is whatever the boot
    store holds now, or null when there is no open journal to mirror for. */
export function localStorageEntryDraft(journalKey: () => Uint8Array<ArrayBuffer> | null): EntryDraftStore {
  /* The store key is the additional authenticated data, so a mirror copied
     to another localStorage key fails to decrypt instead of coming back as
     some other screen's draft (the same binding encrypted-file-store.ts
     gives a photo's file name). */
  const boundTo = new TextEncoder().encode(ENTRY_DRAFT_STORE_KEY) as Uint8Array<ArrayBuffer>;

  /* Every keystroke starts a write and encryption is async, so two writes
     can be in flight at once. Only the newest is allowed to land: without
     this the mirror could end up holding an older draft than the screen. */
  let latest = 0;

  return {
    async read() {
      const key = journalKey();
      if (key === null) return null;
      try {
        const raw = localStorage.getItem(ENTRY_DRAFT_STORE_KEY);
        if (!raw) return null;
        const stored = fromBase64(raw);
        const plaintext = await decrypt(
          key,
          stored.subarray(0, NONCE_LENGTH) as Uint8Array<ArrayBuffer>,
          stored.subarray(NONCE_LENGTH) as Uint8Array<ArrayBuffer>,
          boundTo
        );
        const parsed: unknown = JSON.parse(new TextDecoder().decode(plaintext));
        return isPersistedEntryDraft(parsed) ? parsed : null;
      } catch {
        /* A mirror from a build before this one, one written under a key a
           reset has since replaced, or a hand-edited value: all of it is one
           unsaved screen, and none of it is worth throwing at the editor. */
        return null;
      }
    },
    async write(draft) {
      const key = journalKey();
      if (key === null) return; // nothing to encrypt under, so nothing is mirrored
      const mine = ++latest;
      try {
        const plaintext = new TextEncoder().encode(JSON.stringify(draft)) as Uint8Array<ArrayBuffer>;
        const { nonce, ciphertext } = await encrypt(key, plaintext, boundTo);
        if (mine !== latest) return; // a later edit already wrote itself
        const stored = new Uint8Array(nonce.length + ciphertext.length);
        stored.set(nonce);
        stored.set(ciphertext, nonce.length);
        localStorage.setItem(ENTRY_DRAFT_STORE_KEY, toBase64(stored));
      } catch {
        /* storage full / private mode - a killed process just loses the draft */
      }
    },
    clear() {
      try {
        localStorage.removeItem(ENTRY_DRAFT_STORE_KEY);
      } catch {
        /* nothing to clear if it could not be written in the first place */
      }
    }
  };
}
