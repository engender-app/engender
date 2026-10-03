import assert from 'node:assert/strict';
import { test } from 'vitest';
import { everySectionDevice } from '../journal/golden-archive-fixture.ts';
import { runMigrations } from './migration-runner.ts';
import { migrations } from './migrations.ts';
import { noopFileOps } from './test-support/migrated-db.ts';

type ForeignKey = { table: string; from: string; to: string };

test('v85 repairs every foreign key and preserves valid rows and independently authored content', async () => {
  const { driver } = await everySectionDevice();
  try {
    const [schedule] = await driver.query('SELECT id FROM dose_schedule LIMIT 1');
    await driver.run('INSERT INTO dose_schedule_weekday VALUES (?, 0)', [schedule.id]);
    await driver.run("INSERT INTO dose_schedule_dose_amount VALUES (?, 0, 4, 'mg')", [schedule.id]);
    const tables = await driver.query<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    );
    const before = new Map<string, Record<string, unknown>[]>();
    const keys: Array<ForeignKey & { child: string }> = [];
    for (const { name } of tables) {
      const foreignKeys = await driver.query<ForeignKey>(`PRAGMA foreign_key_list("${name}")`);
      if (foreignKeys.length === 0) continue;
      before.set(name, (await driver.query(`SELECT * FROM "${name}" ORDER BY rowid`)).map((row) => ({ ...row })));
      keys.push(...foreignKeys.map((key) => ({ ...key, child: name })));
    }
    assert.equal(keys.length, 36, 'all declared keys, including the v83 taper link, are seeded');
    await driver.exec('PRAGMA foreign_keys = OFF');
    const orphanRows = new Map<string, Record<string, unknown>>();
    let serial = 0;
    for (const key of keys) {
      const [sample] = before.get(key.child)!;
      assert.ok(sample, `valid fixture row exists for ${key.child}`);
      const row = { ...sample };
      const suffix = `orphan-${++serial}`;
      if ('id' in row) row.id = 100000 + serial;
      if ('uuid' in row) row.uuid = suffix;
      if ('key' in row) row.key = suffix;
      row[key.from] = key.to === 'id' ? -serial : suffix;
      // These two tables require exactly one owner, even with FK checks off.
      if (key.child === 'photo' || key.child === 'felt_sense') {
        for (const owner of key.child === 'photo' ? ['entry_id', 'milestone_id'] : ['tryout_id', 'milestone_id']) {
          if (owner !== key.from) row[owner] = null;
        }
      }
      const columns = Object.keys(row);
      await driver.run(
        `INSERT INTO "${key.child}" (${columns.map((c) => `"${c}"`).join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
        Object.values(row)
      );
      orphanRows.set(key.child, row);
      if (optionalLinks.some((link) => link.table === key.child && link.column === key.from)) {
        before.get(key.child)!.push({ ...row, [key.from]: null });
      }
    }
    // A child whose parent exists initially also becomes orphaned when that
    // parent is removed. Cleanup must follow the parent-to-child order.
    const orphanSchedule = orphanRows.get('dose_schedule')!;
    await driver.run('INSERT INTO dose_schedule_weekday VALUES (?, 1)', [orphanSchedule.id]);
    await driver.run("INSERT INTO dose_schedule_dose_amount VALUES (?, 1, 2, 'mg')", [orphanSchedule.id]);
    const orphanTag = orphanRows.get('tag')!;
    const [entryTag] = before.get('entry_tag')!;
    await driver.run('INSERT INTO entry_tag VALUES (?, ?)', [entryTag.entry_id, orphanTag.id]);
    // A stale debrief does not own the checklist or its items.
    const retainedChecklist = orphanRows.get('checklist')!;
    await driver.run("INSERT INTO checklist_item (uuid, checklist_id, content, updated_at) VALUES ('retained-item', ?, 'ask', 0)", [retainedChecklist.id]);
    const [retainedItem] = await driver.query("SELECT * FROM checklist_item WHERE uuid = 'retained-item'");
    before.get('checklist_item')!.push({ ...retainedItem });
    assert.equal((await driver.query('PRAGMA foreign_key_check')).length, keys.length);
    await driver.setUserVersion(84);

    await runMigrations(driver, noopFileOps(), migrations);

    assert.equal(await driver.getUserVersion(), 85);
    assert.equal((await driver.query('PRAGMA foreign_keys'))[0].foreign_keys, 1);
    assert.deepEqual(await driver.query('PRAGMA foreign_key_check'), []);
    for (const [table, validRows] of before) {
      assert.deepEqual((await driver.query(`SELECT * FROM "${table}" ORDER BY rowid`)).map((row) => ({ ...row })), validRows, table);
    }
  } finally {
    await driver.close();
  }
});

const optionalLinks = [
  { name: 'entry presentation', table: 'entry', column: 'presentation_id', where: 'id IN (SELECT entry_id FROM photo)' },
  { name: 'milestone procedure', table: 'milestone', column: 'procedure_id', where: 'id IN (SELECT milestone_id FROM photo)' },
  { name: 'milestone tryout', table: 'milestone', column: 'tryout_id', where: 'id IN (SELECT milestone_id FROM photo)' },
  { name: 'checklist debrief', table: 'checklist', column: 'debrief_entry_id', where: 'id IN (SELECT checklist_id FROM checklist_item)' },
  { name: 'custom effect category', table: 'personal_effect_type', column: 'category_key', where: 'is_built_in = 0' }
];

test.each(optionalLinks)('v85 clears stale $name without deleting authored rows or attachments', async ({ table, column, where }) => {
  const { driver } = await everySectionDevice();
  try {
    const [target] = await driver.query<{ id: number }>(`SELECT id FROM ${table} WHERE ${where} ORDER BY id LIMIT 1`);
    assert.ok(target, 'fixture contains authored content with attachments or a custom name');
    if (table === 'milestone') {
      const otherColumn = column === 'procedure_id' ? 'tryout_id' : 'procedure_id';
      const parent = column === 'procedure_id' ? 'tryout' : 'procedure';
      await driver.run(`UPDATE milestone SET ${otherColumn} = (SELECT uuid FROM ${parent} LIMIT 1) WHERE id = ?`, [target.id]);
    }
    const tables = await driver.query<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'entry_fts%' ORDER BY name"
    );
    const expected = new Map<string, Record<string, unknown>[]>();
    for (const { name } of tables) {
      expected.set(name, (await driver.query(`SELECT * FROM "${name}"`)).map((row) => ({ ...row })));
    }
    const retained = expected.get(table)!.find((row) => row.id === target.id)!;
    retained[column] = null;
    if (table === 'personal_effect_type') assert.ok(String(retained.name).length > 0);
    await driver.exec('PRAGMA foreign_keys = OFF');
    await driver.run(`UPDATE ${table} SET ${column} = ? WHERE id = ?`, [column === 'debrief_entry_id' ? -999999 : 'missing-parent', target.id]);
    assert.equal((await driver.query('PRAGMA foreign_key_check')).length, 1);
    await driver.setUserVersion(84);

    await runMigrations(driver, noopFileOps(), migrations);

    assert.equal(await driver.getUserVersion(), 85);
    assert.equal((await driver.query('PRAGMA foreign_keys'))[0].foreign_keys, 1);
    assert.deepEqual(await driver.query('PRAGMA foreign_key_check'), []);
    for (const [name, rows] of expected) {
      assert.deepEqual((await driver.query(`SELECT * FROM "${name}"`)).map((row) => ({ ...row })), rows, name);
    }
    await runMigrations(driver, noopFileOps(), migrations);
    for (const [name, rows] of expected) {
      assert.deepEqual((await driver.query(`SELECT * FROM "${name}"`)).map((row) => ({ ...row })), rows, `clean boot: ${name}`);
    }
  } finally {
    await driver.close();
  }
});
