/* Ticket 18 release-artifact checks: expected names, checksum integrity,
   signed Android artifacts, and one version value across artifacts. */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

/**
 * @param {string} version
 */
export function expectedArtifactNames(version) {
  return [
    `gender-diary-web-${version}.tar.gz`,
    `gender-diary-src-${version}.tar.gz`,
    `gender-diary-android-release-${version}.apk`,
    `gender-diary-android-release-${version}.aab`
  ];
}

/**
 * @param {string} text
 */
export function parseSums(text) {
  const map = new Map();
  for (const line of text.split(/\r?\n/)) {
    const match = /^([a-f0-9]{64})\s{2}(.+)$/.exec(line.trim());
    if (match) map.set(match[2], match[1]);
  }
  return map;
}

/**
 * @param {string} path
 */
function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

/**
 * @param {{version: string, releaseDir: string, androidBuildDir: string, versionCode: number}} input
 */
export function releaseArtifactProblems(input) {
  const { version, releaseDir, androidBuildDir, versionCode } = input;
  const problems = [];
  const expected = expectedArtifactNames(version);

  for (const name of expected) {
    if (!existsSync(join(releaseDir, name))) problems.push(`Missing artifact: ${name}`);
  }

  const sumsPath = join(releaseDir, 'SHA256SUMS');
  if (!existsSync(sumsPath)) {
    problems.push('Missing SHA256SUMS');
  } else {
    const sums = parseSums(readFileSync(sumsPath, 'utf8'));
    for (const name of expected) {
      const path = join(releaseDir, name);
      if (!existsSync(path)) continue;
      const listed = sums.get(name);
      if (!listed) {
        problems.push(`SHA256SUMS misses ${name}`);
      } else {
        const actual = sha256(path);
        if (listed !== actual) problems.push(`SHA256 mismatch for ${name}`);
      }
    }
  }

  for (const name of ['app-debug.apk', 'unsigned']) {
    for (const expectedName of expected) {
      if (expectedName.includes(name)) {
        problems.push(`Artifact name must never contain ${name}: ${expectedName}`);
      }
    }
  }

  const apkMeta = join(androidBuildDir, 'outputs/apk/release/output-metadata.json');
  const aabMeta = join(androidBuildDir, 'outputs/bundle/release/output-metadata.json');
  for (const [label, path] of [
    ['APK', apkMeta],
    ['AAB', aabMeta]
  ]) {
    if (!existsSync(path)) {
      problems.push(`Missing ${label} output metadata: ${path}`);
      continue;
    }
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    const element = parsed?.elements?.[0];
    const gotName = String(parsed?.versionName ?? element?.versionName ?? '');
    const gotCode = Number(parsed?.versionCode ?? element?.versionCode ?? -1);
    if (gotName !== version) problems.push(`${label} versionName is ${gotName}, expected ${version}`);
    if (gotCode !== versionCode) problems.push(`${label} versionCode is ${gotCode}, expected ${versionCode}`);
  }

  return problems;
}

/**
 * @param {string} command
 * @param {string[]} args
 */
function run(command, args) {
  execFileSync(command, args, { stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8' });
}

/**
 * @param {string} command
 */
function commandExists(command) {
  try {
    execFileSync('sh', ['-c', `command -v ${command}`], { stdio: ['ignore', 'pipe', 'ignore'] });
    return true;
  } catch {
    return false;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const version = process.env.GENDER_DIARY_VERSION?.trim();
  const versionCode = Number.parseInt(process.env.GENDER_DIARY_VERSION_CODE ?? '', 10);
  if (!version || !Number.isInteger(versionCode)) {
    console.error('GENDER_DIARY_VERSION and GENDER_DIARY_VERSION_CODE are required.');
    process.exit(1);
  }

  const releaseDir = process.env.GENDER_DIARY_RELEASE_DIR ?? 'dist/release';
  const androidBuildDir = process.env.GENDER_DIARY_ANDROID_BUILD_DIR ?? 'android/app/build';
  const apk = join(releaseDir, `gender-diary-android-release-${version}.apk`);
  const aab = join(releaseDir, `gender-diary-android-release-${version}.aab`);

  const problems = releaseArtifactProblems({ version, releaseDir, androidBuildDir, versionCode });

  if (!commandExists('apksigner')) {
    problems.push('apksigner is not available on PATH');
  } else {
    try {
      run('apksigner', ['verify', '--print-certs', apk]);
    } catch {
      problems.push(`APK signature verification failed: ${apk}`);
    }
  }

  if (!commandExists('jarsigner')) {
    problems.push('jarsigner is not available on PATH');
  } else {
    try {
      run('jarsigner', ['-verify', '-strict', aab]);
    } catch {
      problems.push(`AAB signature verification failed: ${aab}`);
    }
  }

  for (const problem of problems) console.log(`FAIL ${problem}`);
  if (problems.length) {
    console.log(`\n${problems.length} release-artifact failure(s).`);
    process.exit(1);
  }
  console.log('PASS release artifacts have expected names, checksums, signatures and Android version metadata.');
}
