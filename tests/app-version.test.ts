/* The one version value (phase 2 ticket 01). Everything that names a release -
   the built bundle, the About screen, the release notes and the Android
   artifacts - reads it from scripts/app-version.mjs, so the rules for what
   counts as a release and what counts as a development build are asserted
   here rather than discovered from a build that claimed the wrong thing.

   The resolver is split from the `git` calls so these run without inventing
   repositories: readGitFacts() gathers, resolveAppVersion() decides. */
import { describe, expect, it } from 'vitest';
import { readGitFacts, resolveAppVersion } from '../scripts/app-version.mjs';

/** A checkout with no tag on HEAD, which the cases below vary from. */
const untagged = (sha = '1a2b3c4d') => ({ tag: null, signed: false, dirty: false, sha });

describe('resolveAppVersion', () => {
  it('takes a signed version tag on a clean tree as the public version name', () => {
    expect(resolveAppVersion({}, { ...untagged(), tag: 'v1.2.3', signed: true })).toBe('1.2.3');
  });

  it('keeps a prerelease suffix from the tag', () => {
    expect(resolveAppVersion({}, { ...untagged(), tag: 'v1.2.3-beta.1', signed: true })).toBe('1.2.3-beta.1');
  });

  it('names the commit rather than a version when nothing tags it', () => {
    expect(resolveAppVersion({}, untagged('deadbeef'))).toBe('0.0.0-dev+gdeadbeef');
  });

  it('refuses an unsigned tag as a release', () => {
    // A lightweight `git tag v1.2.3` carries no signature, and the release
    // contract (spec, "Release contract and CI") sources versions from signed
    // tags. Taking it would let any local tag mint a release name.
    expect(resolveAppVersion({}, { ...untagged(), tag: 'v1.2.3', signed: false })).toBe('0.0.0-dev+g1a2b3c4d');
  });

  it('refuses a signed tag that is not a version', () => {
    expect(resolveAppVersion({}, { ...untagged(), tag: 'nightly', signed: true })).toBe('0.0.0-dev+g1a2b3c4d');
  });

  it('refuses a signed version tag when the tree has been edited under it', () => {
    // The tag names a commit; a dirty tree is not that commit's contents, so
    // the build is not the release however the tag was made.
    expect(resolveAppVersion({}, { ...untagged(), tag: 'v1.2.3', signed: true, dirty: true })).toBe(
      '0.0.0-dev+g1a2b3c4d.dirty'
    );
  });

  it('says so plainly when there is no checkout to read', () => {
    // A build from an extracted source archive. Unambiguous beats a guess.
    expect(resolveAppVersion({}, { tag: null, signed: false, dirty: false, sha: null })).toBe('0.0.0-dev+unknown');
  });

  it('lets the release pipeline hand the same value to every artifact', () => {
    /* The web bundle, the release notes and the Android build each need the
       one string, and only one of them can practically shell out to git. The
       pipeline reads the tag once and passes it down. */
    expect(resolveAppVersion({ GENDER_DIARY_VERSION: '2.0.0' }, untagged())).toBe('2.0.0');
  });

  it('ignores an empty override rather than releasing as the empty string', () => {
    // An unset CI variable expands to '' far more often than it is missing.
    expect(resolveAppVersion({ GENDER_DIARY_VERSION: '  ' }, untagged())).toBe('0.0.0-dev+g1a2b3c4d');
  });
});

describe('readGitFacts', () => {
  it('reports no facts at all outside a checkout', () => {
    expect(readGitFacts(() => null)).toEqual({ tag: null, signed: false, dirty: false, sha: null });
  });

  it('reads the tag on HEAD, its signature and the state of the tree', () => {
    const answers: Record<string, string> = {
      'rev-parse': '1a2b3c4d',
      describe: 'v1.2.3',
      'for-each-ref': '-----BEGIN SSH SIGNATURE-----\n...',
      status: ''
    };
    expect(readGitFacts((args: string[]) => answers[args[0]] ?? null)).toEqual({
      tag: 'v1.2.3',
      signed: true,
      dirty: false,
      sha: '1a2b3c4d'
    });
  });

  it('counts an untracked file as an edited tree', () => {
    /* Untracked files reach the build - anything dropped into static/ is
       copied into the release verbatim - so a tree with one is not the
       tagged commit's contents either. */
    const answers: Record<string, string> = {
      'rev-parse': '1a2b3c4d',
      describe: 'v1.2.3',
      'for-each-ref': 'signature',
      status: '?? static/stray.png'
    };
    expect(readGitFacts((args: string[]) => answers[args[0]] ?? null).dirty).toBe(true);
  });

  it('treats a tag with no signature as unsigned rather than missing', () => {
    const answers: Record<string, string> = {
      'rev-parse': '1a2b3c4d',
      describe: 'v1.2.3',
      'for-each-ref': '',
      status: ''
    };
    expect(readGitFacts((args: string[]) => answers[args[0]] ?? null).signed).toBe(false);
  });
});
