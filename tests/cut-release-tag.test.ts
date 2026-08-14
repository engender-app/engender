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
