// Exercises the production runner against disposable synthetic guards.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, cpSync, globSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { writeSummary } from '../scripts/check-process.mjs';

mkdirSync('.claude', { recursive: true });
mkdirSync('ci-logs', { recursive: true });
const fixture = mkdtempSync(resolve('.claude/recovery-proof-'));
const summaryPath = resolve('ci-logs/recovery-proof-summary.md');
const revision = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
assert.match(revision, /^[a-f0-9]{40}$/);
try {
  mkdirSync(join(fixture, 'tests'));
  mkdirSync(join(fixture, 'scripts'));
  mkdirSync(join(fixture, '.claude/recovery-shots'), { recursive: true });
  for (const path of ['tests/run-guards.mjs', 'scripts/check-process.mjs']) copyFileSync(path, join(fixture, path));
  writeFileSync(join(fixture, '.claude/recovery-shots/unchanged.txt'), 'Unrelated old evidence');
  writeFileSync(join(fixture, 'tests/guards.json'), JSON.stringify([
    { name: 'synthetic-recovery', tier: 'dev', holds: 'synthetic failure recovers once', diagnostics: ['.claude/recovery-shots/*', 'ci-logs/synthetic-case.json'] },
    { name: 'synthetic-pass', tier: 'dev', holds: 'independent first-attempt pass' }
  ]));
  writeFileSync(join(fixture, 'tests/synthetic-recovery.mjs'), `
    import { existsSync, writeFileSync } from 'node:fs';
    const attempt = existsSync('attempted') ? 2 : 1;
    writeFileSync('attempted', 'yes');
    writeFileSync('.claude/recovery-shots/same.json', JSON.stringify({ attempt }));
    writeFileSync('ci-logs/synthetic-case.json', JSON.stringify({ attempt }));
    console.log(attempt === 1 ? 'FAIL synthetic recovery case' : 'PASS synthetic recovery case');
    console.error('Synthetic attempt ' + attempt + ' stderr');
    process.exit(attempt === 1 ? 1 : 0);
  `);
  writeFileSync(join(fixture, 'tests/synthetic-pass.mjs'), 'console.log("PASS independent synthetic case");');
  const result = spawnSync(process.execPath, ['tests/run-guards.mjs', '--tier', 'dev'], {
    cwd: fixture, encoding: 'utf8', env: { ...process.env, GITHUB_STEP_SUMMARY: summaryPath }
  });
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  cpSync(join(fixture, 'ci-logs/guards'), 'ci-logs/guards', { recursive: true });
  const summary = readFileSync(summaryPath, 'utf8');
  writeSummary(['Synthetic guard recovery proof. Product guards are unchanged.', '', summary]);
  assert.equal(result.status, 0, 'A recovered guard permits success');
  assert.match(result.stdout, /RECOVERED synthetic-recovery/);
  assert.match(summary, /\| synthetic-recovery \| recovered \|/);
  assert.match(summary, /\| synthetic-pass \| passed \|/);
  assert.ok(summary.includes(revision));
  const reports = globSync('ci-logs/guards/*/results.json', { cwd: fixture });
  assert.equal(reports.length, 1);
  const report = JSON.parse(readFileSync(join(fixture, reports[0]), 'utf8'));
  assert.equal(report.revision, revision);
  assert.deepEqual(report.results.map((row) => row.outcome), ['recovered', 'passed']);
  const directory = join(reports[0], '..', 'synthetic-recovery');
  for (const attempt of [1, 2]) {
    const evidence = join(directory, `attempt-${attempt}`);
    const metadata = JSON.parse(readFileSync(join(evidence, 'result.json'), 'utf8'));
    assert.equal(metadata.revision, revision);
    assert.equal(metadata.attempt, attempt);
    assert.equal(metadata.code, attempt === 1 ? 1 : 0);
    assert.ok(metadata.durationMs >= 0);
    assert.ok(Date.parse(metadata.finishedAt) >= Date.parse(metadata.startedAt));
    assert.ok(summary.includes(`attempt ${attempt}: exit ${metadata.code}, ${(metadata.durationMs / 1000).toFixed(2)}s`));
    assert.match(readFileSync(join(evidence, 'output.log'), 'utf8'), new RegExp(`Synthetic attempt ${attempt} stderr`));
    for (const path of ['.claude/recovery-shots/same.json', 'ci-logs/synthetic-case.json']) {
      assert.deepEqual(JSON.parse(readFileSync(join(evidence, 'diagnostics', path), 'utf8')), { attempt });
    }
    assert.deepEqual(globSync('**/unchanged.txt', { cwd: evidence }), []);
  }
  console.log(`PASS synthetic recovery proof at ${revision}; both attempts preserved`);
} finally {
  rmSync(fixture, { recursive: true, force: true });
}
