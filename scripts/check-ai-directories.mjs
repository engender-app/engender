import { execFileSync } from 'node:child_process';

// Match directory names from .gitignore, including nested working directories.
const directories = new Set([
  '.scratch', '.claude', '.agents', '.gemini', '.cursor', '.continue',
  '.roo', '.codex', '.opencode', '.impeccable'
]);

try {
  const paths = execFileSync('git', ['ls-files', '--cached', '--full-name', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
  const forbidden = paths.filter((path) => path.split('/').slice(0, -1)
    .some((directory) => directories.has(directory) || directory.startsWith('.aider')));
  if (forbidden.length) {
    console.error('AI working directories must stay untracked:');
    for (const path of forbidden) console.error(`  ${JSON.stringify(path)}`);
    console.error('Remove these paths from the Git index with git rm --cached, preserving local files.');
    process.exitCode = 1;
  } else {
    console.log('No tracked files in AI working directories.');
  }
} catch (error) {
  console.error('Could not inspect the Git index:', error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
