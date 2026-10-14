import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
    const git = (...args: string[]) => execFileSync('git', args, { cwd: checkout, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, GIT_AUTHOR_DATE: '2020-01-01T00:00:00Z', GIT_COMMITTER_DATE: '2020-01-01T00:00:00Z' } }).trim();
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
      const evidence = JSON.parse(readFileSync('tests/fixtures/progressive-release-record.template.json', 'utf8'));
      evidence.releaseVersion = '1.0.0';
      evidence.candidateRevision = git('rev-parse', 'HEAD');
      for (const stage of ['stage3', 'stage4']) {
        evidence.stages[stage].passedAt = '';
        evidence.stages[stage].releaseMatrix.ranAt = '';
        for (const key of Object.keys(evidence.stages[stage].releaseMatrix.checks)) evidence.stages[stage].releaseMatrix.checks[key] = false;
        for (const key of Object.keys(evidence.stages[stage].evidence)) evidence.stages[stage].evidence[key] = false;
      }
      for (const channel of Object.keys(evidence.channels)) evidence.channels[channel] = { state: 'label-only' };
      mkdirSync(join(checkout, 'scripts'));
      const recordPath = join(checkout, 'scripts/progressive-release-record.json');
      writeFileSync(recordPath, JSON.stringify(evidence));
      git('add', 'scripts/progressive-release-record.json');
      git('-c', 'commit.gpgsign=false', 'commit', '-m', 'Record candidate checks');
      git('clone', '--bare', checkout, origin);
      git('remote', 'add', 'origin', origin);
      const result = spawnSync(process.execPath, [fileURLToPath(new URL('../scripts/cut-release-tag.mjs', import.meta.url)), '1.0.0', '--dry-run'], { cwd: checkout, encoding: 'utf8' });
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toContain('PASS checks for v1.0.0');
      expect(result.stdout).toContain('Would create signed tag v1.0.0');
      expect(git('tag', '--list')).toBe('');
      expect(git('ls-remote', '--tags', 'origin')).toBe('');
      expect(git('status', '--porcelain')).toBe('');

      evidence.stages.stable.releaseMatrix.checks.rollback = false;
      writeFileSync(recordPath, JSON.stringify(evidence));
      git('add', 'scripts/progressive-release-record.json');
      git('-c', 'commit.gpgsign=false', 'commit', '-m', 'Withdraw candidate check');
      git('push', 'origin', 'main');
      for (const flag of ['--dry-run', '--no-push']) {
        const refused = spawnSync(process.execPath, [fileURLToPath(new URL('../scripts/cut-release-tag.mjs', import.meta.url)), '1.0.0', flag], { cwd: checkout, encoding: 'utf8' });
        expect(refused.status).toBe(1);
        expect(refused.stderr).toContain('stable.releaseMatrix.checks.rollback must be true.');
        expect(git('tag', '--list')).toBe('');
        expect(git('ls-remote', '--tags', 'origin')).toBe('');
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
