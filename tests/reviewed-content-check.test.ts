/* The release-time half of the reviewed-on guard (functional audit ticket
   40): the script the release workflow runs loads the real registry, warns
   once per entry past its limit, and still exits 0. */

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';
import { REVIEWED_CONTENT } from '../src/lib/reviewedContent';

const script = fileURLToPath(new URL('../scripts/check-reviewed-content.mjs', import.meta.url));

function run(today: string, env: NodeJS.ProcessEnv = {}): string {
  return execFileSync(process.execPath, [script, '--today', today], {
    encoding: 'utf8',
    env: { ...process.env, GITHUB_ACTIONS: '', GITHUB_STEP_SUMMARY: '', ...env }
  });
}

test('every registered entry warns, and the run still passes, once its limit is long past', () => {
  const output = run('2099-01-01');
  const warned = output.split('\n').filter((line) => line.startsWith('warning: '));

  expect(warned).toHaveLength(REVIEWED_CONTENT.length);
  expect(new Set(warned.map((line) => line.slice(9).split(',')[0]))).toEqual(new Set(REVIEWED_CONTENT.map((entry) => entry.area)));
});

test('in GitHub Actions each warning is an annotation on the run', () => {
  const output = run('2099-01-01', { GITHUB_ACTIONS: 'true' });

  expect(output).toMatch(/^::warning title=Reviewed content past its limit::Resources, /m);
});

test('nothing warns on the day of the latest review pass', () => {
  expect(run('2026-10-21')).not.toContain('warning');
});

test('a --today that is not a real day is refused rather than compared as text', () => {
  expect(() => run('2026-02-30')).toThrow();
});
