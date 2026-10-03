import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { CI_CHECKS, runChecks } from '../scripts/run-ci-checks.mjs';

describe('CI check collection', () => {
  it('runs every independent check after failures and returns every failure', async () => {
    const calls: string[] = [];
    const output: string[] = [];
    const checks = [
      { id: 'build', name: 'Build', command: 'npm', args: ['build'] },
      { id: 'types', name: 'Types', command: 'npm', args: ['types'], requires: ['build'] },
      { id: 'node', name: 'Node', command: 'npm', args: ['node'], requires: ['build'] },
      { id: 'copy', name: 'Copy', command: 'npm', args: ['copy'], requires: ['build'] }
    ];
    const results = await runChecks(checks, {
      run: async (_command: string, args: string[]) => {
        calls.push(args[0]);
        return ['types', 'node'].includes(args[0]) ? 1 : 0;
      }, log: (line: string) => output.push(line)
    });
    expect(calls).toEqual(['build', 'types', 'node', 'copy']);
    expect(results.map((result) => result.outcome)).toEqual(['passed', 'failed', 'failed', 'passed']);
    expect(output.join('\n')).toContain('FAIL Types');
    expect(output.join('\n')).toContain('FAIL Node');
    expect(output.join('\n')).toContain('PASS Copy');
  });

  it('lists dependent checks as blocked when their prerequisite fails', async () => {
    const calls: string[] = [];
    const results = await runChecks(CI_CHECKS.node, {
      run: async (_command: string, args: string[]) => { calls.push(args.join(' ')); return 1; }, log: () => {}
    });
    expect(calls).toEqual(['run build']);
    expect(results[0].outcome).toBe('failed');
    expect(results.slice(1).every((result) => result.outcome === 'blocked')).toBe(true);
    expect(results).toHaveLength(CI_CHECKS.node.length);
  });

  it('keeps the APK and F-Droid checks running after an Android policy failure', async () => {
    const calls: string[] = [];
    const results = await runChecks(CI_CHECKS.android, {
      run: async (_command: string, args: string[]) => {
        calls.push(args.join(' '));
        return args[0] === 'scripts/check-android-dependencies.mjs' ? 1 : 0;
      }, log: () => {}
    });
    expect(calls).toContain(':app:assembleDebug');
    expect(calls).toContain('scripts/fdroid-rebuild-report.mjs');
    expect(results.filter((result) => result.outcome === 'failed').map((result) => result.id)).toEqual(['policy']);
  });

  it('exits nonzero and lists every blocked check when job setup never finishes', () => {
    const result = spawnSync(process.execPath, ['scripts/run-ci-checks.mjs', '--tier', 'node', '--blocked'], { encoding: 'utf8', env: { ...process.env, GITHUB_STEP_SUMMARY: '' } });
    expect(result.status).toBe(1);
    for (const check of CI_CHECKS.node) expect(result.stdout).toContain(`BLOCKED ${check.name}`);
  });
});
