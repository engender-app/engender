import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const guard = readFileSync(new URL('./words-reading-scope-check.mjs', import.meta.url), 'utf8');
const reporterUrl = new URL('./browser-harness.mjs', import.meta.url).href;
const setup = guard.slice(guard.indexOf('const { ok,'), guard.indexOf('const app ='));
const tileBlock = guard.slice(
  guard.indexOf("await block('Look back tile"),
  guard.indexOf("await block('Words reading screen")
);

it('fails and exits nonzero when the real tile checks receive false conditions', () => {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', `
    import { createReporter } from ${JSON.stringify(reporterUrl)};
    ${setup}
    const goto = async () => {};
    const page = { locator: () => ({
      waitFor: async () => {},
      locator: () => ({ textContent: async () => '' })
    }) };
    ${tileBlock}
    finish('tile checks passed');
  `], { cwd: fileURLToPath(new URL('..', import.meta.url)), encoding: 'utf8', timeout: 10000 });

  expect(result.error).toBeUndefined();
  expect(result.status, result.stdout + result.stderr).toBe(1);
  expect(result.stdout.match(/^FAIL /gm)).toHaveLength(3);
  expect(result.stdout).not.toContain('PASS');
  expect(result.stdout).not.toContain('the rest never ran');
  expect(result.stdout).toContain('tile has headline');
  expect(result.stdout).toContain('3 FAILURE(S)');
});

it('counts both placeholders when the mode branch is unavailable', () => {
  const wordsBlock = guard.slice(
    guard.indexOf("await block('Words reading screen"),
    guard.indexOf("await block('Settings/words explains")
  );
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', `
    import { createReporter } from ${JSON.stringify(reporterUrl)};
    ${setup}
    const page = {
      locator: () => ({
        click: async () => {},
        textContent: async () => 'Era: Test stretch · Whole journal baseline',
        count: async () => 0
      }),
      waitForURL: async () => {},
      waitForSelector: async () => {}
    };
    ${wordsBlock}
    finish('mode branch accounted for');
  `], { cwd: fileURLToPath(new URL('..', import.meta.url)), encoding: 'utf8', timeout: 10000 });

  expect(result.error).toBeUndefined();
  expect(result.status, result.stdout + result.stderr).toBe(0);
  expect(result.stdout.match(/^PASS /gm)).toHaveLength(4);
  expect(result.stdout.match(/single dimension available/g)).toHaveLength(2);
  expect(result.stdout).not.toContain('FAIL');
});
