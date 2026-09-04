/* The recording adapter's own tests (phase 8 audit ticket 01).

   Two claims, and the second is the one the budgets rest on: the tables a
   statement names come back exactly, and what crossed the seam is counted
   in statements and in bytes. Everything here runs the real thing over a
   real migrated database rather than over a fake driver - the point of the
   adapter is what the app's own SQL does, and a fake would let a parser bug
   pass by agreeing with itself. */

import { readFileSync, readdirSync } from 'node:fs';
import { expect, test } from 'vitest';
import { migratedDb } from './migrated-db.ts';
import { recordingDriver, tablesTouched } from './recording-driver.ts';

async function recorded() {
  return recordingDriver(await migratedDb());
}

test('a read names the tables it read and writes nothing', async () => {
  const { driver, record } = await recorded();

  const { recording } = await record(async () => {
    await driver.query('SELECT key FROM pref WHERE key = ?', ['x']);
    await driver.query(
      `WITH counted AS (SELECT tag_id, COUNT(*) AS n FROM entry_tag GROUP BY tag_id)
       SELECT t.label AS label, counted.n AS n FROM tag t JOIN counted ON counted.tag_id = t.id`
    );
  });

  expect(recording.statements.map((s) => s.read)).toEqual([['pref'], ['entry_tag', 'tag']]);
  expect(recording.wrote).toEqual([]);
  expect(recording.read).toEqual(['entry_tag', 'pref', 'tag']);
});

test('a write names the table it wrote, and the tables it read to decide', async () => {
  const { driver, record } = await recorded();

  const { recording } = await record(async () => {
    await driver.run('INSERT INTO pref (key, value) VALUES (?, ?)', ['a', '1']);
    await driver.run('UPDATE pref SET value = ? WHERE key = ?', ['2', 'a']);
    await driver.run('DELETE FROM pref WHERE key IN (SELECT key FROM tag)');
  });

  expect(recording.statements.map((s) => s.wrote)).toEqual([['pref'], ['pref'], ['pref']]);
  /* The delete's `FROM` belongs to the delete and its subquery's does not,
     which is the whole difference between "this write touched one table" and
     "this write touched two". */
  expect(recording.statements.map((s) => s.read)).toEqual([[], [], ['tag']]);
});

test('a statement that writes two tables names both', async () => {
  const { driver, record } = await recorded();

  const { recording } = await record(async () => {
    await driver.exec(`INSERT INTO pref (key, value) VALUES ('a', '1');
                       UPDATE tag SET hidden = 0 WHERE id = -1;`);
  });

  expect(recording.statements).toHaveLength(1);
  expect(recording.wrote).toEqual(['pref', 'tag']);
  expect(recording.read).toEqual([]);
});

test('a table name inside a string literal is not a table', () => {
  expect(tablesTouched("SELECT value FROM pref WHERE value = 'from tag' -- and from milestone")).toEqual({
    read: ['pref'],
    wrote: []
  });
});

test('the statement count is what crossed the seam, and the byte count what came back', async () => {
  const { driver, record } = await recorded();

  const { recording } = await record(async () => {
    await driver.query('SELECT 1 AS n');
    await driver.query('SELECT key FROM pref');
  });

  expect(recording.statements).toHaveLength(2);
  // `[{"n":1}]`, which is the whole point of counting the serialised form
  // rather than the row count: what this architecture pays for is the text.
  expect(recording.statements[0].bytes).toBe(9);
  expect(recording.statements[1].bytes).toBe('[]'.length);
  expect(recording.bytes).toBe(9 + 2);
});

test('bytes grow with the rows a read hands back', async () => {
  const { driver, record } = await recorded();

  const one = await record(async () => {
    await driver.run('INSERT INTO pref (key, value) VALUES (?, ?)', ['a', 'x']);
    return driver.query('SELECT key, value FROM pref');
  });
  const two = await record(async () => {
    await driver.run('INSERT INTO pref (key, value) VALUES (?, ?)', ['b', 'x']);
    return driver.query('SELECT key, value FROM pref');
  });

  expect(two.recording.bytes).toBeGreaterThan(one.recording.bytes);
});

test('nothing is recorded outside a window, and a window sees only its own', async () => {
  const { driver, record } = await recorded();

  await driver.query('SELECT key FROM pref');
  const { recording } = await record(async () => {
    await driver.query('SELECT label FROM tag');
  });
  await driver.query('SELECT key FROM pref');

  expect(recording.statements.map((s) => s.read)).toEqual([['tag']]);
});

test('a window that throws leaves the driver recording nothing', async () => {
  const { driver, record } = await recorded();

  await expect(
    record(async () => {
      await driver.query('SELECT label FROM tag');
      throw new Error('the screen went');
    })
  ).rejects.toThrow('the screen went');

  const { recording } = await record(async () => {
    await driver.query('SELECT key FROM pref');
  });
  expect(recording.statements.map((s) => s.read)).toEqual([['pref']]);
});

test('the recorded driver is still the driver underneath it', async () => {
  const { driver } = await recorded();

  await driver.run('INSERT INTO pref (key, value) VALUES (?, ?)', ['a', '1']);
  expect(await driver.query('SELECT value FROM pref WHERE key = ?', ['a'])).toEqual([{ value: '1' }]);
  expect(await driver.getUserVersion()).toBeGreaterThan(0);
  await driver.transaction(async () => {
    await driver.run('UPDATE pref SET value = ? WHERE key = ?', ['2', 'a']);
  });
  expect(await driver.query('SELECT value FROM pref WHERE key = ?', ['a'])).toEqual([{ value: '2' }]);
});

test('a statement inside a transaction is recorded like any other', async () => {
  const { driver, record } = await recorded();

  const { recording } = await record(async () => {
    await driver.transaction(async () => {
      await driver.run('INSERT INTO pref (key, value) VALUES (?, ?)', ['a', '1']);
    });
  });

  expect(recording.wrote).toEqual(['pref']);
});

/* The adapter is test support and has to stay there: it wraps every
   statement in a JSON serialisation, which is exactly what the app must not
   pay for. Nothing in the module graph means nothing in the bundle, so this
   asks the graph. */
test('no shipped module imports the recording adapter', () => {
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        if (entry.name !== 'test-support') walk(path);
        continue;
      }
      if (entry.name.includes('.test.')) continue;
      if (!/\.(ts|svelte)$/.test(entry.name)) continue;
      if (readFileSync(path, 'utf8').includes('recording-driver')) offenders.push(path);
    }
  };

  walk(new URL('../../../..', import.meta.url).pathname);
  expect(offenders).toEqual([]);
});
