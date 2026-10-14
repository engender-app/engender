import { execFileSync } from 'node:child_process';

// Match ignored working directories at any depth, including docs.
const directories = new Set([
  '.scratch', '.claude', '.agents', '.gemini', '.cursor', '.continue',
  '.roo', '.codex', '.opencode', '.impeccable', 'docs'
]);
const files = new Set([
  'AGENTS.md', 'CLAUDE.md', 'GEMINI.md', 'PRODUCT.md', 'SCREENS.md',
  'CONTEXT.md', '.mcp.json', '.cursorrules', '.windsurfrules',
  '.clinerules', '.roomodes', 'copilot-instructions.md'
]);

try {
  const paths = execFileSync('git', ['ls-files', '--cached', '--full-name', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
  const forbidden = paths.filter((path) => {
    const parts = path.split('/');
    const name = parts.pop();
    return path.startsWith('evidence') ||
      parts.some((directory) => directories.has(directory) || directory.startsWith('.aider')) ||
      parts.some((directory, index) => directory === '.github' &&
        ['instructions', 'prompts', 'agents'].includes(parts[index + 1])) ||
      files.has(name) || name.startsWith('.aider');
  });
  if (forbidden.length) {
    console.error('Docs, assistant notes and local evidence must stay untracked:');
    for (const path of forbidden) console.error(`  ${JSON.stringify(path)}`);
    console.error('Remove these paths from the Git index with git rm --cached, preserving local files.');
    process.exitCode = 1;
  } else {
    console.log('No tracked docs, assistant notes or local evidence.');
  }
} catch (error) {
  console.error('Could not inspect the Git index:', error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
