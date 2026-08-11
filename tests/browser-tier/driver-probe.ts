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

  (window as unknown as { __driverProbeResult: unknown }).__driverProbeResult = {
    userVersion,
    persistDenied: result.persistDenied,
    markerExisted
  };
  document.body.dataset.driverProbeReady = 'true';
}

run().catch((err) => {
  (window as unknown as { __driverProbeResult: unknown }).__driverProbeResult = {
    error: String(err?.stack ?? err)
  };
  document.body.dataset.driverProbeReady = 'true';
});
