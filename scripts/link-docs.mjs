#!/usr/bin/env node
/* Links optional maintainer documentation into this checkout (npm run docs:link).

   The primary checkout and detached worktrees link the sibling docs repo on main. A branch
   worktree gets a matching branch in the docs repo.

   Run from any checkout. Existing symlinks can be reused. Regular files and directories are
   left in place. */
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, readlinkSync, rmSync, symlinkSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';

// Local link paths and their targets in the docs checkout.
const LINKS = { 'CONTEXT.md': 'CONTEXT.md', 'PRODUCT.md': 'PRODUCT.md', 'SCREENS.md': 'SCREENS.md', 'DIRECTION.md': 'DIRECTION.md', 'docs/internal': '' };

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
const blocked = Object.keys(LINKS).filter((name) => {
  try { return !lstatSync(join(top, name)).isSymbolicLink(); } catch { return false; }
});
if (blocked.length) {
  fail('Documentation link paths already exist as regular files or directories. Move them to the docs checkout before linking.');
}

// Remove the old directory symlink before creating individual links.
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
for (const [name, target] of Object.entries(LINKS)) {
  const link = join(top, name);
  const want = join(source, target);
  let stat = null;
  try { stat = lstatSync(link); } catch { /* absent */ }
  if (!stat) plan.push({ link, want, replace: false });
  else if (readlinkSync(link) !== want) plan.push({ link, want, replace: true });
  else console.log('Documentation link already in place');
}
for (const { link, want, replace } of plan) {
  if (replace) rmSync(link);
  mkdirSync(dirname(link), { recursive: true });
  symlinkSync(want, link);
  console.log('Linked documentation');
}
