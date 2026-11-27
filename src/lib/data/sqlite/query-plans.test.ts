/* Query-plan assertions for five indexes and the entriesWithTag join rewrite - proof the
   planner actually uses what v68 adds, since a passing timing budget can't tell an index
   seek from a scan that happened to be fast on a small fixture (own discipline: assert the
   plan, not the timing). Part of the Node tier; run with `npm test`. */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { migratedDb } from './test-support/migrated-db.ts';

const planOf = async (db: Awaited<ReturnType<typeof migratedDb>>, sql: string, params: unknown[] = []) =>
  (db.raw.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...(params as never[])) as Array<{ detail: string }>)
    .map((row) => row.detail)
    .join('\n');

test('milestone.epoch_day: lastWriteEpochDay uses idx_milestone_epoch_day', async () => {
  const db = await migratedDb();
  const plan = await planOf(db, 'SELECT MAX(epoch_day) AS day FROM milestone WHERE epoch_day <= ?', [100]);
  assert.match(plan, /USING (?:COVERING )?INDEX idx_milestone_epoch_day/);
});

test('felt_sense.epoch_day: lastWriteEpochDay uses idx_felt_sense_epoch_day', async () => {
  const db = await migratedDb();
  const plan = await planOf(db, 'SELECT MAX(epoch_day) AS day FROM felt_sense WHERE epoch_day <= ?', [100]);
  assert.match(plan, /USING (?:COVERING )?INDEX idx_felt_sense_epoch_day/);
});

test('entry_tag.tag_id has an index a plain lookup by tag can use', async () => {
  const db = await migratedDb();
  const plan = await planOf(db, 'SELECT entry_id FROM entry_tag WHERE tag_id = ?', [1]);
  assert.match(plan, /USING (?:COVERING )?INDEX idx_entry_tag_tag_id/);
});



test('entry(presentation_uuid, timestamp): idx_entry_presentation_uuid widened to carry timestamp', async () => {
  const db = await migratedDb();

  // EXPLAIN QUERY PLAN's text names the index either way - presentation_uuid
  // alone already served the equality before this ticket - so the plan
  // alone can't prove the widening happened; the index's own column list
  // is what the ticket actually asked for.
  const columns = (db.raw.prepare('PRAGMA index_info(idx_entry_presentation_uuid)').all() as Array<{ name: string }>).map(
    (c) => c.name
  );
  assert.deepEqual(columns, ['presentation_uuid', 'timestamp']);

  const plan = await planOf(
    db,
    `SELECT p.uuid, p.name, p.role_index, p.hidden,
            (SELECT MAX(e.timestamp) FROM entry e
             WHERE e.presentation_uuid = p.uuid AND e.trashed_at IS NULL) AS last_used
     FROM presentation p
     ORDER BY last_used IS NULL, last_used DESC, p.id`
  );
  assert.match(plan, /USING (?:COVERING )?INDEX idx_entry_presentation_uuid/);
});

test('entriesWithTag drives its join from entry_tag, not a scan of every untrashed entry', async () => {
  const db = await migratedDb();
  const plan = await planOf(
    db,
    `SELECT e.id, e.epoch_day, e.timestamp, e.mood, e.note, e.starred, e.presentation_uuid FROM entry e
     JOIN entry_tag et ON et.entry_id = e.id
     WHERE et.tag_id = ? AND e.epoch_day BETWEEN ? AND ? AND e.trashed_at IS NULL
     ORDER BY e.epoch_day DESC, e.timestamp DESC, e.id DESC
     LIMIT ?`,
    [1, 0, 100, 10]
  );
  assert.match(plan, /USING (?:COVERING )?INDEX idx_entry_tag_tag_id/);
  assert.doesNotMatch(plan, /idx_entry_trashed_at/);
  assert.doesNotMatch(plan, /SCAN entry\b/);
});
