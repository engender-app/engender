import { spawnSync } from 'node:child_process';
import { copyFileSync, globSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
    expect(results.map((row) => row.outcome)).toEqual(['failed', 'recovered', 'passed']);
    expect(results.map((row) => row.attempts.map((attempt) => attempt.code))).toEqual([[1, 1], [1, 0], [0]]);
    expect(results.every((row) => row.durationMs >= 0)).toBe(true);
    expect(output.join('\n')).toContain('FAIL first');
    expect(output.join('\n')).toContain('RECOVERED second');
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

  it('CLI reports recovery with the checkout revision and preserves overwritten diagnostics from both attempts', () => {
    const root = mkdtempSync(join(tmpdir(), 'guard-recovery-'));
    try {
      mkdirSync(join(root, 'tests'));
      mkdirSync(join(root, 'scripts'));
      mkdirSync(join(root, '.claude/shots'), { recursive: true });
      writeFileSync(join(root, '.claude/shots/unchanged.txt'), 'unrelated old evidence');
      copyFileSync(new URL('./run-guards.mjs', import.meta.url), join(root, 'tests/run-guards.mjs'));
      copyFileSync(new URL('../scripts/check-process.mjs', import.meta.url), join(root, 'scripts/check-process.mjs'));
      writeFileSync(join(root, 'tests/guards.json'), JSON.stringify([
        { ...guards[0], diagnostics: ['.claude/shots/*'] }, guards[1]
      ]));
      writeFileSync(join(root, 'tests/first.mjs'), `
        import { existsSync, writeFileSync } from 'node:fs';
        const first = !existsSync('attempted');
        writeFileSync('attempted', 'yes');
        writeFileSync('.claude/shots/report.json', first ? 'failed case evidence' : 'recovered case evidence');
        console.log(first ? 'FAIL synthetic case' : 'PASS synthetic case');
        console.error(first ? 'first attempt stderr' : 'second attempt stderr');
        process.exit(first ? 1 : 0);
      `);
      writeFileSync(join(root, 'tests/second.mjs'), 'console.log("independent guard ran");');
      spawnSync('git', ['init', '-q', root]);
      spawnSync('git', ['-C', root, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '--allow-empty', '-qm', 'Fixture']);
      const revision = spawnSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
      const result = spawnSync(process.execPath, ['tests/run-guards.mjs', '--tier', 'dev'], {
        cwd: root, encoding: 'utf8', env: { ...process.env, GITHUB_SHA: 'incorrect-event-sha', GITHUB_STEP_SUMMARY: join(root, 'summary.md') }
      });
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('RECOVERED first');
      expect(result.stdout).toContain('PASS second');
      const summary = readFileSync(join(root, 'summary.md'), 'utf8');
      expect(summary).toContain('| first | recovered |');
      expect(summary).toContain('| second | passed |');
      expect(summary).toContain(revision);
      expect(summary).toContain('FAIL synthetic case');
      expect(summary).toMatch(/first\/attempt-1\/output\.log/);
      expect(summary).toMatch(/attempt 1: exit 1, [0-9.]+s/);
      expect(summary).toMatch(/attempt 2: exit 0, [0-9.]+s/);
      const attempts = globSync('ci-logs/guards/*/first/attempt-*/result.json', { cwd: root }).sort();
      expect(attempts).toHaveLength(2);
      for (const [index, path] of attempts.entries()) {
        const attempt = JSON.parse(readFileSync(join(root, path), 'utf8'));
        expect(attempt).toMatchObject({ name: 'first', revision, attempt: index + 1, code: index === 0 ? 1 : 0 });
        expect(Date.parse(attempt.finishedAt)).toBeGreaterThanOrEqual(Date.parse(attempt.startedAt));
        expect(attempt.durationMs).toBeGreaterThanOrEqual(0);
        const directory = join(root, path, '..');
        expect(readFileSync(join(directory, 'output.log'), 'utf8')).toContain(index === 0 ? 'first attempt stderr' : 'second attempt stderr');
        expect(readFileSync(join(directory, 'diagnostics/.claude/shots/report.json'), 'utf8')).toBe(index === 0 ? 'failed case evidence' : 'recovered case evidence');
        expect(globSync('**/unchanged.txt', { cwd: directory })).toEqual([]);
      }
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
    expect(results[0].outcome).toBe('blocked');
    expect(results[0].attempts).toEqual([]);
  });

  it('names every guard blocked by job setup without executing it', async () => {
    const output: string[] = [];
    const results = await runGuards(guards, {
      blocked: true,
      run: async () => { throw new Error('A blocked guard must not execute'); },
      log: (line: string) => output.push(line)
    });
    expect(results.every((row) => row.outcome === 'blocked' && !row.passed && row.attempts.length === 0)).toBe(true);
    for (const guard of guards) expect(output.join('\n')).toContain(`BLOCKED ${guard.name}`);
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
