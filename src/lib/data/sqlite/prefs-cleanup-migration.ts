import type { MigrationDb } from './migration-runner';

/** The eight per-surface switches, and the unprompted-registry kind each one belonged to.
    Written out here rather than read from the registry: a migration is frozen, and the
    registry is not. */
const SURFACE_SWITCHES: Record<string, string> = {
  wearTimerEnabled: 'wear-timer',
  dosePanelEnabled: 'dose-panel',
  readyLetterEnabled: 'ready-letter',
  surgeryCountdownEnabled: 'surgery-countdown',
  safeSpaceNudgeEnabled: 'safe-space-nudge',
  stockNoticeEnabled: 'stock-notice',
  wrappedEnabled: 'wrapped',
  onThisDayEnabled: 'on-this-day'
};

/** Every key this migration reads, and then removes. */
const READ_KEYS = [...Object.keys(SURFACE_SWITCHES), 'lockOnLeave', 'lockAfter', 'cycleTrackingEnabled', 'cycleTrackingChoice'];

async function writePref(db: MigrationDb, key: string, value: unknown): Promise<void> {
  await db.run('INSERT INTO pref (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value', [
    key,
    JSON.stringify(value)
  ]);
}

/** Rewrites stored preferences so the catalogue can drop keys with no
    read-across left behind. Every answer a person gave survives:

    - a surface switch that was off becomes an entry in `surfaceOverrides`
      (an on is the registry's default, so it needs none);
    - `lockOnLeave` becomes `lockAfter` unless a timing was already chosen;
    - the legacy `cycleTrackingEnabled` opt-in becomes an explicit
      `cycleTrackingChoice` of true unless a choice was already made.

    The entry editor's four card switches (nothing wrote them, so a stored
    row can only be the default) are deleted in the migration's SQL half.

    Reads with one literal query and writes only what changed, so a journal
    with none of these rows costs one read and no write. */
export async function migratePrefsCleanup(db: MigrationDb): Promise<void> {
  const rows = await db.query<{ key: string; value: string }>(
    `SELECT key, value FROM pref WHERE key IN (${READ_KEYS.map((key) => `'${key}'`).join(', ')})`
  );
  if (rows.length === 0) return;
  const stored = new Map(rows.map((row) => [row.key, JSON.parse(row.value) as unknown]));

  const overrides: Record<string, boolean> = {};
  for (const [key, kind] of Object.entries(SURFACE_SWITCHES)) {
    if (stored.get(key) === false) overrides[kind] = false;
  }
  if (Object.keys(overrides).length > 0) await writePref(db, 'surfaceOverrides', overrides);

  if (stored.has('lockOnLeave') && !stored.has('lockAfter')) {
    await writePref(db, 'lockAfter', stored.get('lockOnLeave') === true ? 'immediately' : 'restart');
  }
  if (stored.get('cycleTrackingEnabled') === true && stored.get('cycleTrackingChoice') == null) {
    await writePref(db, 'cycleTrackingChoice', true);
  }

  await db.exec(
    `DELETE FROM pref WHERE key IN (${Object.keys(SURFACE_SWITCHES).map((key) => `'${key}'`).join(', ')}, 'lockOnLeave', 'cycleTrackingEnabled')`
  );
}
