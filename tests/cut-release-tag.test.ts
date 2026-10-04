import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  normalizeVersionArg,
  parseReleaseTagArgs,
  releaseTagForVersion,
  RELEASE_VERSION_RE
} from '../scripts/cut-release-tag.mjs';

describe('normalizeVersionArg', () => {
  it('accepts plain semver and keeps it unchanged', () => {
    expect(normalizeVersionArg('1.2.3')).toBe('1.2.3');
  });

  it('accepts a v-prefixed semver and strips v', () => {
    expect(normalizeVersionArg('v1.2.3')).toBe('1.2.3');
  });

  it('accepts prerelease versions', () => {
    expect(normalizeVersionArg('1.2.3-alpha.1')).toBe('1.2.3-alpha.1');
    expect(normalizeVersionArg('v1.2.3-rc.2')).toBe('1.2.3-rc.2');
  });

  it('rejects non-semver tags that do not trigger release workflow contract', () => {
    expect(() => normalizeVersionArg('alpha-2026-08-14')).toThrow(/Invalid version/);
    expect(() => normalizeVersionArg('1.2')).toThrow(/Invalid version/);
    expect(() => normalizeVersionArg('v1')).toThrow(/Invalid version/);
  });
});

describe('releaseTagForVersion', () => {
  it('adds v prefix for workflow-triggering tags', () => {
    expect(releaseTagForVersion('1.2.3')).toBe('v1.2.3');
  });
});

describe('parseReleaseTagArgs', () => {
  it('parses default behavior (push on, no dry run)', () => {
    expect(parseReleaseTagArgs(['1.2.3'])).toEqual({
      dryRun: false,
      push: true,
      versionArg: '1.2.3'
    });
  });

  it('parses flags', () => {
    expect(parseReleaseTagArgs(['1.2.3', '--dry-run', '--no-push'])).toEqual({
      dryRun: true,
      push: false,
      versionArg: '1.2.3'
    });
  });

  it('marks help requests', () => {
    expect(parseReleaseTagArgs(['--help'])).toEqual({
      dryRun: false,
      push: true,
      versionArg: null,
      help: true
    });
  });

  it('rejects unknown options', () => {
    expect(() => parseReleaseTagArgs(['1.2.3', '--wat'])).toThrow(/Unknown option/);
  });
});

describe('RELEASE_VERSION_RE', () => {
  it('matches only v<semver> compatible forms used by release workflow', () => {
    expect(RELEASE_VERSION_RE.test('v1.2.3')).toBe(true);
    expect(RELEASE_VERSION_RE.test('1.2.3')).toBe(true);
    expect(RELEASE_VERSION_RE.test('v1.2.3-alpha.1')).toBe(true);
    expect(RELEASE_VERSION_RE.test('alpha-2026-08-14')).toBe(false);
  });
});

describe('release tag dry run', () => {
  it('passes on clean main at origin without creating or pushing a tag', () => {
    const root = mkdtempSync(join(tmpdir(), 'release-tag-'));
    const checkout = join(root, 'checkout');
    const origin = join(root, 'origin.git');
    mkdirSync(checkout);
    const git = (...args: string[]) => execFileSync('git', args, { cwd: checkout, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    try {
      git('init', '--initial-branch=main');
      git('config', 'user.name', 'Release test');
      git('config', 'user.email', 'release-test@example.invalid');
      writeFileSync(join(checkout, 'CHANGELOG.md'), `## 1.0.0

- Schema changes: first release
- Archive format changes: first release
- Security migrations: none
- Minimum supported version: first release
`);
      git('add', 'CHANGELOG.md');
      git('-c', 'commit.gpgsign=false', 'commit', '-m', 'Prepare release notes');
      git('clone', '--bare', checkout, origin);
      git('remote', 'add', 'origin', origin);
      const result = spawnSync(process.execPath, [fileURLToPath(new URL('../scripts/cut-release-tag.mjs', import.meta.url)), '1.0.0', '--dry-run'], { cwd: checkout, encoding: 'utf8' });
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toContain('PASS checks for v1.0.0');
      expect(result.stdout).toContain('Would create signed tag v1.0.0');
      expect(git('tag', '--list')).toBe('');
      expect(git('ls-remote', '--tags', 'origin')).toBe('');
      expect(git('status', '--porcelain')).toBe('');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
