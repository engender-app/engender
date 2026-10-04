import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { WALKTHROUGH_GROUPS, groupFlows } from './walkthrough-groups.mjs';

const source = readFileSync(new URL('./walkthrough.test.mjs', import.meta.url), 'utf8');
const names = [...source.matchAll(/^await flow\((['"])(.*?)\1/gm)].map((match) => match[2]);

describe('walkthrough group coverage', () => {
  it('assigns every flow once, preserving the continuous walkthrough order', () => {
    expect(WALKTHROUGH_GROUPS.flatMap((group) => groupFlows(names, group.id))).toEqual(names);
    expect(new Set(names).size).toBe(names.length);
    expect(groupFlows(names, 'journal')).toContain('entry flow');
    expect(groupFlows(names, 'journal')).toContain('search');
    expect(groupFlows(names, 'setup')).toContain('lock on leave and reset');
    expect(groupFlows(names, 'setup')).toContain('wrapped');
    expect(groupFlows(names, 'features')).toContain('fill every feature');
    expect(groupFlows(names, 'features')).toContain('safe space letters');
    expect(groupFlows(names, 'actions')).toContain('the recovery key');
    expect(groupFlows(names, 'actions')).toContain('the recovery key at the gate');
  });
});

describe('walkthrough selection command', () => {
  it('refuses unknown groups before starting a browser', () => {
    const result = spawnSync(process.execPath, ['tests/walkthrough.test.mjs', '--group', 'typo', '--list'], { encoding: 'utf8', timeout: 10000 });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('--group wants one of:');
  });

  it('lists a complete independent group without starting Chromium', () => {
    const result = spawnSync(process.execPath, ['tests/walkthrough.test.mjs', '--group', 'actions', '--list'], { encoding: 'utf8', timeout: 10000 });
    expect(result.status).toBe(0);
    const selected = JSON.parse(result.stdout);
    expect(selected.state).toBe('full');
    expect(selected.flows).toContain('quick add tallies');
    expect(selected.flows).toContain('the recovery key at the gate');
    expect(selected.flows).not.toContain('onboarding');
  });
});
