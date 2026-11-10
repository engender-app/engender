import { test } from 'vitest';
import assert from 'node:assert/strict';
import { entrySessionCore } from './entrySession';
import type { PersistedEntryDraft } from '../data/entryDraftPersistence';
import { journalWithBuiltIns } from '../data/journal/test-support';

/* A face on the check-in notification (tester report 02, ticket 05) only
   opens /entry/new/today?seedMood=N. The promise made for it on 2026-11-10
   is that nothing is written before the person saves: a seeded mood that is
   left behind leaves no entry, no draft mirror and no question about
   discarding something the person never wrote. */
test('a seeded mood left without saving writes nothing and keeps nothing', async () => {
  const { journal } = await journalWithBuiltIns();
  let snapshot: PersistedEntryDraft | null = null;
  const session = entrySessionCore({
    epochDay: 100,
    seedMood: 4,
    entries: journal.entries,
    draftStore: {
      async read() { return snapshot; },
      async write(value) { snapshot = value; },
      clear() { snapshot = null; }
    },
    navigate: async () => {}
  });

  await session.resume();
  session.establishBaseline();
  assert.equal(session.state.draft.mood, 4, 'the face picked the mood');
  session.mirror();
  assert.equal(session.guardOptions.holding(), false, 'leaving a seed alone asks nothing');

  session.dispose(false);

  assert.equal(await journal.entries.countAll(), 0, 'no entry was written');
  assert.equal(snapshot, null, 'no draft mirror is left holding the mood');
});
