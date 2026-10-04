/* Progressive release evidence gate (phase 2 ticket 22).

   A green build says code compiles. This check proves each release stage has the
   exercises recorded before a channel is marked live on the landing site.
*/
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  CHANNEL_STAGE_GATE,
  RELEASE_MATRIX_CHECKS,
  STAGE_EVIDENCE_KEYS,
  STAGE_ORDER,
  stageIndex
} from './progressive-release-gate-contract.mjs';

export { CHANNEL_STAGE_GATE, RELEASE_MATRIX_CHECKS, STAGE_EVIDENCE_KEYS, STAGE_ORDER };

/** @typedef {import('./progressive-release-gate-contract.mjs').StageName} StageName */

/** @typedef {{
 *   releaseVersion: string;
 *   stages: Record<string, unknown>;
 *   channels: Record<string, unknown>;
 * }} ProgressiveRecord */

/**
 * @param {unknown} value
 */
function parseIsoDate(value) {
  if (typeof value !== 'string') return null;
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : t;
}

/** Infer claims from timestamps, exercise evidence, and live channels.
 * @param {unknown} record
 * @returns {StageName | null}
 */
export function highestClaimedStage(record) {
  if (!record || typeof record !== 'object') return null;
  const { stages, channels } = /** @type {ProgressiveRecord} */ (record);
  let highest = -1;
  for (const [index, stage] of STAGE_ORDER.entries()) {
    const data = /** @type {{passedAt?: unknown, releaseMatrix?: {ranAt?: unknown, checks?: Record<string, unknown>}, evidence?: Record<string, unknown>} | undefined} */ (stages?.[stage]);
    if (data && (data.passedAt || data.releaseMatrix?.ranAt ||
      Object.values(data.releaseMatrix?.checks ?? {}).includes(true) ||
      Object.values(data.evidence ?? {}).includes(true))) highest = index;
  }
  for (const [channel, gate] of Object.entries(CHANNEL_STAGE_GATE)) {
    if ((/** @type {{state?: unknown} | undefined} */ (channels?.[channel]))?.state === 'live') {
      highest = Math.max(highest, stageIndex(gate));
    }
  }
  return highest < 0 ? null : /** @type {StageName} */ (STAGE_ORDER[highest]);
}

/**
 * @param {unknown} record
 * @param {StageName | null} [target]
 */
export function progressiveReleaseProblems(record, target = highestClaimedStage(record)) {
  const problems = [];

  if (!record || typeof record !== 'object') return ['Record must be a JSON object.'];

  const targetIdx = target === null ? -1 : stageIndex(target);
  if (target !== null && targetIdx < 0) return [`Unknown target stage: ${target}`];

  const releaseVersion = /** @type {{releaseVersion?: unknown}} */ (record).releaseVersion;
  if (typeof releaseVersion !== 'string' || releaseVersion.trim() === '') {
    problems.push('releaseVersion must be a non-empty string.');
  }

  const stages = /** @type {{stages?: unknown}} */ (record).stages;
  if (!stages || typeof stages !== 'object') {
    problems.push('stages must be an object.');
    return problems;
  }

  /** @type {Record<string, number>} */
  const stagePassedAt = {};

  for (let idx = 0; idx < STAGE_ORDER.length; idx += 1) {
    const required = idx <= targetIdx;
    const stageName = /** @type {StageName} */ (STAGE_ORDER[idx]);
    const stageData = /** @type {Record<string, unknown>} */ (/** @type {Record<string, unknown>} */ (stages)[stageName]);
    if (!stageData || typeof stageData !== 'object') {
      problems.push(`Missing stage record: ${stageName}`);
      continue;
    }

    const passedAt = parseIsoDate(stageData.passedAt);
    if (passedAt === null && (required || stageData.passedAt !== '')) {
      problems.push(`${stageName}.passedAt must be an ISO timestamp${required ? '' : ' or empty while pending'}.`);
    } else if (passedAt !== null) {
      stagePassedAt[stageName] = passedAt;
    }

    const matrix = /** @type {Record<string, unknown>} */ (stageData.releaseMatrix);
    if (!matrix || typeof matrix !== 'object') {
      problems.push(`${stageName}.releaseMatrix must be an object.`);
    } else {
      const ranAt = parseIsoDate(matrix.ranAt);
      if (ranAt === null && (required || matrix.ranAt !== '')) {
        problems.push(`${stageName}.releaseMatrix.ranAt must be an ISO timestamp${required ? '' : ' or empty while pending'}.`);
      } else if (passedAt !== null && ranAt !== null && ranAt > passedAt) {
        problems.push(`${stageName}.releaseMatrix.ranAt must be at or before ${stageName}.passedAt.`);
      }

      const checks = /** @type {Record<string, unknown>} */ (matrix.checks);
      if (!checks || typeof checks !== 'object') {
        problems.push(`${stageName}.releaseMatrix.checks must be an object.`);
      } else {
        for (const check of RELEASE_MATRIX_CHECKS) {
          if (required ? checks[check] !== true : typeof checks[check] !== 'boolean') {
            problems.push(`${stageName}.releaseMatrix.checks.${check} must be ${required ? 'true' : 'a boolean'}.`);
          }
        }
      }
    }

    const evidence = /** @type {Record<string, unknown>} */ (stageData.evidence);
    if (!evidence || typeof evidence !== 'object') {
      problems.push(`${stageName}.evidence must be an object.`);
      continue;
    }

    for (const key of STAGE_EVIDENCE_KEYS[stageName]) {
      if (required ? evidence[key] !== true : typeof evidence[key] !== 'boolean') {
        problems.push(`${stageName}.evidence.${key} must be ${required ? 'true' : 'a boolean'}.`);
      }
    }
  }

  const channels = /** @type {{channels?: unknown}} */ (record).channels;
  if (!channels || typeof channels !== 'object') {
    problems.push('channels must be an object.');
    return problems;
  }

  for (const [channel, gateStage] of Object.entries(CHANNEL_STAGE_GATE)) {
    const channelData = /** @type {Record<string, unknown>} */ (/** @type {Record<string, unknown>} */ (channels)[channel]);
    if (!channelData || typeof channelData !== 'object') {
      problems.push(`Missing channel record: channels.${channel}`);
      continue;
    }

    const state = channelData.state;
    if (state !== 'label-only' && state !== 'live') {
      problems.push(`channels.${channel}.state must be 'label-only' or 'live'.`);
      continue;
    }

    const gateIdx = stageIndex(gateStage);
    const gatePassedAt = stagePassedAt[gateStage];

    if (targetIdx >= gateIdx && state !== 'live') {
      problems.push(`channels.${channel}.state must be 'live' by ${gateStage}.`);
    }

    if (targetIdx < gateIdx && state === 'live') {
      problems.push(`channels.${channel}.state cannot be 'live' before ${gateStage}.`);
    }

    if (state === 'live') {
      const switchedAt = parseIsoDate(channelData.switchedAt);
      if (switchedAt === null) {
        problems.push(`channels.${channel}.switchedAt must be an ISO timestamp when state is 'live'.`);
      } else if (gatePassedAt !== undefined && switchedAt < gatePassedAt) {
        problems.push(`channels.${channel}.switchedAt must be at or after ${gateStage}.passedAt.`);
      }
    }
  }

  return problems;
}

/**
 * @param {string[]} argv
 */
function parseArgs(argv) {
  let filePath = 'scripts/progressive-release-record.json';
  /** @type {string | undefined} */
  let target;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if ((arg === '--file' || arg === '-f') && argv[i + 1]) {
      filePath = argv[i + 1];
      i += 1;
      continue;
    }
    if ((arg === '--target' || arg === '-t') && argv[i + 1]) {
      target = argv[i + 1];
      i += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return { filePath, target };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const { filePath, target } = parseArgs(process.argv.slice(2));
    if (!existsSync(filePath)) {
      throw new Error(`Missing progressive release record: ${filePath}`);
    }

    const record = JSON.parse(readFileSync(filePath, 'utf8'));
    const resolvedTarget = target === undefined ? highestClaimedStage(record) : /** @type {StageName} */ (target);
    const problems = progressiveReleaseProblems(record, resolvedTarget);

    for (const problem of problems) console.log(`FAIL ${problem}`);
    if (problems.length) {
      console.log(`\n${problems.length} progressive-release failure(s).`);
      process.exit(1);
    }

    console.log(`PASS progressive release record is valid through ${resolvedTarget ?? 'unreleased'}.`);
  } catch (error) {
    console.error((/** @type {Error} */ (error)).message);
    process.exit(1);
  }
}
