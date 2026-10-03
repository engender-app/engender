import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
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

  it('reports source check failures even when the production build fails', async () => {
    const calls: string[] = [];
    const output: string[] = [];
    const results = await runChecks(CI_CHECKS.node, {
      run: async (_command: string, args: string[]) => { calls.push(args.join(' ')); return 1; },
      log: (line: string) => output.push(line)
    });
    expect(calls).toEqual(['run build', 'run check:copy', 'run check:licences', 'run check:screens-classes']);
    expect(results.filter((result) => result.outcome === 'failed').map((result) => result.id))
      .toEqual(['build', 'copy', 'licences', 'classes']);
    expect(results.filter((result) => result.outcome === 'blocked').map((result) => result.id))
      .toEqual(['types', 'node', 'budget']);
    expect(output.join('\n')).toContain('FAIL Message catalogues and user-facing literals');
    expect(output.join('\n')).toContain('FAIL Dependency licences');
    expect(output.join('\n')).toContain('FAIL screens.css single-consumer classes');
    expect(results).toHaveLength(CI_CHECKS.node.length);
  });

  it('keeps the collected debug APK after F-Droid removes Gradle build output', async () => {
    const preserve = CI_CHECKS.android.find((check) => check.id === 'preserve-apk');
    expect(preserve).toBeDefined();
    const root = mkdtempSync(join(tmpdir(), 'ci-apk-'));
    const bytes = [80, 75, 3, 4, 1, 2, 3, 4];
    try {
      const checks = CI_CHECKS.android.filter((check) => ['apk', 'preserve-apk', 'fdroid'].includes(check.id)).map((check) => {
        if (check.id === 'apk') return { ...check, command: process.execPath, cwd: root, requires: [],
          args: ['--input-type=module', '-e', `import { mkdirSync, writeFileSync } from 'node:fs'; mkdirSync('android/app/build/outputs/apk/debug', {recursive:true}); writeFileSync('android/app/build/outputs/apk/debug/app-debug.apk', Buffer.from(${JSON.stringify(bytes)}));`] };
        if (check.id === 'preserve-apk') return { ...check, command: process.execPath,
          args: [fileURLToPath(new URL('../scripts/preserve-debug-apk.mjs', import.meta.url))], cwd: root };
        return { ...check, command: process.execPath, cwd: root, requires: [],
          args: ['--input-type=module', '-e', "import { rmSync } from 'node:fs'; rmSync('android/app/build', {recursive:true,force:true});"] };
      });
      const results = await runChecks(checks, { log: () => {} });
      expect(results.every((result) => result.outcome === 'passed')).toBe(true);
      expect(existsSync(join(root, 'android/app/build/outputs/apk/debug/app-debug.apk'))).toBe(false);
      expect([...readFileSync(join(root, 'ci-logs/app-debug.apk'))]).toEqual(bytes);
      const workflow = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
      expect(workflow).toContain('path: ci-logs/app-debug.apk');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
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
