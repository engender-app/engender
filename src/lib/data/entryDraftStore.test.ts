/* What the draft mirror will accept back off storage. Everything here is
   about rejecting a snapshot rather than reading one: a draft that fails
   validation is discarded, which costs one unsaved screen, while a draft
   that is wrongly accepted reaches the editor half-shaped.

   The second half covers the encryption the mirror now carries (sec-audit
   02, finding G-01): what lands in localStorage is ciphertext under the
   session data key, and everything that will not decrypt back into a draft
   takes the same discard path a malformed one always took. */

import { test, vi } from 'vitest';
import assert from 'node:assert/strict';
import {
  ENTRY_DRAFT_STORE_KEY,
  isPersistedEntryDraft,
  localStorageEntryDraft
} from './entryDraftStore.ts';
import type { PersistedEntryDraft } from './entryDraftPersistence.ts';

const draft = (bodyRegions: unknown) => ({
  id: undefined,
  epochDay: 1,
  timestamp: 0,
  mood: 3,
  note: '',
  dims: {},
  tags: [],
  bodyRegions,
  removedPhotoIds: [],
  removedRecordingIds: [],
  removedVideoIds: []
});

test('a region carrying both axes, one axis, or neither is accepted', () => {
  assert.equal(isPersistedEntryDraft(draft({ chest: { dysphoria: 40, euphoria: 65 } })), true);
  assert.equal(isPersistedEntryDraft(draft({ chest: { dysphoria: null, euphoria: 65 } })), true);
  // The shape a picked-but-untouched region has while the editor is open.
  assert.equal(isPersistedEntryDraft(draft({ chest: { dysphoria: null, euphoria: null } })), true);
  assert.equal(isPersistedEntryDraft(draft({})), true);
});

test('a draft saved before a region carried two axes is rejected, not half-read', () => {
  // The pre-ticket-31 shape stored a bare number per region. Accepting it
  // would index an axis off a number and send undefined down to the insert.
  assert.equal(isPersistedEntryDraft(draft({ chest: 70 })), false);
  assert.equal(isPersistedEntryDraft(draft({ chest: null })), false);
  assert.equal(isPersistedEntryDraft(draft({ chest: { dysphoria: 'a lot', euphoria: null } })), false);
});

/* Node has no localStorage (ADR: ticket 03's node tier), so the mirror gets
   a Map standing in for one. WebCrypto is real here - Node's own - which is
   what makes the encryption itself testable outside a browser. */
function fakeLocalStorage() {
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key)
  } satisfies Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>);
  return values;
}

const KEY = new Uint8Array(32).fill(7) as Uint8Array<ArrayBuffer>;

const NOTE = 'woke up early and my voice sat lower than it has in weeks';

const persisted = (note: string): PersistedEntryDraft => ({
  id: undefined,
  epochDay: 20000,
  timestamp: 1700000000000,
  mood: 4,
  note,
  dims: { comfort: 3 },
  tags: ['tag-voice'],
  bodyRegions: { chest: { dysphoria: 40, euphoria: null } },
  removedPhotoIds: [],
  removedRecordingIds: [],
  removedVideoIds: []
});

test('a mirrored draft comes back through a write and read, so a killed process still restores it', async () => {
  fakeLocalStorage();
  const store = localStorageEntryDraft(async () => KEY);

  await store.write(persisted(NOTE));

  // `id: undefined` does not survive JSON, and never did - the draft of a
  // new entry has no id, and draftMatchesRoute() reads that as "no id" the
  // same way either spelling does.
  const { id: _id, ...withoutId } = persisted(NOTE);
  assert.deepEqual(await store.read(), withoutId);

  // An existing entry's id does have to survive, or the restored draft
  // would not be matched back to the entry it was editing.
  await store.write({ ...persisted(NOTE), id: 41 });
  assert.equal((await store.read())?.id, 41);
  vi.unstubAllGlobals();
});

test('what sits in localStorage holds none of the note, the tags or the region values', async () => {
  const values = fakeLocalStorage();
  const store = localStorageEntryDraft(async () => KEY);

  await store.write(persisted(NOTE));

  const stored = values.get(ENTRY_DRAFT_STORE_KEY)!;
  assert.ok(stored.length > 0);
  for (const secret of [NOTE, 'voice', 'comfort', 'chest', '20000']) {
    assert.equal(stored.includes(secret), false, `${secret} is readable in the mirror`);
  }
  vi.unstubAllGlobals();
});

test('a mirror written by an older build reads as no draft rather than as plaintext', async () => {
  const values = fakeLocalStorage();
  // Exactly what the pre-encryption mirror wrote: the snapshot as bare JSON.
  values.set(ENTRY_DRAFT_STORE_KEY, JSON.stringify(persisted(NOTE)));

  assert.equal(await localStorageEntryDraft(async () => KEY).read(), null);
  vi.unstubAllGlobals();
});

test('a mirror that will not decrypt is discarded rather than throwing at the editor', async () => {
  fakeLocalStorage();
  await localStorageEntryDraft(async () => KEY).write(persisted(NOTE));

  // The state a draft is in after a reset: the journal it belonged to is
  // gone, so the key that would read it is a different key.
  const otherKey = new Uint8Array(32).fill(9) as Uint8Array<ArrayBuffer>;
  assert.equal(await localStorageEntryDraft(async () => otherKey).read(), null);
  vi.unstubAllGlobals();
});

test('ciphertext that decrypts to something which is not a draft is discarded too', async () => {
  const values = fakeLocalStorage();
  const store = localStorageEntryDraft(async () => KEY);

  await store.write({ ...persisted(NOTE), note: 'kept' });
  const good = values.get(ENTRY_DRAFT_STORE_KEY)!;

  // Same key, same nonce handling, a payload that simply is not a draft.
  await store.write({ epochDay: 20000 } as unknown as PersistedEntryDraft);
  assert.notEqual(values.get(ENTRY_DRAFT_STORE_KEY), good);
  assert.equal(await store.read(), null);
  vi.unstubAllGlobals();
});

test('garbage in the mirror reads as no draft, not as an exception', async () => {
  const values = fakeLocalStorage();
  values.set(ENTRY_DRAFT_STORE_KEY, 'not base64 at all !!!');

  assert.equal(await localStorageEntryDraft(async () => KEY).read(), null);
  vi.unstubAllGlobals();
});

test('the last edit is what stays, even when an earlier write finishes after it', async () => {
  const values = fakeLocalStorage();
  const store = localStorageEntryDraft(async () => KEY);

  // Every keystroke starts a write, and encryption is async: without an
  // ordering guard whichever call happens to finish last would win, and the
  // mirror could hold an older draft than the one on screen.
  await Promise.all([store.write(persisted('first')), store.write(persisted('second'))]);

  assert.equal((await store.read())?.note, 'second');
  assert.ok(values.has(ENTRY_DRAFT_STORE_KEY));
  vi.unstubAllGlobals();
});

test('a read that starts before the journal is open still gets its draft once the key arrives', async () => {
  fakeLocalStorage();
  await localStorageEntryDraft(async () => KEY).write(persisted(NOTE));

  /* The editor mounts around 70ms before boot hands over the key, so this is
     the ordinary case rather than an edge one: a store that read the key
     synchronously found none, returned "no draft", and lost the entry a
     killed process had left behind - which is exactly what the walkthrough
     caught. */
  let handOver: (key: Uint8Array<ArrayBuffer>) => void = () => {};
  const opening = new Promise<Uint8Array<ArrayBuffer>>((resolve) => {
    handOver = resolve;
  });
  const store = localStorageEntryDraft(() => opening);

  const reading = store.read();
  handOver(KEY);

  assert.equal((await reading)?.note, NOTE);
  vi.unstubAllGlobals();
});

test('clearing on unmount beats a write that was already in flight', async () => {
  const values = fakeLocalStorage();
  let handOver: (key: Uint8Array<ArrayBuffer>) => void = () => {};
  const opening = new Promise<Uint8Array<ArrayBuffer>>((resolve) => {
    handOver = resolve;
  });
  const store = localStorageEntryDraft(() => opening);

  /* The last keystroke's write and the editor's unmount, in that order.
     Without this the write lands after the clear and the mirror survives an
     unmount that was supposed to end it - which is the whole reason the
     window this thing is readable in is short. */
  const writing = store.write(persisted(NOTE));
  store.clear();
  handOver(KEY);
  await writing;

  assert.equal(values.has(ENTRY_DRAFT_STORE_KEY), false);
  vi.unstubAllGlobals();
});

test('clear takes the mirror without waiting for a key', () => {
  const values = fakeLocalStorage();
  values.set(ENTRY_DRAFT_STORE_KEY, 'whatever was there');

  // A journal that never opens: clearing is a removeItem and owes it nothing.
  localStorageEntryDraft(() => new Promise<Uint8Array<ArrayBuffer>>(() => {})).clear();

  assert.equal(values.has(ENTRY_DRAFT_STORE_KEY), false);
  vi.unstubAllGlobals();
});
