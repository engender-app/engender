import { afterEach, expect, test } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { invocationFailed, runCapabilityInvocation } from './browser-tier/capability-invocation.mjs';

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })));
});

async function fixture(source: string) {
  const directory = await mkdtemp(join(tmpdir(), 'capability-invocation-'));
  directories.push(directory);
  const script = join(directory, 'fixture.mjs');
  const log = join(directory, 'output.log');
  const resultsFile = join(directory, 'results.json');
  await writeFile(script, `import { writeFileSync } from 'node:fs';\n${source}`);
  return { script, log, resultsFile };
}

test('passing case JSON cannot hide unsuccessful process completion', async () => {
  const files = await fixture(`
    writeFileSync(process.env.CAPABILITY_RESULTS, JSON.stringify([{ capability: 'save', status: 'pass' }]));
    console.log('PASS save');
    console.error('cleanup failed');
    process.exitCode = 1;
  `);
  const result = await runCapabilityInvocation(files.script, { ...files, env: { CAPABILITY_RESULTS: files.resultsFile } });
  expect(result.cases).toEqual([{ capability: 'save', status: 'pass' }]);
  expect(result.code).toBe(1);
  expect(invocationFailed(result)).toBe(true);
  expect(await readFile(files.log, 'utf8')).toContain('cleanup failed');
});

test('signal after partial passing JSON remains unsuccessful', async () => {
  const files = await fixture(`
    writeFileSync(process.env.CAPABILITY_RESULTS, JSON.stringify([{ capability: 'save', status: 'pass' }]));
    process.kill(process.pid, 'SIGTERM');
  `);
  const result = await runCapabilityInvocation(files.script, { ...files, env: { CAPABILITY_RESULTS: files.resultsFile } });
  expect(result.cases).toEqual([{ capability: 'save', status: 'pass' }]);
  expect(result.signal).toBe('SIGTERM');
  expect(invocationFailed(result)).toBe(true);
});


test('a reused evidence directory is refused before stale results can count', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'capability-stale-'));
  directories.push(directory);
  const stale = join(directory, 'chromium-1.json');
  const previous = '[{"capability":"save","status":"pass"}]';
  await writeFile(stale, previous);
  const runner = fileURLToPath(new URL('./browser-tier/capability-matrix.mjs', import.meta.url));
  await expect(promisify(execFile)(process.execPath, [runner, 'production'], {
    env: { ...process.env, CAPABILITY_OUTPUT: directory }
  })).rejects.toMatchObject({ code: 1, stderr: expect.stringContaining('EEXIST') });
  expect(await readFile(stale, 'utf8')).toBe(previous);
});


test('exit zero after timeout cannot make the invocation pass', async () => {
  const files = await fixture(`
    writeFileSync(process.env.CAPABILITY_RESULTS, JSON.stringify([{ capability: 'save', status: 'pass' }]));
    process.on('SIGTERM', () => process.exit(0));
    setInterval(() => {}, 1000);
  `);
  const result = await runCapabilityInvocation(files.script, {
    ...files, env: { CAPABILITY_RESULTS: files.resultsFile }, timeoutMs: 1000
  });
  expect(result.code).toBe(0);
  expect(result.cases).toEqual([{ capability: 'save', status: 'pass' }]);
  expect(result.timedOut).toBe(true);
  expect(invocationFailed(result)).toBe(true);
});

test('a child ignoring timeout termination is stopped by the fallback', async () => {
  const files = await fixture(`
    process.on('SIGTERM', () => {});
    setInterval(() => {}, 1000);
  `);
  const result = await runCapabilityInvocation(files.script, { ...files, timeoutMs: 1000, killGraceMs: 100 });
  expect(result.signal).toBe('SIGKILL');
  expect(result.timedOut).toBe(true);
  expect(invocationFailed(result)).toBe(true);
});
