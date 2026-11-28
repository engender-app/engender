/* The release workflow's first job asks this script one question: may this tag
   be released, and what commit and version does it name? It runs on the
   default branch's checkout, so the tag is only ever data to it. */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resolveReleaseTag } from '../../../scripts/resolve-release-tag.mjs';

describe('resolveReleaseTag', () => {
  let root = '';
  let repo = '';
  let signers = '';
  const sh = (...args: string[]) =>
    execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const resolve = (tag: string) => resolveReleaseTag(tag, { cwd: repo, signers, mainRef: 'main' });

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'engender-resolve-test-'));
    repo = join(root, 'repo');
    execFileSync('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-C', 'test', '-f', join(root, 'k')]);
    signers = join(root, 'signers');
    writeFileSync(signers, `releaser ${readFileSync(join(root, 'k.pub'), 'utf8')}`);
    execFileSync('git', ['init', '-q', '-b', 'main', repo]);
    for (const [k, v] of [['user.name', 'T'], ['user.email', 't@example.com'], ['gpg.format', 'ssh'], ['user.signingkey', join(root, 'k')]]) {
      sh('config', k, v);
    }
    sh('commit', '-q', '--allow-empty', '-m', 'one');
    sh('tag', '-s', '-m', 'r', 'v1.0.0');
    sh('tag', '-s', '-m', 'r', 'v1.0.1');
    sh('tag', '-a', '-m', 'r', 'v1.2.0');
    sh('tag', 'v1.3.0');
    sh('switch', '-q', '-c', 'side');
    sh('commit', '-q', '--allow-empty', '-m', 'side');
    sh('tag', '-s', '-m', 'r', 'v2.0.0');
    sh('switch', '-q', 'main');
    sh('commit', '-q', '--allow-empty', '-m', 'two');
  });

  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it('gives the version and the peeled commit of a verified tag on main', () => {
    expect(resolve('v1.0.0')).toEqual({ version: '1.0.0', sha: sh('rev-parse', 'v1.0.0^{commit}') });
  });

  it('keeps a prerelease suffix', () => {
    sh('tag', '-s', '-m', 'r', 'v1.1.0-rc.1', 'main~1');
    expect(resolve('v1.1.0-rc.1').version).toBe('1.1.0-rc.1');
  });

  it.each([
    ['v1.2.0', /no signature/],
    ['v1.3.0', /no signature/],
    ['v9.9.9', /no such tag|not found/i]
  ])('refuses %s', (tag, message) => {
    expect(() => resolve(tag)).toThrow(message);
  });

  it('refuses a verified tag whose commit is not on main', () => {
    expect(() => resolve('v2.0.0')).toThrow(/not on main/);
  });

  it('refuses a name that is not a version tag before touching git with it', () => {
    expect(() => resolve('--help')).toThrow(/not a release tag/);
    expect(() => resolve('v1.0')).toThrow(/not a release tag/);
  });

  it('refuses a signature from a key outside the allowed signers', () => {
    writeFileSync(signers, '# nobody yet\n');
    try {
      expect(() => resolve('v1.0.1')).toThrow(/not in .*release-signers/);
    } finally {
      writeFileSync(signers, `releaser ${readFileSync(join(root, 'k.pub'), 'utf8')}`);
    }
  });
});
