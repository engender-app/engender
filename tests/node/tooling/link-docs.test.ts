import { execFileSync, spawnSync } from 'node:child_process';
import {
  existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, realpathSync, rmSync, symlinkSync, writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

/* App checkouts link the private docs at docs/internal and the four context
   files at their root. Tests run link-docs.mjs in temporary sibling repos. */

const script = fileURLToPath(new URL('../../../scripts/link-docs.mjs', import.meta.url));
const LINKS = ['CONTEXT.md', 'PRODUCT.md', 'SCREENS.md', 'DIRECTION.md', 'docs/internal'];
// Where each link must point, relative to the docs repo (or its docs worktree).
const wanted = (name: string) => (name === 'docs/internal' ? '' : name);
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
  writeFileSync(join(app, '.gitignore'), 'CONTEXT.md\nPRODUCT.md\nSCREENS.md\nDIRECTION.md\n/docs/internal\n');
  mkdirSync(join(app, 'docs', 'adr'), { recursive: true });
  writeFileSync(join(app, 'docs', 'adr', '0001-public.md'), 'tracked adr\n');
  git(app, 'add', '.gitignore', 'docs');
  git(app, 'commit', '-q', '-m', 'app');
  mkdirSync(join(docs, 'docs'), { recursive: true });
  execFileSync('git', ['init', '-q', '-b', 'main', docs], { env });
  writeFileSync(join(docs, '.gitignore'), '/.worktrees/\n');
  for (const f of ['CONTEXT.md', 'PRODUCT.md', 'SCREENS.md', 'DIRECTION.md']) writeFileSync(join(docs, f), `${f} on main\n`);
  writeFileSync(join(docs, 'docs', 'agents.md'), 'private\n');
  git(docs, 'add', '-A');
  git(docs, 'commit', '-q', '-m', 'docs');
});
afterEach(() => rmSync(base, { recursive: true, force: true }));

describe('primary checkout', () => {
  it('links the five paths to the docs repo main checkout, docs/internal at its root', () => {
    const r = run(app);
    expect(r.status, r.stderr).toBe(0);
    for (const name of LINKS) {
      expect(lstatSync(join(app, name)).isSymbolicLink()).toBe(true);
      expect(target(app, name)).toBe(join(docs, wanted(name)));
    }
    expect(readFileSync(join(app, 'docs', 'internal', 'docs', 'agents.md'), 'utf8')).toBe('private\n');
    // The tracked ADRs stay real files beside the link.
    expect(lstatSync(join(app, 'docs')).isSymbolicLink()).toBe(false);
    expect(readFileSync(join(app, 'docs', 'adr', '0001-public.md'), 'utf8')).toBe('tracked adr\n');
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
    expect(run(app).status).toBe(0);
    for (const name of LINKS) expect(lstatSync(join(app, name)).isSymbolicLink()).toBe(true);
    expect(git(app, 'status', '--short')).toBe('');
  });
});

describe('the old docs symlink', () => {
  it('is replaced by a real docs folder holding docs/internal, and the docs repo is untouched', () => {
    rmSync(join(app, 'docs'), { recursive: true });
    symlinkSync(join(docs, 'docs'), join(app, 'docs'));
    const r = run(app);
    expect(r.status, r.stderr).toBe(0);
    expect(lstatSync(join(app, 'docs')).isSymbolicLink()).toBe(false);
    expect(target(app, 'docs/internal')).toBe(docs);
    expect(readFileSync(join(docs, 'docs', 'agents.md'), 'utf8')).toBe('private\n');
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
    for (const name of LINKS) expect(target(wt, name)).toBe(join(docsWt, wanted(name)));
  });

  it('keeps edits on its branch away from docs main and from other worktrees', () => {
    run(wt);
    run(app);
    writeFileSync(join(wt, 'docs', 'internal', 'draft-x.md'), 'draft\n');
    expect(existsSync(join(app, 'docs', 'internal', 'draft-x.md'))).toBe(false);
    expect(existsSync(join(docs, 'draft-x.md'))).toBe(false);
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
    expect(git(target(wt2, 'docs/internal'), 'symbolic-ref', '--short', 'HEAD')).toBe('integration/v9');
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
    for (const name of LINKS) expect(target(wt, name)).toBe(join(docs, wanted(name)));
    expect(existsSync(join(docs, '.worktrees'))).toBe(false);
  });
});

describe('refusals', () => {
  it('will not replace a real file or folder', () => {
    writeFileSync(join(app, 'CONTEXT.md'), 'precious\n');
    mkdirSync(join(app, 'docs', 'internal'));
    writeFileSync(join(app, 'docs', 'internal', 'keep.md'), 'precious\n');
    const r = run(app);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/CONTEXT\.md, docs\/internal already exist here as real files or folders/);
    expect(readFileSync(join(app, 'CONTEXT.md'), 'utf8')).toBe('precious\n');
    expect(readFileSync(join(app, 'docs', 'internal', 'keep.md'), 'utf8')).toBe('precious\n');
    // Nothing is half-linked: and stay unlinked too.
    expect(existsSync(join(app, 'PRODUCT.md'))).toBe(false);
  });

  it('creates no docs worktree or branch when it refuses on a branch worktree', () => {
    const wt = join(base, 'wt');
    git(app, 'worktree', 'add', '-q', '-b', 'ticket-02-blocked', wt, 'main');
    writeFileSync(join(wt, 'SCREENS.md'), 'precious\n');
    const r = run(wt);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/docs:link: SCREENS\.md already exist here/);
    expect(existsSync(join(docs, '.worktrees'))).toBe(false);
    expect(git(docs, 'branch', '--list', 'ticket-02-blocked')).toBe('');
  });

  it('says so when there is no docs repo next to the primary checkout', () => {
    rmSync(docs, { recursive: true, force: true });
    const r = run(app);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/no docs repo at .*engender-docs/);
  });

  it('refuses when the docs repo main checkout is on another branch', () => {
    git(docs, 'checkout', '-q', '-b', 'other');
    const r = run(app);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/is on "other", not main/);
  });
});
