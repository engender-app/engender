#!/usr/bin/env node
/* Links the private docs repo into this checkout (npm run docs:link).

   CONTEXT.md, PRODUCT.md, SCREENS.md, DIRECTION.md and the private docs live
   in a private sibling git repo, `engender-docs`, next to the primary
   checkout. The ADRs are not there any more: they are tracked in this repo at
   docs/adr/. Git worktrees do not share untracked files, so each checkout
   gets gitignored symlinks: the four root files at the repo root, and
   docs/internal at the docs repo (or docs worktree) root. The links point at:

   - the primary checkout, and any detached worktree (merge and testing
     worktrees), link the docs repo's own main checkout;
   - a worktree on a branch gets its own docs worktree on a docs branch with
     the same name, under <docs repo>/.worktrees/, so an ADR written for a
     ticket reaches docs main only when the orchestrator merges that ticket.

   Run it from any checkout. It is safe to run twice. It never replaces a real
   file or folder, and it adds no remote and no URL anywhere. */
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, readlinkSync, rmSync, symlinkSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';

const NAMES = ['CONTEXT.md', 'PRODUCT.md', 'SCREENS.md', 'DIRECTION.md', 'docs/internal'];
// docs/internal links to the docs repo root; the others to the same-named file.
const targetName = (name) => (name === 'docs/internal' ? '' : name);

function git(cwd, ...args) {
  return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}
function fail(message) {
  console.error(`docs:link: ${message}`);
  process.exit(1);
}
function branchOf(cwd) {
  try {
    return git(cwd, 'symbolic-ref', '--short', '-q', 'HEAD');
  } catch {
    return '';
  }
}

const top = realpathSync(git(process.cwd(), 'rev-parse', '--show-toplevel'));
const commonDir = git(top, 'rev-parse', '--path-format=absolute', '--git-common-dir');
const primary = realpathSync(dirname(commonDir));
const docsRepo = join(dirname(primary), 'engender-docs');

if (!existsSync(join(docsRepo, '.git'))) {
  fail(`no docs repo at ${docsRepo}. It must be a git repo named engender-docs next to ${primary}.`);
}
if (branchOf(docsRepo) !== 'main') {
  fail(`the docs repo checkout at ${docsRepo} is on "${branchOf(docsRepo) || 'a detached HEAD'}", not main. Put it back on main first.`);
}

// Refuse before creating anything, so a refusal leaves no docs worktree or branch behind.
const blocked = NAMES.filter((name) => {
  try { return !lstatSync(join(top, name)).isSymbolicLink(); } catch { return false; }
});
if (blocked.length) {
  fail(`${blocked.join(', ')} already exist here as real files or folders. Move them into the docs repo by hand first; this script never replaces them.`);
}

// Before the ADRs moved into this repo, `docs` itself was the link. A link is
// safe to drop: it only points at files in the docs repo.
try {
  if (lstatSync(join(top, 'docs')).isSymbolicLink()) {
    rmSync(join(top, 'docs'));
    console.log('removed the old docs symlink');
  }
} catch { /* absent */ }

let source = docsRepo;
const branch = top === primary ? '' : branchOf(top);
if (branch) {
  source = join(docsRepo, '.worktrees', branch);
  if (!(existsSync(source) && branchOf(source) === branch)) {
    const exists = (() => {
      try { git(docsRepo, 'rev-parse', '--verify', '-q', `refs/heads/${branch}`); return true; } catch { return false; }
    })();
    try {
      if (exists) git(docsRepo, 'worktree', 'add', source, branch);
      else git(docsRepo, 'worktree', 'add', '-b', branch, source, 'main');
    } catch (error) {
      fail(`could not create the docs worktree for ${branch}: ${error.stderr || error.message}`);
    }
    console.log(`created docs worktree ${source} on branch ${branch}`);
  }
}

// Work out every link first, then make them, so nothing is half-linked.
const plan = [];
for (const name of NAMES) {
  const link = join(top, name);
  const want = join(source, targetName(name));
  let stat = null;
  try { stat = lstatSync(link); } catch { /* absent */ }
  if (!stat) plan.push({ link, want, replace: false });
  else if (readlinkSync(link) !== want) plan.push({ link, want, replace: true });
  else console.log(`ok ${name}`);
}
for (const { link, want, replace } of plan) {
  if (replace) rmSync(link);
  mkdirSync(dirname(link), { recursive: true });
  symlinkSync(want, link);
  console.log(`linked ${link} -> ${want}`);
}
