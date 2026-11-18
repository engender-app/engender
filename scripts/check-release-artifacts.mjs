/* Ticket 18 release-artifact checks: expected names, checksum integrity,
   Android artifacts signed with the pinned developer certificate, and one
   version value across artifacts. */
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
    `engender-web-${version}.tar.gz`,
    `engender-src-${version}.tar.gz`,
    `engender-android-release-${version}.apk`,
    `engender-android-release-${version}.aab`
  ];
}

/* The developer certificate that every GitHub, Obtainium and F-Droid install
   carries, as published in SECURITY.md and on the landing site. A release
   signed with any other key cannot update those installs (Android refuses
   it), and uninstalling to get past that deletes the journal. So a replaced
   keystore secret has to stop the release here rather than reach users.
   Changing it is a key rotation: see the release skill. */
export const RELEASE_SIGNING_SHA256 = '093e1e2967ca72559e0bef57e0a99d2584f08b4ba4c662ffbca7101ac4446f86';

/**
 * SHA-256 certificate digests in `apksigner verify --print-certs` or
 * `keytool -printcert -jarfile` output, as lowercase hex without colons.
 * @param {string} text
 */
export function certificateDigests(text) {
  const digests = [];
  for (const match of text.matchAll(/(?:certificate SHA-256 digest:|SHA256:)\s*([0-9A-Fa-f:]+)/g)) {
    digests.push(match[1].replaceAll(':', '').toLowerCase());
  }
  return digests;
}

/**
 * @param {string} label
 * @param {string} text
 */
export function signingCertificateProblem(label, text) {
  const digests = [...new Set(certificateDigests(text))];
  if (digests.length === 1 && digests[0] === RELEASE_SIGNING_SHA256) return null;
  const found = digests.length ? digests.join(', ') : 'unreadable';
  return `${label} signing certificate is ${found}, expected ${RELEASE_SIGNING_SHA256}`;
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

  // AGP does not write an output-metadata.json with version fields for
  // bundleRelease - only APK variants get one. The APK and the AAB share the
  // same defaultConfig in the same Gradle invocation, so checking the APK's
  // versionName/versionCode here covers both artifacts.
  const apkMeta = join(androidBuildDir, 'outputs/apk/release/output-metadata.json');
  if (!existsSync(apkMeta)) {
    problems.push(`Missing APK output metadata: ${apkMeta}`);
  } else {
    const parsed = JSON.parse(readFileSync(apkMeta, 'utf8'));
    const element = parsed?.elements?.[0];
    const gotName = String(parsed?.versionName ?? element?.versionName ?? '');
    const gotCode = Number(parsed?.versionCode ?? element?.versionCode ?? -1);
    if (gotName !== version) problems.push(`APK versionName is ${gotName}, expected ${version}`);
    if (gotCode !== versionCode) problems.push(`APK versionCode is ${gotCode}, expected ${versionCode}`);
  }

  return problems;
}

/**
 * @param {string} command
 * @param {string[]} args
 */
function run(command, args) {
  return execFileSync(command, args, { stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8' });
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
  const version = process.env.ENGENDER_VERSION?.trim();
  const versionCode = Number.parseInt(process.env.ENGENDER_VERSION_CODE ?? '', 10);
  if (!version || !Number.isInteger(versionCode)) {
    console.error('ENGENDER_VERSION and ENGENDER_VERSION_CODE are required.');
    process.exit(1);
  }

  const releaseDir = process.env.ENGENDER_RELEASE_DIR ?? 'dist/release';
  const androidBuildDir = process.env.ENGENDER_ANDROID_BUILD_DIR ?? 'android/app/build';
  const apk = join(releaseDir, `engender-android-release-${version}.apk`);
  const aab = join(releaseDir, `engender-android-release-${version}.aab`);

  const problems = releaseArtifactProblems({ version, releaseDir, androidBuildDir, versionCode });

  if (!commandExists('apksigner')) {
    problems.push('apksigner is not available on PATH');
  } else {
    let certificates = null;
    try {
      certificates = run('apksigner', ['verify', '--print-certs', apk]);
    } catch {
      problems.push(`APK signature verification failed: ${apk}`);
    }
    if (certificates !== null) {
      const problem = signingCertificateProblem('APK', certificates);
      if (problem) problems.push(problem);
    }
  }

  if (!commandExists('jarsigner')) {
    problems.push('jarsigner is not available on PATH');
  } else {
    try {
      // Android certificates are self-signed, so CA trust is not required.
      // jarsigner exits zero for unsigned archives and partially signed ones.
      // Require verification and reject unchecked entries in a fixed language.
      const result = run('jarsigner', ['-J-Duser.language=en', '-J-Duser.country=US', '-verify', aab]);
      if (!result.includes('jar verified.') || result.includes('unsigned entries')) {
        throw new Error('AAB contains unsigned payload');
      }
      const problem = signingCertificateProblem(
        'AAB',
        run('keytool', ['-J-Duser.language=en', '-J-Duser.country=US', '-printcert', '-jarfile', aab])
      );
      if (problem) problems.push(problem);
    } catch {
      problems.push(`AAB signature verification failed: ${aab}`);
    }
  }

  for (const problem of problems) console.log(`FAIL ${problem}`);
  if (problems.length) {
    console.log(`\n${problems.length} release-artifact failure(s).`);
    process.exit(1);
  }
  console.log('PASS release artifacts have expected names, checksums, pinned signatures and Android version metadata.');
}
