/* Browser-tier check for ticket 04's actual production code path (not a
   synthetic table like probe.ts/index.html use for ticket 03): boots the
   real driver against the real schema via the real migration runner, and
   proves it survives a full page reload - run.mjs reloads this same page
   and re-runs this same probe. */
import { createWebSqlite } from '../../src/lib/data/sqlite/sqlocal-driver.ts';
import { boot } from '../../src/lib/data/sqlite/boot.ts';

async function run() {
  const { driver, fileOps, requestPersistentStorage } = createWebSqlite('driver-probe.sqlite3');
  const result = await boot({ createDriver: () => driver, fileOps, requestPersistentStorage });

  if (result.phase === 'error') {
    (window as unknown as { __driverProbeResult: unknown }).__driverProbeResult = {
      error: String((result.error as Error)?.stack ?? result.error)
    };
    document.body.dataset.driverProbeReady = 'true';
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

  (window as unknown as { __driverProbeResult: unknown }).__driverProbeResult = {
    userVersion,
    persistDenied: result.persistDenied,
    markerExisted,
    runContract: {
      insertChanges: insert.changes,
      lastInsertRowid: insert.lastInsertRowid,
      rowidByUuid: byUuid[0]?.id,
      updateChanges: update.changes,
      missChanges: miss.changes
    }
  };
  document.body.dataset.driverProbeReady = 'true';
}

run().catch((err) => {
  (window as unknown as { __driverProbeResult: unknown }).__driverProbeResult = {
    error: String(err?.stack ?? err)
  };
  document.body.dataset.driverProbeReady = 'true';
});
