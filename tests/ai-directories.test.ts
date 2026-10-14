import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, expect, it } from 'vitest';

const script = fileURLToPath(new URL('../scripts/check-ai-directories.mjs', import.meta.url));
let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'ai-directory-check-'));
  execFileSync('git', ['init', '-q', root]);
  writeFileSync(join(root, '.gitignore'), readFileSync(new URL('../.gitignore', import.meta.url)));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));
function add(path: string, tracked = true) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), 'fixture');
  if (tracked) execFileSync('git', ['-C', root, 'add', '-f', '--', path]);
}
function check() {
  return spawnSync(process.execPath, [script], { cwd: root, encoding: 'utf8' });
}

it('rejects forced tracked files in AI and docs directories at any depth', () => {
  const paths = ['.scratch/task.md', '.claude/state', '.agents/state', '.gemini/state', '.cursor/state',
    '.aider.cache/state', '.continue/state', '.roo/state', '.codex/state', '.opencode/state', '.impeccable/state',
    'nested folder/.scratch/line\nbreak.md', 'nested/.codex/session',
    'docs/notes.md', 'nested/docs/report.json',
    '.github/instructions/project.instructions.md', '.github/prompts/review.prompt.md',
    '.github/agents/reviewer.md'];
  for (const path of paths) add(path);
  const result = check();
  expect(result.status).toBe(1);
  for (const path of paths) expect(result.stderr).toContain(JSON.stringify(path));
});

it('rejects forced tracked assistant files outside working directories', () => {
  const paths = ['AGENTS.md', 'nested/CLAUDE.md', 'GEMINI.md', 'PRODUCT.md',
    'nested/SCREENS.md', 'CONTEXT.md', '.mcp.json', '.aider.conf.yml',
    '.cursorrules', '.windsurfrules', '.clinerules', '.roomodes',
    '.github/copilot-instructions.md'];
  for (const path of paths) add(path);
  const result = check();
  expect(result.status).toBe(1);
  for (const path of paths) expect(result.stderr).toContain(JSON.stringify(path));
});

it('allows ignored local state and tracked source files', () => {
  for (const path of ['.scratch/local.md', 'nested/.claude/local.md', '.aider.cache/local', 'docs/notes.md', 'AGENTS.md', 'evidence-new/local.json']) add(path, false);
  for (const path of ['src/scratch/value.ts', 'src/.scratchpad/value.ts',
    'prototype/example.ts', 'tests/rule.ts']) add(path);
  writeFileSync(join(root, 'tests/rule.ts'), "const example = '.scratch/notes.md';");
  execFileSync('git', ['-C', root, 'add', '--', 'tests/rule.ts']);
  expect(check().status).toBe(0);
});

it('ignores docs and assistant notes before they reach the index', () => {
  for (const path of ['docs/notes.md', 'nested/docs/report.json', 'AGENTS.md',
    'nested/CLAUDE.md', 'PRODUCT.md', '.github/copilot-instructions.md',
    '.github/instructions/project.instructions.md', 'evidence-new/local.json']) {
    add(path, false);
    expect(execFileSync('git', ['-C', root, 'check-ignore', path], { encoding: 'utf8' }).trim()).toBe(path);
  }
});

it('fails when Git cannot read an index', () => {
  rmSync(join(root, '.git'), { recursive: true });
  const result = check();
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('Could not inspect the Git index');
});

it('rejects a newly named root evidence directory without banning application evidence routes', () => {
  add('evidence-new/local.json');
  add('src/routes/doubt/evidence/+page.svelte');
  add('tests/fixtures/evidence/sample.json');
  const result = check();
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('evidence-new/local.json');
  expect(result.stderr).not.toContain('src/routes/doubt/evidence');
  expect(result.stderr).not.toContain('tests/fixtures/evidence');
});

it('excludes planted local evidence from a committed archive and retains build inputs and fixtures', () => {
  writeFileSync(join(root, '.gitattributes'), readFileSync(new URL('../.gitattributes', import.meta.url)));
  const retained = ['package.json', 'src/app.html', 'messages/en.json',
    'scripts/build-locales.mjs', 'src/routes/doubt/evidence/+page.svelte',
    'tests/fixtures/evidence/sample.json'];
  for (const path of [...retained, 'evidence-new/local.json', 'evidence999/probe.json']) add(path);
  execFileSync('git', ['-C', root, 'add', '--', '.gitattributes']);
  execFileSync('git', ['-C', root, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
    'commit', '-qm', 'Create synthetic source package']);
  // Export must use the committed policy, regardless of checkout edits.
  writeFileSync(join(root, '.gitattributes'), '');
  const archive = execFileSync('git', ['-C', root, 'archive', '--format=tar', 'HEAD']);
  const entries = execFileSync('tar', ['-tf', '-'], { input: archive, encoding: 'utf8' }).trim().split('\n');
  for (const path of retained) expect(entries).toContain(path);
  expect(entries.some(path => path.startsWith('evidence'))).toBe(false);
});
