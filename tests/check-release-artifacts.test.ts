import { spawnSync, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  RELEASE_SIGNING_SHA256,
  certificateDigests,
  expectedArtifactNames,
  releaseArtifactProblems,
  signingCertificateProblem
} from '../scripts/check-release-artifacts.mjs';

function sha256(path: string) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

describe('releaseArtifactProblems', () => {
  it('passes when required names, checksums and metadata all match', () => {
    const root = mkdtempSync(join(tmpdir(), 'gd-release-artifacts-'));
    const releaseDir = join(root, 'dist', 'release');
    const androidBuildDir = join(root, 'android', 'app', 'build');
    mkdirSync(releaseDir, { recursive: true });
    mkdirSync(join(androidBuildDir, 'outputs', 'apk', 'release'), { recursive: true });
    mkdirSync(join(androidBuildDir, 'outputs', 'bundle', 'release'), { recursive: true });

    const version = '1.2.3';
    const versionCode = 1002003999;
    const names = expectedArtifactNames(version);
    for (const name of names) writeFileSync(join(releaseDir, name), `payload for ${name}\n`);

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

    expect(releaseArtifactProblems({ version, versionCode, releaseDir, androidBuildDir })).toEqual([]);
  });

  it('reports checksum and metadata drift', () => {
    const root = mkdtempSync(join(tmpdir(), 'gd-release-artifacts-'));
    const releaseDir = join(root, 'dist', 'release');
    const androidBuildDir = join(root, 'android', 'app', 'build');
    mkdirSync(releaseDir, { recursive: true });
    mkdirSync(join(androidBuildDir, 'outputs', 'apk', 'release'), { recursive: true });
    mkdirSync(join(androidBuildDir, 'outputs', 'bundle', 'release'), { recursive: true });

    const version = '1.2.3';
    const versionCode = 1002003999;
    const names = expectedArtifactNames(version);
    for (const name of names) writeFileSync(join(releaseDir, name), `payload for ${name}\n`);

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

    const problems = releaseArtifactProblems({ version, versionCode, releaseDir, androidBuildDir });
    expect(problems.some((p) => /SHA256 mismatch/.test(p))).toBe(true);
    expect(problems.some((p) => /APK versionName is/.test(p))).toBe(true);
    expect(problems.some((p) => /APK versionCode is/.test(p))).toBe(true);
  });
});


const PINNED = '093e1e2967ca72559e0bef57e0a99d2584f08b4ba4c662ffbca7101ac4446f86';
const OTHER = 'aa'.repeat(32);
const colons = (hex: string) => hex.toUpperCase().match(/../g)!.join(':');
const apksignerOutput = (digest: string) =>
  `Signer #1 certificate DN: CN=engender, O=engender, C=PL\nSigner #1 certificate SHA-256 digest: ${digest}\n` +
  `Signer #1 certificate SHA-1 digest: ${'b'.repeat(40)}\n`;
const keytoolOutput = (digest: string) =>
  `Signer #1:\n\nCertificate #1:\nOwner: CN=engender\nCertificate fingerprints:\n\t SHA1: ${colons('c'.repeat(40))}\n\t SHA256: ${colons(digest)}\n`;

describe('signing certificate pin', () => {
  it('pins the developer certificate that SECURITY.md publishes', () => {
    expect(RELEASE_SIGNING_SHA256).toBe(PINNED);
  });

  it('reads the SHA-256 digest from apksigner and keytool output', () => {
    expect(certificateDigests(apksignerOutput(PINNED))).toEqual([PINNED]);
    expect(certificateDigests(keytoolOutput(PINNED))).toEqual([PINNED]);
  });

  it('accepts only the pinned certificate', () => {
    expect(signingCertificateProblem('APK', apksignerOutput(PINNED))).toBeNull();
    expect(signingCertificateProblem('AAB', keytoolOutput(PINNED))).toBeNull();
    expect(signingCertificateProblem('APK', apksignerOutput(OTHER))).toContain(`APK signing certificate is ${OTHER}`);
    expect(signingCertificateProblem('AAB', keytoolOutput(OTHER))).toContain(`expected ${PINNED}`);
  });

  it('rejects output with no digest or a second signer', () => {
    expect(signingCertificateProblem('APK', '')).toContain('unreadable');
    const twoSigners = apksignerOutput(PINNED) + apksignerOutput(OTHER).replaceAll('#1', '#2');
    expect(signingCertificateProblem('APK', twoSigners)).toContain(OTHER);
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

  it('accepts a bundle signed with a self-signed Android test key and rejects tampering', () => {
    const { root, aab } = signedFixture();
    expect(verification(root)).not.toContain('AAB signature verification failed:');
    expect(verification(root)).toContain(`AAB signing certificate is `);
    expect(verification(root)).toContain(`expected ${PINNED}`);
    writeFileSync(join(root, 'payload.txt'), 'tampered bundle payload\n');
    execFileSync('jar', ['--update', '--file', aab, '-C', root, 'payload.txt']);
    expect(verification(root)).toContain(`AAB signature verification failed: ${aab}`);
  }, 15000);
});
