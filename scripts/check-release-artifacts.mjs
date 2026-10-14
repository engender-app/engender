/* Release artifacts: names, checksums, Android permissions and signatures,
   and one version value across artifacts. */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
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

/** The complete installed set, including AndroidX merge-ins.
 * @param {string} applicationId
 */
export function expectedAndroidPermissions(applicationId = 'dev.engender.app') {
  return ['CAMERA', 'MODIFY_AUDIO_SETTINGS', 'POST_NOTIFICATIONS', 'RECEIVE_BOOT_COMPLETED',
    'RECORD_AUDIO', 'SCHEDULE_EXACT_ALARM', 'USE_BIOMETRIC', 'USE_FINGERPRINT', 'WAKE_LOCK']
    .map(name => `android.permission.${name}`)
    .concat(`${applicationId}.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`);
}

/** Check aapt2's uses-permission rows, not source-manifest declarations.
 * @param {string} dump
 * @param {string} applicationId
 */
export function androidPermissionSetProblems(dump, applicationId = 'dev.engender.app') {
  const actual = new Set([...dump.matchAll(/^uses-permission(?:-sdk-\d+)?: name='([^']+)'/gm)]
    .map(match => match[1]));
  const expected = new Set(expectedAndroidPermissions(applicationId));
  return [...[...actual].filter(name => !expected.has(name)).map(name => `Unexpected APK permission: ${name}`),
    ...[...expected].filter(name => !actual.has(name)).map(name => `Missing APK permission: ${name}`)];
}

/** @param {string} apk @param {string} applicationId */
export function androidPermissionProblems(apk, applicationId = 'dev.engender.app') {
  try {
    return androidPermissionSetProblems(execFileSync('aapt2', ['dump', 'permissions', apk],
      { encoding: 'utf8', stdio: 'pipe' }), applicationId);
  } catch {
    return [`Cannot inspect APK permissions with aapt2: ${apk}`];
  }
}

/** Check the requested OCR names, including any additional web OCR assets.
 * @param {string} apk
 * @param {string} webBuildDir
 */
export function androidOcrAssetProblems(apk, webBuildDir = 'build') {
  let required = ['tesseract/worker.min.js', 'tesseract/tesseract-core.wasm.js',
    'tesseract/tesseract-core.wasm', 'tesseract/lang-data/eng.traineddata',
    'tesseract/lang-data/pol.traineddata'];
  const manifest = join(webBuildDir, 'tesseract/assets.json');
  if (existsSync(manifest)) {
    const { generation } = JSON.parse(readFileSync(manifest, 'utf8'));
    if (!/^[a-f0-9]{64}$/.test(generation)) return ['Invalid OCR generation'];
    required = ['tesseract.esm.min.js', 'worker.min.js', 'tesseract-core.wasm.js',
      'tesseract-core.wasm', 'lang-data/eng.traineddata', 'lang-data/pol.traineddata']
      .map(name => `tesseract/${generation}/${name}`);
  }
  const problems = required.filter((path) => !existsSync(join(webBuildDir, path)))
    .map((path) => `Missing web OCR asset: ${path}`);
  const paths = new Set(required);
  /** @param {string} directory @param {string} prefix */
  function collect(directory, prefix) {
    if (!existsSync(directory)) return;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = `${prefix}/${entry.name}`;
      if (entry.isDirectory()) collect(join(directory, entry.name), path);
      else paths.add(path);
    }
  }
  collect(join(webBuildDir, 'tesseract'), 'tesseract');
  let packaged;
  try {
    packaged = new Set(execFileSync('unzip', ['-Z1', apk], { encoding: 'utf8', stdio: 'pipe' }).split(/\r?\n/));
  } catch {
    return [...problems, `Cannot inspect APK OCR assets: ${apk}`];
  }
  for (const path of paths) {
    if (!packaged.has(`assets/public/${path}`)) problems.push(`Missing APK OCR asset: assets/public/${path}`);
  }
  return problems;
}

/**
 * @param {{version: string, releaseDir: string, androidBuildDir: string, versionCode: number, webBuildDir?: string}} input
 */
export function releaseArtifactProblems(input) {
  const { version, releaseDir, androidBuildDir, versionCode } = input;
  const problems = [];
  const expected = expectedArtifactNames(version);

  for (const name of expected) {
    if (!existsSync(join(releaseDir, name))) problems.push(`Missing artifact: ${name}`);
  }
  const apk = join(releaseDir, `engender-android-release-${version}.apk`);
  if (existsSync(apk)) {
    problems.push(...androidOcrAssetProblems(apk, input.webBuildDir), ...androidPermissionProblems(apk));
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
      // Android certificates are self-signed, so CA trust is not required.
      // jarsigner exits zero for unsigned archives and partially signed ones.
      // Require verification and reject unchecked entries in a fixed language.
      const result = run('jarsigner', ['-J-Duser.language=en', '-J-Duser.country=US', '-verify', aab]);
      if (!result.includes('jar verified.') || result.includes('unsigned entries')) {
        throw new Error('AAB contains unsigned payload');
      }
    } catch {
      problems.push(`AAB signature verification failed: ${aab}`);
    }
  }

  for (const problem of problems) console.log(`FAIL ${problem}`);
  if (problems.length) {
    console.log(`\n${problems.length} release-artifact failure(s).`);
    process.exit(1);
  }
  console.log('PASS release artifacts have expected names, checksums, signatures, Android permissions and version metadata.');
}
