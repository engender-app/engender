import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { expectedArtifactNames, releaseArtifactProblems } from '../scripts/check-release-artifacts.mjs';

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
