/* Shared progressive-release gate contract.

   Keep stage ordering, required matrix checks, stage evidence keys, and
   channel gate stages in one place so checker and tests stay in sync.
*/

export const RELEASE_VERSION_RE = /^v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/;

export const STAGE_ORDER = Object.freeze(['stage1', 'stage2', 'stage3', 'stage4', 'stable']);

export const RELEASE_MATRIX_CHECKS = Object.freeze([
  'update',
  'migration',
  'archiveRoundTrip',
  'scheduledBackup',
  'rollback'
]);

export const STAGE_EVIDENCE_KEYS = Object.freeze({
  stage1: Object.freeze(['hostedWebBeta', 'landingSiteLive', 'truthfulAvailabilityLabels']),
  stage2: Object.freeze(['androidApi26', 'androidCurrent', 'aggressiveBackgroundDevice']),
  stage3: Object.freeze(['playOpenTesting', 'signedGithubReleaseApk']),
  stage4: Object.freeze(['fdroidSubmission', 'fdroidRebuildPassed', 'fdroidDependencyCheckPassed']),
  stable: RELEASE_MATRIX_CHECKS
});

export const CHANNEL_STAGE_GATE = Object.freeze({
  web: 'stage1',
  play: 'stage3',
  obtainium: 'stage2',
  fdroid: 'stage4'
});

/** @typedef {'stage1' | 'stage2' | 'stage3' | 'stage4' | 'stable'} StageName */

/**
 * @param {string} stage
 */
export function stageIndex(stage) {
  return STAGE_ORDER.indexOf(stage);
}

/** Candidate verification precedes publication; store outcomes follow it.
 * @param {StageName | null} target
 * @returns {StageName[]}
 */
export function requiredReleaseStages(target) {
  if (target === 'stable') return ['stage1', 'stage2', 'stable'];
  return target === null ? [] : /** @type {StageName[]} */ (STAGE_ORDER.slice(0, stageIndex(target) + 1));
}
