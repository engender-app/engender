import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe.each(['care-lane-labels', 'debrief-offer-check'])('%s process outcome', guard => {
  function run(outcome: string) {
    return spawnSync(process.execPath, [
      '--import', fileURLToPath(new URL('./fixtures/guard-outcomes.mjs', import.meta.url)),
      fileURLToPath(new URL(`./${guard}.mjs`, import.meta.url))
    ], { encoding: 'utf8', env: { ...process.env, GUARD_OUTCOME: outcome }, timeout: 10000 });
  }

  it('returns success for successful measured conditions', () => {
    const result = run('passed');
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('fixture server closed');
    expect(result.stdout).toContain('fixture browser closed');
  });

  it.each(['failed', 'boot-error', 'selector-error', 'page-error'])('returns failure for %s', outcome => {
    const result = run(outcome);
    expect(result.status, result.stdout + result.stderr).toBe(1);
    expect(result.stdout).toContain('fixture server closed');
    expect(result.stdout).toContain('fixture browser closed');
  });
});
