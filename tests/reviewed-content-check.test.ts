/* The release-time half of the reviewed-on guard (functional audit ticket
   40): the script the release workflow runs loads the real registry, warns
   once per entry past its limit, and still exits 0. */

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const script = fileURLToPath(new URL('../scripts/check-reviewed-content.mjs', import.meta.url));

function run(today: string, env: NodeJS.ProcessEnv = {}): string {
  return execFileSync(process.execPath, [script, '--today', today], {
    encoding: 'utf8',
    env: { ...process.env, GITHUB_ACTIONS: '', GITHUB_STEP_SUMMARY: '', ...env }
  });
}

test('every shipped area warns, and the run still passes, once its limit is long past', () => {
  const output = run('2099-01-01');
  const warned = output.split('\n').filter((line) => line.startsWith('warning: ')).map((line) => line.slice(9).split(',')[0]);

  expect(new Set(warned)).toEqual(new Set(['Resources', 'Roadmap', 'Voice', 'Wear']));
});

test('in GitHub Actions each warning is an annotation on the run', () => {
  const output = run('2099-01-01', { GITHUB_ACTIONS: 'true' });

  expect(output).toMatch(/^::warning title=Reviewed content past its limit::Resources, /m);
});

test('nothing warns on the day of the latest review pass', () => {
  expect(run('2026-10-21')).not.toContain('warning');
});
