import { test, vi } from 'vitest';
import assert from 'node:assert/strict';
import { entrySessionCore, initialEntrySession, type EntrySessionOptions } from './entrySession';
import { serializeDraft, type PersistedEntryDraft } from '../data/entryDraftPersistence';
import { journalWithBuiltIns } from '../data/journal/test-support';
import { firstResult } from '../data/live/firstResult';
import type { Entry } from '../data/types';
import { localStorageEntryDraft } from '../data/entryDraftStore';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

function mirrors() {
  let snapshot: PersistedEntryDraft | null = null;
  let owner = 0;
  return {
    get snapshot() { return snapshot; },
    store() {
      const mine = ++owner;
      return {
        async read() { return snapshot ? structuredClone(snapshot) : null; },
        async write(value: PersistedEntryDraft) { if (mine === owner) snapshot = structuredClone(value); },
        clear() { if (mine === owner) snapshot = null; }
      };
    }
  };
}

async function fixture() {
  const { journal } = await journalWithBuiltIns();
  const mirror = mirrors();
  const navigations: string[] = [];
  const open = (overrides: Partial<EntrySessionOptions> = {}) => entrySessionCore({
    epochDay: 100, seedMood: 4, entries: journal.entries, draftStore: mirror.store(),
    navigate: async (destination) => { navigations.push(destination); }, ...overrides
  });
  return { journal, mirror, navigations, open };
}

test('preparation completes before snapshotting attachments, and pending save blocks departure', async () => {
  const { journal, open } = await fixture();
  const attachment = deferred();
  const write = deferred();
  const entered = deferred();
  const session = open({ entries: {
    upsertEntry: async (input) => { entered.resolve(); await write.promise; return journal.entries.upsertEntry(input); }
  } });
  await session.resume();
  const preparing = session.prepare(async () => {
    await attachment.promise;
    session.state.draft.setNote('Prepared text');
    session.state.draft.addPhoto({ full: new Uint8Array([1]), thumb: new Uint8Array([2]) });
  });
  assert.equal(session.preparing, true);
  const premature = session.save();
  assert.equal(session.state.saving, false, 'save cannot snapshot unfinished preparation');
  await premature;
  assert.equal(await journal.entries.countAll(), 0);
  attachment.resolve(); await preparing;
  session.establishBaseline();
  const saving = session.save(); await entered.promise;
  assert.equal(session.state.saving, true);
  assert.equal(session.guardOptions.busy!(), true);
  let ran = false;
  await session.prepare(async () => { ran = true; });
  assert.equal(ran, false, 'pending save refuses preparation edits');
  await session.save();
  write.resolve(); await saving;
  const [entry] = await journal.entries.entriesForDay(100);
  assert.equal(entry.note, 'Prepared text');
  assert.equal(entry.photos.length, 1);
  assert.equal(await journal.entries.countAll(), 1);
});

test.each([true, false])('lock during a failed save resumes same route with media and retries once (resume before settlement: %s)', async (resumeBeforeSettlement) => {
  const { journal, open, navigations } = await fixture();
  const gate = deferred(); const entered = deferred();
  const first = open({ entries: { upsertEntry: async () => {
    entered.resolve(); await gate.promise; throw new Error('attachment failure');
  } } });
  await first.resume();
  first.state.draft.setNote('Keep through lock');
  first.state.draft.addPhoto({ full: new Uint8Array([3]), thumb: new Uint8Array([4]) });
  first.state.starred = true;
  first.mirror();
  const failed = assert.rejects(first.save(), /attachment failure/);
  await entered.promise; first.dispose(true);
  const resumed = open();
  const restore = resumeBeforeSettlement ? resumed.resume() : Promise.resolve();
  if (resumeBeforeSettlement) {
    assert.equal(resumed.state.saving, true);
    assert.equal(resumed.state.draft.photos.length, 1);
  }
  gate.resolve(); await failed; await restore;
  if (!resumeBeforeSettlement) await resumed.resume();
  assert.equal(resumed.state.draft.note, 'Keep through lock');
  assert.equal(resumed.state.starred, true);
  assert.deepEqual(navigations, []);
  await resumed.save();
  const [entry] = await journal.entries.entriesForDay(100);
  assert.equal(entry.photos.length, 1);
  assert.equal(entry.starred, true);
  assert.equal(await journal.entries.countAll(), 1);
});

test('successful detached save resumes consumed draft without another write', async () => {
  const { journal, open, mirror, navigations } = await fixture();
  const gate = deferred(); const entered = deferred();
  let offerDetails = true;
  const first = open({ destination: () => {
    const offered = offerDetails;
    return (id) => offered ? `/entry/${id}` : '/';
  }, entries: {
    upsertEntry: async (input) => { entered.resolve(); await gate.promise; return journal.entries.upsertEntry(input); }
  } });
  await first.resume(); first.state.draft.setNote('Detached completion'); first.mirror();
  const save = first.save(); await entered.promise; first.dispose(true);
  offerDetails = false; // Lock clears presentation data after the save starts.
  const resumed = open(); const restore = resumed.resume();
  gate.resolve(); await save; await restore;
  assert.equal(resumed.state.draft.note, 'Detached completion');
  assert.equal(resumed.state.draft.savedId, 1);
  assert.equal(resumed.state.destination, '/entry/1');
  assert.equal(mirror.snapshot, null);
  assert.deepEqual(navigations, []);
  await resumed.save();
  assert.equal(await journal.entries.countAll(), 1);
  assert.deepEqual(navigations, ['/entry/1']);
});

test('another route discards foreign leftovers and retains its own mirror after detached completion', async () => {
  const { journal, open, mirror } = await fixture();
  const gate = deferred(); const entered = deferred();
  const first = open({ entries: { upsertEntry: async (input) => {
    entered.resolve(); await gate.promise; return journal.entries.upsertEntry(input);
  } } });
  await first.resume(); first.state.draft.setNote('Old editor'); first.mirror();
  const save = first.save(); await entered.promise; first.dispose(true);
  const second = open({ epochDay: 101 }); await second.resume();
  assert.equal(second.state.draft.note, '');
  second.state.draft.setNote('Current editor'); second.mirror();
  gate.resolve(); await save;
  assert.equal(mirror.snapshot?.note, 'Current editor');
  second.dispose(true);
  const reopened = open({ epochDay: 101 }); await reopened.resume();
  assert.equal(reopened.state.draft.note, 'Current editor');
  assert.equal(reopened.state.draft.epochDay, 101);
  assert.equal(await journal.entries.countAll(), 1);
});

test('failed first reads stay uninitialized; successful retry loads original content before saving', async () => {
  const { journal, open } = await fixture();
  const id = await journal.entries.upsertEntry({ epochDay: 100, timestamp: 1, mood: 3,
    note: 'Original entry', dims: { femininity: 60 } });
  const session = open({ entryId: id });
  let restore = Promise.resolve();
  const fill = firstResult<Entry>((entry) => { restore = session.resume(entry); });
  const query = { value: undefined as Entry | undefined, loading: false, failed: true };
  for (let attempt = 0; attempt < 2; attempt++) {
    fill(query); await restore; await session.save();
    assert.equal(session.state.mirrorRead, false);
    assert.equal((await journal.entries.getEntry(id))?.note, 'Original entry');
  }
  query.value = await journal.entries.getEntry(id); query.failed = false;
  fill(query); await restore;
  assert.equal(session.state.draft.note, 'Original entry');
  assert.deepEqual(session.state.draft.dims, { femininity: 60 });
  session.state.draft.setNote('Edited after retry');
  fill({ ...query, value: { ...query.value!, note: 'Later query' } }); await restore;
  assert.equal(session.state.draft.note, 'Edited after retry');
  await session.save();
  assert.equal((await journal.entries.getEntry(id))?.note, 'Edited after retry');
  assert.deepEqual((await journal.entries.getEntry(id))?.dims, { femininity: 60 });
});

test('failed navigation retries departure without repeating saved attachments', async () => {
  const { journal, open } = await fixture();
  let attempts = 0;
  const session = open({ epochDay: 102, navigate: async () => { if (++attempts === 1) throw new Error('navigation failure'); } });
  await session.resume();
  session.state.draft.addRecording(new Uint8Array([5]));
  const result = await session.save();
  assert.equal(result?.navigated, false);
  assert.equal(session.state.navigationFailed, true);
  await session.save();
  assert.equal(attempts, 2);
  const [entry] = await journal.entries.entriesForDay(102);
  assert.equal(entry.recordings.length, 1);
  assert.equal(await journal.entries.countAll(), 1);
});


test('real encrypted mirror rejects detached editor writes and clears after ownership changes', async () => {
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key)
  });
  try {
    const { journal, open } = await fixture();
    const key = new Uint8Array(32).fill(7) as Uint8Array<ArrayBuffer>;
    const encryption = deferred(); const write = deferred(); const entered = deferred();
    const oldStore = localStorageEntryDraft(async () => { await encryption.promise; return key; });
    const old = open({ epochDay: 103, draftStore: oldStore, entries: {
      upsertEntry: async (input) => { entered.resolve(); await write.promise; return journal.entries.upsertEntry(input); }
    } });
    encryption.resolve(); await old.resume();
    old.state.draft.setNote('Old editor');
    await oldStore.write(serializeDraft(old.state.draft));
    const save = old.save(); await entered.promise; old.dispose(true);
    const currentStore = localStorageEntryDraft(async () => key);
    const current = open({ epochDay: 104, draftStore: currentStore }); await current.resume();
    current.state.draft.setNote('Current encrypted draft');
    await currentStore.write(serializeDraft(current.state.draft));
    await oldStore.write(serializeDraft(old.state.draft));
    write.resolve(); await save;
    assert.equal((await currentStore.read())?.note, 'Current encrypted draft');
    assert.equal((await currentStore.read())?.epochDay, 104);
    assert.equal([...values.values()].some((value) => value.includes('Current encrypted draft')), false);
  } finally { vi.unstubAllGlobals(); }
});


test('loading a starred entry preserves metadata when reactive state wraps its draft', async () => {
  const { journal, mirror } = await fixture();
  const id = await journal.entries.upsertEntry({ epochDay: 105, timestamp: 1, mood: 4, starred: true });
  const options: EntrySessionOptions = {
    entryId: id, epochDay: 105, entries: journal.entries,
    draftStore: mirror.store(), navigate: async () => {}
  };
  const state = new Proxy(initialEntrySession(options), {
    set(target, property, value) {
      // Svelte state wraps assigned objects; callers cannot compare them to raw inputs.
      return Reflect.set(target, property, property === 'draft' ? new Proxy(value, {}) : value);
    }
  });
  const session = entrySessionCore(options, state);
  await session.resume(await journal.entries.getEntry(id));
  assert.equal(state.starred, true);
  await session.save();
  assert.equal((await journal.entries.getEntry(id))?.starred, true);
});
