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
   this text is unreadable. It is encrypted under the session data key, which
   exists for as long as the journal is open, so nothing new has to be kept
   anywhere. A draft that outlives a reset then decrypts to nothing, which is
   the right outcome rather than a loss: there is no journal left for it to
   belong to.

   Encrypting makes both halves async, and everything that can go wrong on
   the way back - a foreign key, a mirror from an older build, plain garbage -
   reads as no draft at all, the same discard the shape check has always
   done. */

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

/** `journalKey` is awaited rather than read, and asked per call rather than
    captured. The editor mounts while boot is still finishing, well before
    there is a key at all, so a synchronous read finds none and a restore
    would conclude there is no draft - which is how this arrived: the mirror
    was written and then never read back. Waiting for the open journal's key
    also means a mirror is only ever written while there is a journal for it
    to belong to. */
export function localStorageEntryDraft(
  journalKey: () => Promise<Uint8Array<ArrayBuffer>>
): EntryDraftStore {
  /* The store key is the additional authenticated data, so a mirror copied
     to another localStorage key fails to decrypt instead of coming back as
     some other screen's draft (the same binding encrypted-file-store.ts
     gives a photo's file name). */
  const boundTo = new TextEncoder().encode(ENTRY_DRAFT_STORE_KEY) as Uint8Array<ArrayBuffer>;

  /* Every keystroke starts a write and encryption is async, so two writes
     can be in flight at once. Only the newest is allowed to land: without
     this the mirror could end up holding an older draft than the screen, and
     a write still in flight when the editor unmounts could put one back
     after clear() took it. */
  let latest = 0;

  return {
    async read() {
      const key = await journalKey();
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
      /* Sequenced before the key is awaited, not after: a write that starts
         while the journal is still opening must still lose to a later edit,
         and both are waiting on the same key. */
      const mine = ++latest;
      const key = await journalKey();
      if (mine !== latest) return; // a later edit, or an unmount, got here first
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
      /* Counts as the newest write, so anything still encrypting when the
         editor unmounts is dropped instead of landing after this. The short
         window the mirror is readable in is the whole point of clearing it. */
      ++latest;
      try {
        localStorage.removeItem(ENTRY_DRAFT_STORE_KEY);
      } catch {
        /* nothing to clear if it could not be written in the first place */
      }
    }
  };
}
