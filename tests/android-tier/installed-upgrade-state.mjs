import { isDeepStrictEqual } from 'node:util';

/**
 * @typedef {{when: number, tag: string, detail: string}} UpgradeAlarm
 * @typedef {{userVersion: number, counts: Record<string, number>, entryUuids: string[], linkedMilestones: number,
 * mediaSha256: Record<string, string>, integrity: Record<string, unknown>[], foreignKeys: Record<string, unknown>[],
 * alarms: UpgradeAlarm[]}} UpgradeState
 */

/** Keep stable alarm facts; Android's object IDs and batch positions change on replacement.
 * @param {string} dump
 * @param {string} packageId
 */
export function alarmState(dump, packageId) {
  const lines = dump.split('\n');
  const alarms = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!/^(RTC|ELAPSED)[A-Z_]* #\d+: Alarm\{/.test(line) || !line.endsWith(`${packageId}}`)) continue;
    const when = /origWhen (\d+)/.exec(line)?.[1];
    const tag = /^tag=(.*)$/.exec(lines[i + 1]?.trim())?.[1];
    const detail = lines[i + 2]?.trim();
    if (!when || !tag || !detail?.startsWith('type=')) throw new Error('Incomplete installed-upgrade alarm evidence');
    alarms.push({ when: Number(when), tag, detail });
  }
  return alarms.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}

/** @param {UpgradeState} state */
export function assertFilledState(state) {
  if (state.userVersion !== 88 || !(state.counts?.entry > 0) || !(state.counts?.measurement > 0)
    || !(state.counts?.milestone > 0) || !(state.counts?.roadmap_check > 0)
    || !(state.linkedMilestones > 0)
    || !Object.keys(state.mediaSha256 ?? {}).length || !state.alarms?.length) {
    throw new Error('Installed-upgrade requires a filled schema-88 journal, linked milestones, measurements, media and alarms');
  }
  if (!isDeepStrictEqual(state.integrity, [{ integrity_check: 'ok' }]) || state.foreignKeys?.length !== 0) {
    throw new Error('Installed-upgrade baseline is not healthy');
  }
}

/** The expected version is explicit: a migration changes it, a restored copy must not.
 * @param {UpgradeState} before
 * @param {UpgradeState} after
 * @param {number} expectedVersion
 */
export function compareUpgradeState(before, after, expectedVersion) {
  /** @type {string[]} */
  const differences = [];
  /** @type {{name: string, before: unknown, after: unknown, expected: unknown}[]} */
  const rows = [];
  /** @param {string} name @param {unknown} oldValue @param {unknown} newValue @param {unknown} [expected] */
  const check = (name, oldValue, newValue, expected = oldValue) => {
    rows.push({ name, before: oldValue, after: newValue, expected });
    if (!isDeepStrictEqual(expected, newValue)) differences.push(name);
  };
  check('user_version', before.userVersion, after.userVersion, expectedVersion);
  check('entry_uuids', before.entryUuids, after.entryUuids);
  for (const table of [...new Set([...Object.keys(before.counts), ...Object.keys(after.counts)])].sort()) {
    check(`rows:${table}`, before.counts[table], after.counts[table]);
  }
  for (const file of [...new Set([...Object.keys(before.mediaSha256), ...Object.keys(after.mediaSha256)])].sort()) {
    check(`media:${file}`, before.mediaSha256[file], after.mediaSha256[file]);
  }
  check('integrity', before.integrity, after.integrity, [{ integrity_check: 'ok' }]);
  check('foreign_keys', before.foreignKeys, after.foreignKeys, []);
  check('alarms', before.alarms, after.alarms);
  return { rows, differences };
}

/** @param {UpgradeState} before @param {UpgradeState} after @param {number} expectedVersion */
export function assertUpgradeState(before, after, expectedVersion) {
  const result = compareUpgradeState(before, after, expectedVersion);
  if (result.differences.length) throw new Error(`Installed-upgrade state differs: ${result.differences.join(', ')}`);
  return result;
}
