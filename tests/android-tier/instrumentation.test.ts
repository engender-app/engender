import { afterEach, expect, test, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { reportInstrumentation, runInstrumentation, reportStage } from './instrumentation.mjs';

const dirs: string[] = [];
const directory = () => { const dir = mkdtempSync(join(tmpdir(), 'android-results-')); dirs.push(dir); return dir; };
const xml = (body: string, tests = 1) => `<testsuite tests="${tests}">${body}</testsuite>`;
const passing = '<testcase classname="Probe" name="first"/>';
const reporter = () => ({ ok: vi.fn(), fail: vi.fn() });
afterEach(() => { dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true })); vi.restoreAllMocks(); });

test('passed, failed, error and skipped cases retain their attribution', async () => {
  const dir = directory(); const report = reporter(); const skip = vi.spyOn(console, 'log').mockImplementation(() => {});
  writeFileSync(join(dir, 'result.xml'), xml(passing + '<testcase classname="Probe" name="bad"><failure message="bad">broken</failure></testcase><testcase classname="Probe" name="error"><error/></testcase><testcase classname="Probe" name="skip"><skipped message="unavailable"/></testcase>', 4));
  expect(await reportInstrumentation('avd', { status: 0 }, dir, report)).toBe(false);
  expect(report.ok.mock.calls).toEqual([['avd Probe.first']]);
  expect(report.fail.mock.calls.map(([name]) => name)).toEqual(['avd Probe.bad', 'avd Probe.error']);
  expect(skip).toHaveBeenCalledWith('SKIP', 'avd Probe.skip', 'unavailable');
});

test('required skip fails', async () => {
  const dir = directory(); const report = reporter(); vi.spyOn(console, 'log').mockImplementation(() => {});
  writeFileSync(join(dir, 'result.xml'), xml('<testcase classname="Probe" name="stage"><skipped/></testcase>'));
  expect(await reportInstrumentation('stage', { status: 0 }, dir, report, { required: true })).toBe(false);
  expect(report.ok).not.toHaveBeenCalled(); expect(report.fail).toHaveBeenCalled();
});

for (const [name, script, options] of [
  ['exit', 'process.exit(1)', {}],
  ['signal', 'process.kill(process.pid, "SIGTERM")', {}],
  ['timeout', 'setInterval(() => {}, 1000)', { timeout: 100 }]
] as const) test(`runner rejects ${name} after partial passing XML`, async () => {
  const dir = directory(); const report = reporter();
  const result = await runInstrumentation({ label: name, resultsDir: dir, reporter: report, invoke: () => spawnSync(process.execPath, ['-e', `require('node:fs').mkdirSync(${JSON.stringify(dir)}, { recursive: true }); require('node:fs').writeFileSync(${JSON.stringify(join(dir, 'result.xml'))}, ${JSON.stringify(xml(passing))}); ${script}`], { encoding: 'utf8', ...options }) });
  expect(result).toBe(false); expect(report.fail).toHaveBeenCalledWith(expect.stringContaining('invocation'), expect.any(String));
});

test('startup failure cannot reuse prior passing XML', async () => {
  const dir = directory(); const report = reporter(); writeFileSync(join(dir, 'old.xml'), xml(passing));
  expect(await runInstrumentation({ label: 'startup', resultsDir: dir, reporter: report, invoke: () => spawnSync('/no-such-android-runner', [], { encoding: 'utf8' }) })).toBe(false);
  expect(report.ok).not.toHaveBeenCalled(); expect(report.fail).toHaveBeenCalledTimes(2);
});

for (const content of ['', '<testsuite>', xml(passing, 2), '<unexpected/>']) test(`unusable result fails: ${content}`, async () => {
  const dir = directory(); const report = reporter(); writeFileSync(join(dir, 'result.xml'), content);
  expect(await reportInstrumentation('avd', { status: 0 }, dir, report)).toBe(false); expect(report.fail).toHaveBeenCalled();
});

test('successful fresh invocation passes and clears previous failures', async () => {
  const dir = directory(); const report = reporter(); writeFileSync(join(dir, 'old.xml'), '<bad>');
  expect(await runInstrumentation({ label: 'avd', resultsDir: dir, reporter: report, invoke: () => { mkdirSync(dir); writeFileSync(join(dir, 'new.xml'), xml(passing)); return { status: 0 }; } })).toBe(true);
  expect(report.fail).not.toHaveBeenCalled(); expect(report.ok).toHaveBeenCalledOnce();
});

test('required raw instrumentation stage rejects skip, empty and aborted output', () => {
  for (const output of ['', 'OK (0 tests)', 'OK (1 test)\nINSTRUMENTATION_STATUS_CODE: -3', 'OK (1 test)\nINSTRUMENTATION_FAILED: crash']) {
    expect(reportStage('stage', { status: 0, stdout: output }, reporter())).toBe(false);
  }
  expect(reportStage('stage', { status: 0, stdout: 'INSTRUMENTATION_STATUS: current=1\nINSTRUMENTATION_STATUS: numtests=1\nINSTRUMENTATION_STATUS_CODE: 1\nINSTRUMENTATION_STATUS: current=1\nINSTRUMENTATION_STATUS: numtests=1\nINSTRUMENTATION_STATUS_CODE: 0\nOK (1 test)\nINSTRUMENTATION_CODE: -1\n' }, reporter())).toBe(true);
});

test('raw stage summary without complete protocol fails', () => {
  expect(reportStage('stage', { status: 0, stdout: 'OK (1 test)' }, reporter())).toBe(false);
  expect(reportStage('stage', { status: 0, stdout: 'INSTRUMENTATION_STATUS: numtests=2\nINSTRUMENTATION_STATUS_CODE: 1\nOK (1 test)\nINSTRUMENTATION_CODE: -1' }, reporter())).toBe(false);
});
