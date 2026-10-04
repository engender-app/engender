import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runGuards, selectGuards } from './run-guards.mjs';

describe('guard runner', () => {
  const guards = [
    { name: 'first', tier: 'dev', holds: 'first invariant' },
    { name: 'second', tier: 'dev', holds: 'second invariant' },
    { name: 'third', tier: 'dev', holds: 'third invariant' }
  ];

  it('runs every guard, retries failures once and retains both attempt results', async () => {
    const calls: string[] = [];
    const output: string[] = [];
    const results = await runGuards(guards, {
      run: async (_command: string, args: string[]) => {
        const name = args[0];
        calls.push(name);
        return name.includes('first') || (name.includes('second') && calls.filter((v) => v === name).length === 1) ? 1 : 0;
      },
      log: (line: string) => output.push(line)
    });
    expect(calls).toEqual(['tests/first.mjs', 'tests/first.mjs', 'tests/second.mjs', 'tests/second.mjs', 'tests/third.mjs']);
    expect(results.map((row) => row.passed)).toEqual([false, true, true]);
    expect(results.map((row) => row.attempts.map((attempt) => attempt.code))).toEqual([[1, 1], [1, 0], [0]]);
    expect(results.every((row) => row.durationMs >= 0)).toBe(true);
    expect(output.join('\n')).toContain('FAIL first');
    expect(output.join('\n')).toContain('PASS second');
    expect(output.join('\n')).toContain('PASS third');
  });


  it('CLI retries a failure, still executes the next guard and exits nonzero', () => {
    const root = mkdtempSync(join(tmpdir(), 'guard-runner-'));
    try {
      mkdirSync(join(root, 'tests'));
      mkdirSync(join(root, 'scripts'));
      copyFileSync(new URL('./run-guards.mjs', import.meta.url), join(root, 'tests/run-guards.mjs'));
      copyFileSync(new URL('../scripts/check-process.mjs', import.meta.url), join(root, 'scripts/check-process.mjs'));
      writeFileSync(join(root, 'tests/guards.json'), JSON.stringify(guards.slice(0, 2)));
      writeFileSync(join(root, 'tests/first.mjs'), 'process.exit(1);');
      writeFileSync(join(root, 'tests/second.mjs'), 'console.log("later guard ran");');
      const result = spawnSync(process.execPath, ['tests/run-guards.mjs', '--tier', 'dev'], {
        cwd: root, encoding: 'utf8', env: { ...process.env, GITHUB_STEP_SUMMARY: '' }
      });
      expect(result.status).toBe(1);
      expect(result.stdout).toContain('Guard: first, attempt 2/2');
      expect(result.stdout).toContain('later guard ran');
      expect(result.stdout).toContain('FAIL first');
      expect(result.stdout).toContain('PASS second');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('builds each required bundle once and keeps the production recovery guard separate', async () => {
    const calls: { args: string[]; demo?: string }[] = [];
    await runGuards([
      { name: 'demo-one', tier: 'built', holds: 'one' },
      { name: 'demo-two', tier: 'built', holds: 'two', args: ['--gate'] },
      { name: 'device-recovery', tier: 'built', holds: 'recovery', build: 'production' }
    ], {
      run: async (_command: string, args: string[], env: NodeJS.ProcessEnv) => {
        calls.push({ args, demo: env.VITE_DEMO });
        return 0;
      }, log: () => {}
    });
    expect(calls).toEqual([
      { args: ['run', 'build'], demo: '1' },
      { args: ['tests/demo-one.mjs'], demo: undefined },
      { args: ['tests/demo-two.mjs', '--gate'], demo: undefined },
      { args: ['run', 'build'], demo: '0' },
      { args: ['tests/device-recovery.mjs'], demo: undefined }
    ]);
  });

  it('records a failed build for its guards and still tries the production build', async () => {
    const calls: string[][] = [];
    const results = await runGuards([
      { name: 'demo', tier: 'built', holds: 'demo' },
      { name: 'recovery', tier: 'built', holds: 'recovery', build: 'production' }
    ], {
      run: async (_command: string, args: string[], env: NodeJS.ProcessEnv) => {
        calls.push(args);
        return env.VITE_DEMO === '1' ? 1 : 0;
      }, log: () => {}
    });
    expect(calls).toEqual([['run', 'build'], ['run', 'build'], ['tests/recovery.mjs']]);
    expect(results.map((row) => row.passed)).toEqual([false, true]);
    expect(results[0].buildFailed).toBe(true);
  });

  it('balances measured duration rather than guard count and retains roster order', () => {
    const measured = [
      { name: 'short-one', tier: 'dev', holds: 'one' },
      { name: 'short-two', tier: 'dev', holds: 'two' },
      { name: 'long', tier: 'dev', holds: 'three' }
    ];
    const timings = { guards: { 'short-one': 20, 'short-two': 30, long: 100 }, builds: {} };
    expect(selectGuards(measured, 'dev', '1/2', timings).map((guard) => guard.name)).toEqual(['long']);
    expect(selectGuards(measured, 'dev', '2/2', timings).map((guard) => guard.name)).toEqual(['short-one', 'short-two']);
  });

  it('refuses an unmeasured guard instead of dropping its coverage', () => {
    expect(() => selectGuards(guards, 'dev', '1/2', { guards: { first: 30 }, builds: {} }))
      .toThrow('Missing duration for guard: second');
  });

  it('partitions each tier without missing or repeating a guard', () => {
    const built = guards.map((guard) => ({ ...guard, tier: 'built' }));
    const timings = { guards: { first: 30, second: 20, third: 10 }, builds: { demo: 5 } };
    expect([...selectGuards(built, 'built', '1/2', timings), ...selectGuards(built, 'built', '2/2', timings)]).toEqual(built);
    expect(() => selectGuards(built, 'built', '0/2')).toThrow('Invalid shard');
    expect(() => selectGuards(built, 'unknown')).toThrow('Invalid tier');
  });
});
