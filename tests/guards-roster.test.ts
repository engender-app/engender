import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { selectGuards } from './run-guards.mjs';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

describe('guard roster', () => {
  it('indexes every root probe, including helpers and manually run tools', () => {
    const doc = read('tests/PROBES.md');
    const scripts = JSON.parse(read('package.json')).scripts;
    let indexed = doc;
    for (const [name, command] of Object.entries(scripts)) {
      if (doc.includes(`\`${name}\``)) indexed += `\n${command}`;
    }
    const missing = readdirSync(new URL('.', import.meta.url)).filter((file) => file.endsWith('.mjs'))
      .filter((file) => !indexed.includes(`\`${file.slice(0, -4)}\``) && !indexed.includes(`tests/${file}`));
    expect(missing, 'Add each new probe to PROBES.md or delete it').toEqual([]);
    const files = readdirSync(new URL('.', import.meta.url));
    for (const match of doc.matchAll(/^\| `([^`]+)`[^|]*\| /gm)) {
      const name = match[1].split(' ')[0];
      if (name.includes(':')) expect(scripts[name], `Unknown npm script ${name}`).toBeDefined();
      else expect(files, `Indexed probe ${name} has no file`).toContain(`${name}.mjs`);
    }
  });

  it('assigns every guard exactly once across the hosted duration-balanced groups', () => {
    const roster = JSON.parse(read('tests/guards.json'));
    const timings = JSON.parse(read('tests/guard-durations.json'));
    expect(Object.keys(timings.guards).sort()).toEqual(roster.map((guard: { name: string }) => guard.name).sort());
    const workflow = read('.github/workflows/ci.yml');
    const groups = [...workflow.matchAll(/- tier: (dev|built)\s+shard: (\d+\/\d+)/g)];
    expect(groups.filter((group) => group[1] === 'dev')).toHaveLength(3);
    expect(groups.filter((group) => group[1] === 'built')).toHaveLength(6);
    const scheduled = groups.flatMap(([, tier, shard]) => selectGuards(roster, tier, shard));
    expect(scheduled.map((guard) => guard.name).sort()).toEqual(roster.map((guard: { name: string }) => guard.name).sort());
    for (const [, tier, shard] of groups) {
      const selected = selectGuards(roster, tier, shard);
      const production = selected.findIndex((guard) => guard.build === 'production');
      if (production >= 0) expect(selected.slice(production).every((guard) => guard.build === 'production')).toBe(true);
    }
    expect(workflow).toContain('needs: [node, android, browser, guards, benchmark]');
    expect(workflow).toContain('fail-fast: false');
  });

  it('matches the guard tables by name, tier and invariant, with existing files', () => {
    const roster = JSON.parse(read('tests/guards.json'));
    const doc = read('tests/PROBES.md');
    const guardsSection = doc.split('## Guards')[1].split('### Written as a guard')[0];
    const sections = guardsSection.split('### `npm run test:guards:built`');
    const indexed = sections.flatMap((section, index) => [...section.matchAll(/^\| `([^`]+)`[^|]*\| (.+) \|$/gm)]
      .map((match) => ({ name: match[1].split(' ')[0], tier: index === 0 ? 'dev' : 'built', holds: match[2] })));
    expect(roster.map(({ name, tier, holds }: { name: string; tier: string; holds: string }) => ({ name, tier, holds })))
      .toEqual(indexed);
    expect(new Set(roster.map((guard: { name: string }) => guard.name)).size).toBe(roster.length);
    const files = readdirSync(new URL('.', import.meta.url));
    for (const guard of roster) {
      expect(['dev', 'built']).toContain(guard.tier);
      expect(guard.holds).not.toBe('');
      expect(files).toContain(`${guard.name}.mjs`);
      expect(guard.build === undefined || guard.build === 'production').toBe(true);
    }
    const production = roster.findIndex((guard: { build?: string }) => guard.build === 'production');
    expect(production).toBeGreaterThanOrEqual(0);
    expect(roster.slice(production).every((guard: { build?: string }) => guard.build === 'production')).toBe(true);
    expect(read('package.json')).not.toMatch(/node tests\/(?:leave-lock-check|date-picker-check)\.mjs/);
    expect(read('.github/workflows/ci.yml')).toContain('node tests/run-guards.mjs --tier');
  });
});
