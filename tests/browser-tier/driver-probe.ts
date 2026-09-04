/* Browser-tier check for ticket 04's actual production code path (not a
   synthetic table like probe.ts/index.html use for ticket 03): boots the
   real driver against the real schema via the real migration runner, and
   proves it survives a full page reload - run.mjs reloads this same page
   and re-runs this same probe.

   The real driver is the encrypted one since ticket 09 - the boot
   contract, run()'s reporting and the window functions all have to hold
   on the sqlite3mc build that actually ships, not on the SQLocal build
   the app no longer opens its journal with. */
import { createEncryptedWebSqlite } from '../../src/lib/data/sqlite/mc-driver.ts';
import { boot } from '../../src/lib/data/sqlite/boot.ts';
import { LATEST_SCHEMA_VERSION } from '../../src/lib/data/sqlite/schema-version.ts';
import { freshOrigin, PROBE_DATA_KEY } from './fresh-origin.ts';
import { publish } from '../probe-handshake.mjs';

const NAME = 'driver-probe';

async function run() {
  await freshOrigin('driver-probe-cleared');
  const { driver, fileOps, requestPersistentStorage } = createEncryptedWebSqlite(
    'driver-probe.sqlite3',
    PROBE_DATA_KEY
  );
  const result = await boot({ createDriver: () => driver, fileOps, requestPersistentStorage });

  if (result.phase === 'error') {
    publish(NAME, { error: String((result.error as Error)?.stack ?? result.error) });
    return;
  }

  const existing = await result.driver.query<{ n: number }>(
    "SELECT COUNT(*) AS n FROM entry WHERE uuid = 'driver-probe-marker'"
  );
  const markerExisted = existing[0].n > 0;
  if (!markerExisted) {
    await result.driver.run(
      "INSERT INTO entry (uuid, epoch_day, timestamp, updated_at) VALUES ('driver-probe-marker', 1, 1000, 1000)"
    );
  }

  const userVersion = await result.driver.getUserVersion();

  /* Ticket 07: the journal's identity scheme (ADR-0002) sits on run()
     reporting `changes` truthfully - unknown-id writes throw when changes
     is 0 - and on `lastInsertRowid` being the row just inserted, even
     though the journal itself reads rowids back by uuid instead. This is
     the real SQLocal driver, so it is the contract's only honest check. */
  const uuid = `run-contract-${Date.now()}`;
  const insert = await result.driver.run(
    'INSERT INTO entry (uuid, epoch_day, timestamp, updated_at) VALUES (?, 1, 1000, 1000)',
    [uuid]
  );
  const byUuid = await result.driver.query<{ id: number }>('SELECT id FROM entry WHERE uuid = ?', [uuid]);
  const update = await result.driver.run('UPDATE entry SET updated_at = 2000 WHERE uuid = ?', [uuid]);
  const miss = await result.driver.run("UPDATE entry SET updated_at = 2000 WHERE uuid = 'no-such-row'");
  await result.driver.run('DELETE FROM entry WHERE uuid = ?', [uuid]);

  /* Ticket 10: the recap's own reads use ROW_NUMBER() and NTILE, and the
     day spread a named WINDOW clause. A build compiled with
     SQLITE_OMIT_WINDOWFUNC would fail on them here and nowhere else - the
     Node tier's SQLite is a different build - so the check has to happen
     against the WASM one. The query below is the shape the streak used
     before phase 8 UX ticket 01 deleted it, kept because it is the
     smallest thing that exercises the feature. */
  const windowed = await result.driver.query<{ n: number }>(
    `WITH days AS (SELECT DISTINCT epoch_day AS day FROM entry),
          numbered AS (SELECT day, ROW_NUMBER() OVER (ORDER BY day) AS rn FROM days)
     SELECT COUNT(*) AS n FROM numbered GROUP BY day - rn ORDER BY n DESC LIMIT 1`
  ).then((rows) => rows[0]?.n ?? 0);

  publish(NAME, {
    userVersion,
    latestSchemaVersion: LATEST_SCHEMA_VERSION,
    persistDenied: result.persistDenied,
    markerExisted,
    windowFunctionRun: windowed,
    runContract: {
      insertChanges: insert.changes,
      lastInsertRowid: insert.lastInsertRowid,
      rowidByUuid: byUuid[0]?.id,
      updateChanges: update.changes,
      missChanges: miss.changes
    }
  });
}

run().catch((err) => publish(NAME, { error: String(err?.stack ?? err) }));
