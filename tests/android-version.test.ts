import { describe, expect, it } from 'vitest';
import { androidVersionCode, parseVersion, prereleaseRank } from '../scripts/android-version.mjs';

describe('android-version', () => {
  it('parses semver values with and without prerelease tags', () => {
    expect(parseVersion('1.2.3')).toEqual({ major: 1, minor: 2, patch: 3, prerelease: null });
    expect(parseVersion('1.2.3-beta.2')).toEqual({ major: 1, minor: 2, patch: 3, prerelease: 'beta.2' });
  });

  it('ranks a final release above prereleases of the same x.y.z', () => {
    expect(prereleaseRank(null)).toBeGreaterThan(prereleaseRank('rc.1'));
    expect(prereleaseRank('rc.1')).toBeGreaterThan(prereleaseRank('beta.9'));
    expect(prereleaseRank('beta.1')).toBeGreaterThan(prereleaseRank('alpha.9'));
  });

  it('maps semver to a monotonic Android versionCode', () => {
    const beta = androidVersionCode('1.2.3-beta.1');
    const release = androidVersionCode('1.2.3');
    const next = androidVersionCode('1.2.4-alpha.1');

    expect(beta).toBeLessThan(release);
    expect(release).toBeLessThan(next);
  });

  it('refuses a non-semver input', () => {
    expect(() => androidVersionCode('nightly')).toThrow(/semantic version/i);
  });
});
