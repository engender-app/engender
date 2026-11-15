/* The one version value (phase 2 ticket 01). Everything that names a release -
   the built bundle, the About screen, the release notes and the Android
   artifacts - reads it from scripts/app-version.mjs, so the rules for what
   counts as a release and what counts as a development build are asserted
   here rather than discovered from a build that claimed the wrong thing.

   The resolver is split from the `git` calls so these run without inventing
   repositories: readGitFacts() gathers, resolveAppVersion() decides. */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isReleaseVersion, readGitFacts, resolveAppVersion, verifyTagSigner } from '../scripts/app-version.mjs';

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
    expect(resolveAppVersion({ ENGENDER_VERSION: '2.0.0' }, untagged())).toBe('2.0.0');
  });

  it('ignores an empty override rather than releasing as the empty string', () => {
    // An unset CI variable expands to '' far more often than it is missing.
    expect(resolveAppVersion({ ENGENDER_VERSION: '  ' }, untagged())).toBe('0.0.0-dev+g1a2b3c4d');
  });
});

describe('isReleaseVersion', () => {
  /* Two callers ask this and have to agree (phase 2 ticket 06): the pipeline
     refuses to package a development version, and the build only pins its
     build id - and with it every chunk hash - when what it was handed can be
     rebuilt from a tag. */
  it('says yes to a version from a tag, prerelease suffix and all', () => {
    expect(isReleaseVersion('1.2.3')).toBe(true);
    expect(isReleaseVersion('1.2.3-beta.1')).toBe(true);
  });

  it('says no to every shape of development version', () => {
    expect(isReleaseVersion('0.0.0-dev+g1a2b3c4d')).toBe(false);
    expect(isReleaseVersion('0.0.0-dev+g1a2b3c4d.dirty')).toBe(false);
    expect(isReleaseVersion('0.0.0-dev+unknown')).toBe(false);
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
    expect(readGitFacts((args: string[]) => answers[args[0]] ?? null, () => 'good')).toEqual({
      tag: 'v1.2.3',
      signed: true,
      signature: 'good',
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
    expect(readGitFacts((args: string[]) => answers[args[0]] ?? null, () => 'good').dirty).toBe(true);
  });

  it('treats a tag with no signature as unsigned rather than missing', () => {
    const answers: Record<string, string> = {
      'rev-parse': '1a2b3c4d',
      describe: 'v1.2.3',
      'for-each-ref': '',
      status: ''
    };
    expect(readGitFacts((args: string[]) => answers[args[0]] ?? null, () => 'unsigned').signed).toBe(false);
  });
});

/* GD-021, GD-026: a signature block is not a signature from anyone allowed to
   release. These run against real tags in a temporary repository, because the
   only honest test of "git verifies it" is git. */
describe('who may release', () => {
  let root = '';
  let signers = '';
  const sh = (cwd: string, ...args: string[]) =>
    execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

  function key(name: string) {
    execFileSync('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-C', 'test', '-f', join(root, name)]);
    return join(root, name);
  }

  /** The facts the pipeline would read with the repository at `tag`. */
  function factsAt(tag: string) {
    const run = (args: string[]) => {
      try {
        return execFileSync('git', ['-C', join(root, 'repo'), ...args], {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore']
        }).trim();
      } catch {
        return null;
      }
    };
    sh(join(root, 'repo'), 'checkout', '-q', '--detach', tag);
    return readGitFacts(run, (t: string) => verifyTagSigner(t, { cwd: join(root, 'repo'), signers }));
  }

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'engender-signer-test-'));
    const allowed = key('allowed');
    const stranger = key('stranger');
    signers = join(root, 'signers');
    writeFileSync(signers, `releaser ${readFileSync(`${allowed}.pub`, 'utf8')}`);
    const repo = join(root, 'repo');
    execFileSync('git', ['init', '-q', repo]);
    sh(repo, 'config', 'user.name', 'T');
    sh(repo, 'config', 'user.email', 't@example.com');
    sh(repo, 'config', 'gpg.format', 'ssh');
    sh(repo, 'config', 'commit.gpgsign', 'false');
    for (const name of ['good', 'stranger', 'unsigned', 'malformed']) {
      sh(repo, 'commit', '-q', '--allow-empty', '-m', name);
      sh(repo, 'config', 'user.signingkey', name === 'stranger' ? stranger : allowed);
      if (name === 'unsigned') sh(repo, 'tag', '-a', '-m', 'r', 'v3.0.0');
      else sh(repo, 'tag', '-s', '-m', 'r', name === 'good' ? 'v1.0.0' : name === 'stranger' ? 'v2.0.0' : 'v4.0.0');
    }
    // Damage the armoured signature body of v4.0.0 so it parses as nothing.
    const body = sh(repo, 'cat-file', 'tag', 'v4.0.0').replace(/^([A-Za-z0-9+/=]{10})./m, '$1X');
    const broken = execFileSync('git', ['-C', repo, 'mktag'], { input: body, encoding: 'utf8' }).trim();
    sh(repo, 'update-ref', 'refs/tags/v4.0.0', broken);
  });

  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it('accepts a tag signed by a key in the allowed-signers file', () => {
    expect(factsAt('v1.0.0')).toMatchObject({ tag: 'v1.0.0', signed: true, signature: 'good' });
    expect(resolveAppVersion({}, { ...factsAt('v1.0.0'), dirty: false })).toBe('1.0.0');
  });

  it('refuses a tag signed by a key nobody listed', () => {
    const facts = factsAt('v2.0.0');
    expect(facts).toMatchObject({ tag: 'v2.0.0', signed: false, signature: 'unknown-signer' });
    expect(isReleaseVersion(resolveAppVersion({}, { ...facts, dirty: false }))).toBe(false);
  });

  it('says an annotated tag with no signature is unsigned', () => {
    expect(factsAt('v3.0.0')).toMatchObject({ tag: 'v3.0.0', signed: false, signature: 'unsigned' });
  });

  it('says a signature git cannot read is malformed, not unknown', () => {
    expect(factsAt('v4.0.0')).toMatchObject({ tag: 'v4.0.0', signed: false, signature: 'malformed' });
  });

  it('fails closed when the allowed-signers file is missing', () => {
    const repo = join(root, 'repo');
    expect(verifyTagSigner('v1.0.0', { cwd: repo, signers: join(root, 'nope') })).toBe('unknown-signer');
  });
});
