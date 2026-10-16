/* Progressive release evidence gate (phase 2 ticket 22).

   A green build says code compiles. This check proves each release stage has the
   exercises recorded before a channel is marked live on the landing site.
*/
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  CHANNEL_STAGE_GATE,
  RELEASE_MATRIX_CHECKS,
  RELEASE_VERSION_RE,
  STAGE_EVIDENCE_KEYS,
  STAGE_ORDER,
  requiredReleaseStages,
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

/** @param {unknown} record
 * @returns {StageName[]}
 */
function claimedReleaseStages(record) {
  if (!record || typeof record !== 'object') return [];
  const { stages, channels } = /** @type {ProgressiveRecord} */ (record);
  return /** @type {StageName[]} */ (STAGE_ORDER.filter((stage) => {
    const data = /** @type {{passedAt?: unknown, releaseMatrix?: {ranAt?: unknown, checks?: Record<string, unknown>}, evidence?: Record<string, unknown>} | undefined} */ (stages?.[stage]);
    return Boolean(data && (data.passedAt || data.releaseMatrix?.ranAt ||
      Object.values(data.releaseMatrix?.checks ?? {}).includes(true) ||
      Object.values(data.evidence ?? {}).includes(true))) ||
      Object.entries(CHANNEL_STAGE_GATE).some(([channel, gate]) => gate === stage &&
        (/** @type {{state?: unknown} | undefined} */ (channels?.[channel]))?.state === 'live');
  }));
}

/** Infer claims from timestamps, exercise evidence, and live channels.
 * @param {unknown} record
 * @returns {StageName | null}
 */
export function highestClaimedStage(record) {
  return claimedReleaseStages(record).at(-1) ?? null;
}

/** @param {unknown} record
 * @param {StageName | null} target
 */
function requiredStagesForRecord(record, target) {
  return new Set([target, ...claimedReleaseStages(record)].flatMap(requiredReleaseStages));
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

  const requiredStages = requiredStagesForRecord(record, target);
  for (let idx = 0; idx < STAGE_ORDER.length; idx += 1) {
    const stageName = /** @type {StageName} */ (STAGE_ORDER[idx]);
    const required = requiredStages.has(stageName);
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
 * Publication checks use the tested commit, allowing only the evidence record to
 * change afterwards. Keeping the commit outside its own record avoids a hash
 * that would change whenever the evidence is committed.
 * @param {unknown} record
 * @param {StageName} target
 * @param {string} version
 * @param {string} [cwd]
 */
export function publicationReleaseProblems(record, target, version, cwd = process.cwd()) {
  const problems = progressiveReleaseProblems(record, target);
  if (RELEASE_VERSION_RE.exec(version)?.[1] !== version) problems.push('Publication requires a release version.');
  const minimum = version.includes('-') ? 'stage2' : 'stable';
  if (stageIndex(target) < stageIndex(minimum)) {
    problems.push(`Publication of ${version} requires at least ${minimum}.`);
  }
  if (!record || typeof record !== 'object') return problems;
  const candidate = /** @type {{releaseVersion?: unknown, candidateRevision?: unknown, stages?: Record<string, {releaseMatrix?: {ranAt?: unknown}}>}} */ (record);
  if (candidate.releaseVersion !== version) {
    problems.push(`releaseVersion must match publication version ${version}.`);
  }
  const revision = candidate.candidateRevision;
  if (typeof revision !== 'string' || !/^[a-f0-9]{40}$/.test(revision)) {
    problems.push('candidateRevision must be the full tested commit SHA.');
    return problems;
  }
  /** @param {string[]} args */
  const git = (args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  try {
    if (git(['rev-parse', `${revision}^{commit}`]) !== revision) {
      problems.push('candidateRevision must name a commit.');
      return problems;
    }
    git(['merge-base', '--is-ancestor', revision, 'HEAD']);
    const changed = git(['diff', '--name-only', revision, 'HEAD', '--', '.', ':(exclude)scripts/progressive-release-record.json']);
    if (changed) problems.push(`Publication source differs from candidateRevision: ${changed.split('\n').join(', ')}.`);
    const committedAt = Number(git(['show', '-s', '--format=%ct', revision])) * 1000;
    for (const stage of requiredStagesForRecord(record, target)) {
      const ranAt = parseIsoDate(candidate.stages?.[stage]?.releaseMatrix?.ranAt);
      if (ranAt !== null && ranAt < committedAt) {
        problems.push(`${stage}.releaseMatrix.ranAt predates candidateRevision; rerun the matrix on this candidate.`);
      }
    }
  } catch {
    problems.push('candidateRevision must be an available ancestor of the publication commit.');
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
  /** @type {string | undefined} */
  let publicationVersion;

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
    if (arg === '--publication-version' && argv[i + 1]) {
      publicationVersion = argv[++i];
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (publicationVersion !== undefined && target === undefined) throw new Error('Publication requires an explicit --target.');
  return { filePath, target, publicationVersion };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const { filePath, target, publicationVersion } = parseArgs(process.argv.slice(2));
    if (!existsSync(filePath)) {
      throw new Error(`Missing progressive release record: ${filePath}`);
    }

    const record = JSON.parse(readFileSync(filePath, 'utf8'));
    const resolvedTarget = target === undefined ? highestClaimedStage(record) : /** @type {StageName} */ (target);
    const problems = publicationVersion === undefined
      ? progressiveReleaseProblems(record, resolvedTarget)
      : publicationReleaseProblems(record, /** @type {StageName} */ (resolvedTarget), publicationVersion);

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
