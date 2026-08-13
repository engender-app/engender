/* Shared progressive-release gate contract.

   Keep stage ordering, required matrix checks, stage evidence keys, and
   channel gate stages in one place so checker and tests stay in sync.
*/

export const STAGE_ORDER = Object.freeze(['stage1', 'stage2', 'stage3', 'stage4', 'stable']);

export const RELEASE_MATRIX_CHECKS = Object.freeze([
  'update',
  'migration',
  'encryptionConversion',
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
  obtainium: 'stage3',
  fdroid: 'stage4'
});

/** @typedef {'stage1' | 'stage2' | 'stage3' | 'stage4' | 'stable'} StageName */

/**
 * @param {string} stage
 */
export function stageIndex(stage) {
  return STAGE_ORDER.indexOf(stage);
}