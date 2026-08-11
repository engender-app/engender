/* Runs the real SQLite boot sequence once (ticket 04) and exposes its
   result reactively, so +layout.svelte can show a handled error state
   instead of a blank screen if opening the database or running
   migrations fails. Nothing reads `driver` yet - repositories move onto
   it in ticket 07 - so a failure here doesn't affect the demo store or
   any screen today. This only runs in the browser (ssr = false). */

import { boot } from '../data/sqlite/boot';
import { createWebSqlite } from '../data/sqlite/sqlocal-driver';
import type { SqliteDriver } from '../data/sqlite/driver';

export const bootState = $state<{
  status: 'booting' | 'ready' | 'error';
  error: string | null;
  persistDenied: boolean;
  driver: SqliteDriver | null;
}>({
  status: 'booting',
  error: null,
  persistDenied: false,
  driver: null
});

let started = false;

export function startBoot() {
  if (started) return;
  started = true;

  // The PRD asks for navigator.storage.persist() on first save, not on
  // boot - but there is no save path yet (repositories move onto this
  // driver in ticket 07), and persist() is safe to call more than once,
  // so this asks once here as a stand-in. Move this call to the real
  // first-save moment once ticket 07 adds one, rather than adding a
  // second call there.
  const { driver, fileOps, requestPersistentStorage } = createWebSqlite('gender-diary.sqlite3');
  boot({ createDriver: () => driver, fileOps, requestPersistentStorage }).then((result) => {
    if (result.phase === 'error') {
      bootState.status = 'error';
      bootState.error = String((result.error as Error)?.message ?? result.error);
    } else {
      bootState.status = 'ready';
      bootState.persistDenied = result.persistDenied;
      bootState.driver = result.driver;
    }
  });
}
