/* Fixture builder (ticket 03's acceptance criteria): inserts an entry at a
   given epoch day with a mood, dimension values and tags, against the real
   migrated schema - so later tickets exercising entries, stats, search and
   tag insights don't each invent their own seeding. Referenced dimensions
   and tags are created on first use, keyed by name, so a call site doesn't
   have to seed reference data by hand. */

import type { DatabaseSync } from 'node:sqlite';

export interface EntryFixture {
  epochDay: number;
  timestamp?: number;
  mood?: number | null;
  note?: string;
  dims?: Record<string, number>;
  tags?: string[];
}

function dimensionId(db: DatabaseSync, key: string): number {
  const existing = db.prepare('SELECT id FROM gender_dimension WHERE key = ?').get(key) as
    | { id: number }
    | undefined;
  if (existing) return existing.id;
  return db
    .prepare('INSERT INTO gender_dimension (key, name, low_label, high_label, updated_at) VALUES (?, ?, ?, ?, 0)')
    .run(key, key, 'low', 'high').lastInsertRowid as number;
}

function tagId(db: DatabaseSync, label: string): number {
  const existing = db.prepare('SELECT id FROM tag WHERE label = ?').get(label) as { id: number } | undefined;
  if (existing) return existing.id;
  const group = db.prepare("SELECT id FROM tag_group WHERE key = 'fixtures'").get() as { id: number } | undefined;
  const groupId =
    group?.id ??
    (db.prepare("INSERT INTO tag_group (key, name, updated_at) VALUES ('fixtures', 'Fixtures', 0)").run()
      .lastInsertRowid as number);
  return db.prepare('INSERT INTO tag (group_id, label, updated_at) VALUES (?, ?, 0)').run(groupId, label)
    .lastInsertRowid as number;
}

/** Inserts one entry per fixture, in order, returning their assigned entry ids. */
export function insertEntryFixtures(db: DatabaseSync, fixtures: EntryFixture[]): number[] {
  return fixtures.map((fx, i) => {
    const timestamp = fx.timestamp ?? fx.epochDay * 86400000;
    const uuid = `fixture-${fx.epochDay}-${i}`;
    const entryId = db
      .prepare('INSERT INTO entry (uuid, epoch_day, timestamp, mood, note, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(uuid, fx.epochDay, timestamp, fx.mood ?? null, fx.note ?? '', timestamp).lastInsertRowid as number;

    for (const [key, value] of Object.entries(fx.dims ?? {})) {
      db.prepare('INSERT INTO entry_dimension_value (entry_id, dimension_id, value) VALUES (?, ?, ?)').run(
        entryId,
        dimensionId(db, key),
        value
      );
    }

    for (const label of fx.tags ?? []) {
      db.prepare('INSERT INTO entry_tag (entry_id, tag_id) VALUES (?, ?)').run(entryId, tagId(db, label));
    }

    return entryId;
  });
}
