import { spawnSync, execFileSync, type ExecFileSyncOptions } from 'node:child_process';
import { createHash, X509Certificate } from 'node:crypto';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { strToU8, zipSync } from 'fflate';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { androidOcrAssetProblems, androidPermissionSetProblems, androidSignatureProblems, RELEASE_SIGNERS, expectedArtifactNames, releaseArtifactProblems } from '../scripts/check-release-artifacts.mjs';

// ZIP fixtures have no binary manifest. Supply the platform tool's receipt;
// candidate verification invokes real aapt2 against the actual APK.
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  const { readFileSync } = await import('node:fs');
  return { ...actual, execFileSync(command: string, args: string[], options: ExecFileSyncOptions = {}) {
    if (command === 'aapt2' && args[0] === 'dump') return readFileSync(`${args[2]}.permissions`, 'utf8');
    return actual.execFileSync(command, args, options);
  } };
});

const PERMISSION_DUMP = `package: dev.engender.app
uses-permission: name='android.permission.CAMERA'
uses-permission: name='android.permission.MODIFY_AUDIO_SETTINGS'
uses-permission: name='android.permission.POST_NOTIFICATIONS'
uses-permission: name='android.permission.RECEIVE_BOOT_COMPLETED'
uses-permission: name='android.permission.RECORD_AUDIO'
uses-permission: name='android.permission.SCHEDULE_EXACT_ALARM'
uses-permission: name='android.permission.USE_BIOMETRIC'
uses-permission: name='android.permission.USE_FINGERPRINT'
uses-permission: name='android.permission.WAKE_LOCK'
uses-permission: name='dev.engender.app.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION'
`;

function sha256(path: string) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

const OCR_FILES = ['worker.min.js', 'tesseract-core.wasm.js',
  'lang-data/eng.traineddata', 'lang-data/pol.traineddata'];

function ocrApk(root: string, apk: string, packaged = OCR_FILES) {
  const webBuildDir = join(root, 'web');
  for (const name of OCR_FILES) {
    const path = join(webBuildDir, 'tesseract', name);
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, `synthetic ${name}`);
  }
  writeFileSync(apk, zipSync(Object.fromEntries(packaged.map(name => [
    `assets/public/tesseract/${name}`, strToU8(`synthetic ${name}`)
  ]))));
  writeFileSync(`${apk}.permissions`, PERMISSION_DUMP);
  return webBuildDir;
}

describe('releaseArtifactProblems', () => {
  const roots: string[] = [];
  afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
  it('passes when required names, checksums and metadata all match', () => {
    const root = mkdtempSync(join(tmpdir(), 'gd-release-artifacts-'));
    roots.push(root);
    const releaseDir = join(root, 'dist', 'release');
    const androidBuildDir = join(root, 'android', 'app', 'build');
    mkdirSync(releaseDir, { recursive: true });
    mkdirSync(join(androidBuildDir, 'outputs', 'apk', 'release'), { recursive: true });
    mkdirSync(join(androidBuildDir, 'outputs', 'bundle', 'release'), { recursive: true });

    const version = '1.2.3';
    const versionCode = 1002003999;
    const names = expectedArtifactNames(version);
    for (const name of names) writeFileSync(join(releaseDir, name), `payload for ${name}\n`);
    const webBuildDir = ocrApk(root, join(releaseDir, `engender-android-release-${version}.apk`));

    const lines = names.map((name) => `${sha256(join(releaseDir, name))}  ${name}`);
    writeFileSync(join(releaseDir, 'SHA256SUMS'), `${lines.join('\n')}\n`);

    const metadata = { versionCode, versionName: version, elements: [{ versionCode, versionName: version }] };
    writeFileSync(
      join(androidBuildDir, 'outputs', 'apk', 'release', 'output-metadata.json'),
      `${JSON.stringify(metadata, null, 2)}\n`
    );
    writeFileSync(
      join(androidBuildDir, 'outputs', 'bundle', 'release', 'output-metadata.json'),
      `${JSON.stringify(metadata, null, 2)}\n`
    );

    expect(releaseArtifactProblems({ version, versionCode, releaseDir, androidBuildDir, webBuildDir })).toEqual([]);
    const apk = join(releaseDir, `engender-android-release-${version}.apk`);
    writeFileSync(`${apk}.permissions`, `${PERMISSION_DUMP}uses-permission: name='android.permission.READ_CONTACTS'\n`);
    expect(releaseArtifactProblems({ version, versionCode, releaseDir, androidBuildDir, webBuildDir }))
      .toContain('Unexpected APK permission: android.permission.READ_CONTACTS');
    rmSync(`${apk}.permissions`);
    expect(releaseArtifactProblems({ version, versionCode, releaseDir, androidBuildDir, webBuildDir }))
      .toContain(`Cannot inspect APK permissions with aapt2: ${apk}`);
  });

  it('reports checksum and metadata drift', () => {
    const root = mkdtempSync(join(tmpdir(), 'gd-release-artifacts-'));
    roots.push(root);
    const releaseDir = join(root, 'dist', 'release');
    const androidBuildDir = join(root, 'android', 'app', 'build');
    mkdirSync(releaseDir, { recursive: true });
    mkdirSync(join(androidBuildDir, 'outputs', 'apk', 'release'), { recursive: true });
    mkdirSync(join(androidBuildDir, 'outputs', 'bundle', 'release'), { recursive: true });

    const version = '1.2.3';
    const versionCode = 1002003999;
    const names = expectedArtifactNames(version);
    for (const name of names) writeFileSync(join(releaseDir, name), `payload for ${name}\n`);
    const webBuildDir = ocrApk(root, join(releaseDir, `engender-android-release-${version}.apk`));

    const wrong = names.map((name) => `${'0'.repeat(64)}  ${name}`);
    writeFileSync(join(releaseDir, 'SHA256SUMS'), `${wrong.join('\n')}\n`);

    const apkMetadata = { versionCode: 7, versionName: '9.9.9', elements: [{ versionCode: 7, versionName: '9.9.9' }] };
    const aabMetadata = { versionCode, versionName: version, elements: [{ versionCode, versionName: version }] };
    writeFileSync(
      join(androidBuildDir, 'outputs', 'apk', 'release', 'output-metadata.json'),
      `${JSON.stringify(apkMetadata, null, 2)}\n`
    );
    writeFileSync(
      join(androidBuildDir, 'outputs', 'bundle', 'release', 'output-metadata.json'),
      `${JSON.stringify(aabMetadata, null, 2)}\n`
    );

    const problems = releaseArtifactProblems({ version, versionCode, releaseDir, androidBuildDir, webBuildDir });
    expect(problems.some((p) => /SHA256 mismatch/.test(p))).toBe(true);
    expect(problems.some((p) => /APK versionName is/.test(p))).toBe(true);
    expect(problems.some((p) => /APK versionCode is/.test(p))).toBe(true);
  });
  it.each(['eng', 'pol'])('rejects missing or renamed %s language data in the APK', (lang) => {
    const root = mkdtempSync(join(tmpdir(), 'gd-release-artifacts-'));
    roots.push(root);
    const apk = join(root, 'fixture.apk');
    const path = `lang-data/${lang}.traineddata`;
    const remaining = OCR_FILES.filter((name) => name !== path);
    const webBuildDir = ocrApk(root, apk, remaining);
    const problem = `Missing APK OCR asset: assets/public/tesseract/${path}`;
    expect(androidOcrAssetProblems(apk, webBuildDir)).toContain(problem);
    ocrApk(root, apk, [...remaining, `${path}.gz`]);
    expect(androidOcrAssetProblems(apk, webBuildDir)).toContain(problem);
  });

});

describe('complete APK permission gate', () => {
  it('accepts the reviewed complete set, including AndroidX permissions', () => {
    expect(androidPermissionSetProblems(PERMISSION_DUMP)).toEqual([]);
  });
  it.each(['INTERNET', 'ACCESS_NETWORK_STATE', 'FOREGROUND_SERVICE', 'READ_CONTACTS'])
    ('rejects dependency-added %s', (name) => {
      expect(androidPermissionSetProblems(`${PERMISSION_DUMP}uses-permission: name='android.permission.${name}'\n`))
        .toEqual([`Unexpected APK permission: android.permission.${name}`]);
    });
  it('refuses a missing wake lock and an unreadable permission receipt', () => {
    expect(androidPermissionSetProblems(PERMISSION_DUMP.replace("uses-permission: name='android.permission.WAKE_LOCK'\n", '')))
      .toEqual(['Missing APK permission: android.permission.WAKE_LOCK']);
    expect(androidPermissionSetProblems('')).toHaveLength(10);
  });
  it('inspects sdk-specific permission rows too', () => {
    expect(androidPermissionSetProblems(`${PERMISSION_DUMP}uses-permission-sdk-23: name='android.permission.READ_CONTACTS'\n`))
      .toEqual(['Unexpected APK permission: android.permission.READ_CONTACTS']);
  });
});


describe('AAB signature verification with platform tools', () => {
  const roots: string[] = [];
  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });
  function fixture() {
    const root = mkdtempSync(join(tmpdir(), 'gd-aab-signature-'));
    roots.push(root);
    const aab = join(root, 'engender-android-release-1.0.0.aab');
    writeFileSync(join(root, 'payload.txt'), 'release bundle payload\n');
    execFileSync('jar', ['--create', '--file', aab, '-C', root, 'payload.txt']);
    return { root, aab };
  }

  function verification(root: string) {
    const result = spawnSync(process.execPath, ['scripts/check-release-artifacts.mjs'], {
      encoding: 'utf8',
      env: {
        ...process.env,
        ENGENDER_VERSION: '1.0.0',
        ENGENDER_VERSION_CODE: '1000000999',
        ENGENDER_RELEASE_DIR: root,
        ENGENDER_ANDROID_BUILD_DIR: root
      }
    });
    return result.stdout + result.stderr;
  }

  it('rejects an unsigned bundle even when jarsigner exits zero', () => {
    const { root, aab } = fixture();
    const unsigned = spawnSync('jarsigner', ['-verify', aab], { encoding: 'utf8' });
    expect(unsigned.status).toBe(0);
    expect(unsigned.stdout).toContain('jar is unsigned.');
    expect(verification(root)).toContain(`AAB signature verification failed: ${aab}`);
  }, 15000);

  function signedFixture() {
    const { root, aab } = fixture();
    const keystore = join(root, 'test.p12');
    execFileSync('keytool', [
      '-genkeypair', '-keystore', keystore, '-storetype', 'PKCS12', '-alias', 'test',
      '-storepass', 'test-password', '-keypass', 'test-password', '-keyalg', 'RSA',
      '-validity', '2', '-dname', 'CN=Release test'
    ], { stdio: 'pipe' });
    execFileSync('jarsigner', ['-keystore', keystore, '-storepass', 'test-password', aab, 'test'], { stdio: 'pipe' });
    return { root, aab };
  }

  it('rejects payload entries appended after signing even when jarsigner verifies the signed entries', () => {
    const { root, aab } = signedFixture();
    writeFileSync(join(root, 'unsigned.txt'), 'unsigned payload\n');
    execFileSync('jar', ['--update', '--file', aab, '-C', root, 'unsigned.txt']);
    const partial = spawnSync('jarsigner', ['-J-Duser.language=en', '-J-Duser.country=US', '-verify', aab], { encoding: 'utf8' });
    expect(partial.status).toBe(0);
    expect(partial.stdout).toContain('jar verified.');
    expect(partial.stdout).toContain('unsigned entries which have not been integrity-checked');
    expect(verification(root)).toContain(`AAB signature verification failed: ${aab}`);
  }, 15000);

  it('rejects a valid unrecorded self-signed certificate and still detects tampering', () => {
    const { root, aab } = signedFixture();
    expect(verification(root)).not.toContain('AAB signature verification failed:');
    expect(verification(root)).toContain('AAB signer SHA-256 mismatch:');
    writeFileSync(join(root, 'payload.txt'), 'tampered bundle payload\n');
    execFileSync('jar', ['--update', '--file', aab, '-C', root, 'payload.txt']);
    expect(verification(root)).toContain(`AAB signature verification failed: ${aab}`);
  }, 15000);
});


describe('pinned Android signing certificates with platform tools', () => {
  let root: string;
  let apk: string;
  let aab: string;
  let apkPin: string;
  let aabPin: string;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'gd-release-signers-'));
    const sdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;
    if (!sdk) throw new Error('Android SDK is required for signed APK fixtures (ANDROID_HOME).');
    const versions = readdirSync(join(sdk, 'build-tools')).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
    const buildTools = versions.map(version => join(sdk, 'build-tools', version))
      .find(path => existsSync(join(path, 'apksigner')) && existsSync(join(path, 'aapt2')));
    if (!buildTools) throw new Error('Android build-tools with apksigner and aapt2 are required.');
    vi.stubEnv('PATH', `${buildTools}${delimiter}${process.env.PATH}`);
    const platforms = readdirSync(join(sdk, 'platforms')).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
    const androidJar = platforms.map(platform => join(sdk, 'platforms', platform, 'android.jar')).find(existsSync);
    if (!androidJar) throw new Error('Android SDK platform android.jar is required.');
    apk = join(root, 'fixture.apk');
    aab = join(root, 'fixture.aab');
    const manifest = join(root, 'AndroidManifest.xml');
    writeFileSync(manifest, `<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="dev.engender.signerfixture">
      <uses-sdk android:minSdkVersion="26" android:targetSdkVersion="35"/><application/></manifest>`);
    execFileSync('aapt2', ['link', '-o', apk, '-I', androidJar, '--manifest', manifest], { stdio: 'pipe' });
    writeFileSync(join(root, 'payload.txt'), 'synthetic release bundle payload');
    execFileSync('jar', ['--create', '--file', aab, '-C', root, 'payload.txt']);
    function key(name: string) {
      const keystore = join(root, `${name}.p12`);
      execFileSync('keytool', ['-genkeypair', '-keystore', keystore, '-storetype', 'PKCS12',
        '-alias', name, '-storepass', 'test-password', '-keyalg', 'RSA', '-validity', '2',
        '-dname', `CN=Disposable ${name} fixture`], { stdio: 'pipe' });
      const certificate = execFileSync('keytool', ['-exportcert', '-keystore', keystore,
        '-storepass', 'test-password', '-alias', name], { stdio: 'pipe' });
      const pin = createHash('sha256').update(new X509Certificate(certificate).raw).digest('hex');
      return { keystore, pin };
    }
    const apkKey = key('apk');
    const aabKey = key('upload');
    apkPin = apkKey.pin;
    aabPin = aabKey.pin;
    execFileSync('apksigner', ['sign', '--ks', apkKey.keystore, '--ks-pass', 'pass:test-password',
      '--v4-signing-enabled', 'false', apk], { stdio: 'pipe' });
    execFileSync('jarsigner', ['-keystore', aabKey.keystore, '-storepass', 'test-password', aab, 'upload'], { stdio: 'pipe' });
  }, 15000);

  afterAll(() => {
    vi.unstubAllEnvs();
    if (root) rmSync(root, { recursive: true, force: true });
  });

  it('accepts valid artifacts with their expected certificates', () => {
    expect(androidSignatureProblems({ apk, aab }, { apk: apkPin, aab: aabPin })).toEqual([]);
  });

  it('rejects valid signatures from the other artifact role', () => {
    expect(execFileSync('apksigner', ['verify', '--print-certs', apk], { encoding: 'utf8' })).toContain(apkPin);
    expect(execFileSync('jarsigner', ['-J-Duser.language=en', '-verify', aab], { encoding: 'utf8' })).toContain('jar verified.');
    const problems = androidSignatureProblems({ apk, aab }, { apk: aabPin, aab: apkPin });
    expect(problems).toHaveLength(2);
    expect(problems[0]).toContain('APK signer SHA-256 mismatch:');
    expect(problems[1]).toContain('AAB signer SHA-256 mismatch:');
  });

  it('defaults to the recorded release certificate for each role', () => {
    expect(RELEASE_SIGNERS).toEqual({
      apk: '093e1e2967ca72559e0bef57e0a99d2584f08b4ba4c662ffbca7101ac4446f86',
      aab: '093e1e2967ca72559e0bef57e0a99d2584f08b4ba4c662ffbca7101ac4446f86'
    });
    expect(androidSignatureProblems({ apk, aab })).toHaveLength(2);
  });

  it('uses the fixed pins in the release CLI', () => {
    const version = '1.0.0';
    const releaseApk = join(root, `engender-android-release-${version}.apk`);
    const releaseAab = join(root, `engender-android-release-${version}.aab`);
    writeFileSync(releaseApk, readFileSync(apk));
    writeFileSync(releaseAab, readFileSync(aab));
    const result = spawnSync(process.execPath, ['scripts/check-release-artifacts.mjs'], {
      encoding: 'utf8', env: { ...process.env, ENGENDER_VERSION: version,
        ENGENDER_VERSION_CODE: '1000000999', ENGENDER_RELEASE_DIR: root, ENGENDER_ANDROID_BUILD_DIR: root }
    });
    expect(result.status).toBe(1);
    expect(result.stdout).toContain(`APK signer SHA-256 mismatch: expected ${RELEASE_SIGNERS.apk}; found ${apkPin}`);
    expect(result.stdout).toContain(`AAB signer SHA-256 mismatch: expected ${RELEASE_SIGNERS.aab}; found ${aabPin}`);
    expect(result.stdout).not.toContain('signature verification failed:');
  });

  it('rejects an extra AAB signer even when the expected signer is present', () => {
    execFileSync('jarsigner', ['-keystore', join(root, 'apk.p12'), '-storepass', 'test-password', aab, 'apk'], { stdio: 'pipe' });
    expect(execFileSync('jarsigner', ['-J-Duser.language=en', '-verify', aab], { encoding: 'utf8' })).toContain('jar verified.');
    expect(androidSignatureProblems({ apk, aab }, { apk: apkPin, aab: aabPin }))
      .toEqual([expect.stringContaining('AAB signer SHA-256 mismatch:')]);
  });
});
