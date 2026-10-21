import { execFileSync, spawnSync } from 'node:child_process';
import {
  existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, realpathSync, rmSync, writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

/* scripts/link-docs.mjs (functional-audit ticket 01). The docs live in a
   private sibling git repo; every app checkout links them back at the old
   paths. These tests build a throwaway app repo and docs repo side by side in
   a temp directory and run the script with each checkout as the cwd. */

const script = fileURLToPath(new URL('../scripts/link-docs.mjs', import.meta.url));
const LINKS = ['CONTEXT.md', 'PRODUCT.md', 'SCREENS.md', 'docs'];
const env = {
  ...process.env,
  GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.invalid',
  GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@example.invalid'
};

let base: string;
let app: string;
let docs: string;

function git(cwd: string, ...args: string[]) {
  return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', env }).trim();
}
function run(cwd: string) {
  return spawnSync(process.execPath, [script], { cwd, encoding: 'utf8', env });
}
function target(cwd: string, name: string) {
  return realpathSync(join(cwd, name));
}

beforeEach(() => {
  base = realpathSync(mkdtempSync(join(tmpdir(), 'link-docs-')));
  app = join(base, 'app');
  docs = join(base, 'engender-docs');
  mkdirSync(app);
  execFileSync('git', ['init', '-q', '-b', 'main', app], { env });
  writeFileSync(join(app, '.gitignore'), 'CONTEXT.md\nPRODUCT.md\nSCREENS.md\ndocs/\n/docs\n');
  git(app, 'add', '.gitignore');
  git(app, 'commit', '-q', '-m', 'app');
  mkdirSync(join(docs, 'docs', 'adr'), { recursive: true });
  execFileSync('git', ['init', '-q', '-b', 'main', docs], { env });
  writeFileSync(join(docs, '.gitignore'), '/.worktrees/\n');
  for (const f of ['CONTEXT.md', 'PRODUCT.md', 'SCREENS.md']) writeFileSync(join(docs, f), `${f} on main\n`);
  writeFileSync(join(docs, 'docs', 'adr', '0001-first.md'), 'adr one\n');
  git(docs, 'add', '-A');
  git(docs, 'commit', '-q', '-m', 'docs');
});
afterEach(() => rmSync(base, { recursive: true, force: true }));

describe('primary checkout', () => {
  it('links the four paths to the docs repo main checkout', () => {
    const r = run(app);
    expect(r.status, r.stderr).toBe(0);
    for (const name of LINKS) {
      expect(lstatSync(join(app, name)).isSymbolicLink()).toBe(true);
      expect(target(app, name)).toBe(join(docs, name));
    }
    expect(readFileSync(join(app, 'docs', 'adr', '0001-first.md'), 'utf8')).toBe('adr one\n');
  });

  it('is a no-op the second time', () => {
    run(app);
    const before = LINKS.map((n) => [readlinkSync(join(app, n)), lstatSync(join(app, n)).ctimeMs]);
    const r = run(app);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).not.toMatch(/\blinked\b/);
    expect(LINKS.map((n) => [readlinkSync(join(app, n)), lstatSync(join(app, n)).ctimeMs])).toEqual(before);
  });

  it('leaves the app repo status clean once the links exist', () => {
    run(app);
    expect(git(app, 'status', '--short')).toBe('');
  });
});

describe('branch worktree', () => {
  let wt: string;
  beforeEach(() => {
    wt = join(base, 'wt');
    git(app, 'worktree', 'add', '-q', '-b', 'ticket-01-demo', wt, 'main');
  });

  it('gets its own docs worktree on a docs branch with the same name', () => {
    const r = run(wt);
    expect(r.status, r.stderr).toBe(0);
    const docsWt = join(docs, '.worktrees', 'ticket-01-demo');
    expect(git(docsWt, 'symbolic-ref', '--short', 'HEAD')).toBe('ticket-01-demo');
    for (const name of LINKS) expect(target(wt, name)).toBe(join(docsWt, name));
  });

  it('keeps edits on its branch away from docs main and from other worktrees', () => {
    run(wt);
    run(app);
    writeFileSync(join(wt, 'docs', 'adr', 'draft-x.md'), 'draft\n');
    expect(existsSync(join(app, 'docs', 'adr', 'draft-x.md'))).toBe(false);
    expect(existsSync(join(docs, 'docs', 'adr', 'draft-x.md'))).toBe(false);
  });

  it('is a no-op the second time', () => {
    run(wt);
    const before = LINKS.map((n) => [readlinkSync(join(wt, n)), lstatSync(join(wt, n)).ctimeMs]);
    const list = git(docs, 'worktree', 'list');
    const r = run(wt);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).not.toMatch(/\b(linked|created)\b/);
    expect(LINKS.map((n) => [readlinkSync(join(wt, n)), lstatSync(join(wt, n)).ctimeMs])).toEqual(before);
    expect(git(docs, 'worktree', 'list')).toBe(list);
  });

  it('reuses an existing docs branch of that name', () => {
    git(docs, 'branch', 'ticket-01-demo');
    writeFileSync(join(docs, 'unrelated.md'), 'x'); // untracked on main, must not matter
    const r = run(wt);
    expect(r.status, r.stderr).toBe(0);
    expect(git(join(docs, '.worktrees', 'ticket-01-demo'), 'symbolic-ref', '--short', 'HEAD')).toBe('ticket-01-demo');
  });

  it('handles a branch name with a slash', () => {
    const wt2 = join(base, 'wt2');
    git(app, 'worktree', 'add', '-q', '-b', 'integration/v9', wt2, 'main');
    const r = run(wt2);
    expect(r.status, r.stderr).toBe(0);
    expect(git(target(wt2, 'docs') + '/..', 'symbolic-ref', '--short', 'HEAD')).toBe('integration/v9');
  });

  it('removing the app worktree leaves the docs files alone', () => {
    run(wt);
    git(app, 'worktree', 'remove', '--force', wt);
    expect(readFileSync(join(docs, '.worktrees', 'ticket-01-demo', 'CONTEXT.md'), 'utf8')).toBe('CONTEXT.md on main\n');
    expect(readFileSync(join(docs, 'CONTEXT.md'), 'utf8')).toBe('CONTEXT.md on main\n');
  });
});

describe('detached worktree', () => {
  it('links the docs repo main checkout', () => {
    const wt = join(base, 'merge');
    git(app, 'worktree', 'add', '-q', '--detach', wt, 'main');
    const r = run(wt);
    expect(r.status, r.stderr).toBe(0);
    for (const name of LINKS) expect(target(wt, name)).toBe(join(docs, name));
    expect(existsSync(join(docs, '.worktrees'))).toBe(false);
  });
});

describe('refusals', () => {
  it('will not replace a real file or folder', () => {
    writeFileSync(join(app, 'CONTEXT.md'), 'precious\n');
    mkdirSync(join(app, 'docs'));
    writeFileSync(join(app, 'docs', 'keep.md'), 'precious\n');
    const r = run(app);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/CONTEXT\.md/);
    expect(readFileSync(join(app, 'CONTEXT.md'), 'utf8')).toBe('precious\n');
    expect(readFileSync(join(app, 'docs', 'keep.md'), 'utf8')).toBe('precious\n');
    // Nothing is half-linked: PRODUCT.md and SCREENS.md stay unlinked too.
    expect(existsSync(join(app, 'PRODUCT.md'))).toBe(false);
  });

  it('says so when there is no docs repo next to the primary checkout', () => {
    rmSync(docs, { recursive: true, force: true });
    const r = run(app);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/engender-docs/);
  });

  it('refuses when the docs repo main checkout is on another branch', () => {
    git(docs, 'checkout', '-q', '-b', 'other');
    const r = run(app);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/main/);
  });
});
