/* The catalogue merge driver (phase 12 copy-tooling ticket 02): a merge by
   key, so two branches adding neighbouring keys no longer conflict. */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { mergeCatalogues } from '../scripts/merge-catalogue.mjs';
import { serializeCatalogue } from '../scripts/catalogue.mjs';

describe('mergeCatalogues', () => {
  const base = { a: 'A', b: 'B', c: 'C' };

  it('takes a key added, changed or deleted on one side only', () => {
    const ours = { a: 'A2', b: 'B', c: 'C', d: 'D' };
    const theirs = { a: 'A', b: 'B', e: 'E' };
    expect(mergeCatalogues(base, ours, theirs)).toEqual({
      merged: { a: 'A2', b: 'B', d: 'D', e: 'E' },
      conflicts: []
    });
  });

  it('accepts the same change on both sides', () => {
    const both = { a: 'A2', b: 'B', d: 'D' };
    expect(mergeCatalogues(base, both, { ...both })).toEqual({ merged: both, conflicts: [] });
  });

  it('conflicts on a key changed differently, keeping ours', () => {
    const { merged, conflicts } = mergeCatalogues(base, { ...base, a: 'ours' }, { ...base, a: 'theirs', b: 'B2' });
    expect(conflicts).toEqual(['a']);
    expect(merged).toEqual({ a: 'ours', b: 'B2', c: 'C' });
  });

  it('conflicts on an edit against a delete', () => {
    const { b: _b, ...withoutB } = base;
    expect(mergeCatalogues(base, { ...base, b: 'B2' }, withoutB).conflicts).toEqual(['b']);
  });

  it('merges a variant value as a whole', () => {
    const v = (other: string) => [{ declarations: ['input count'], match: { 'count=one': 'one', 'count=other': other } }];
    const agreed = mergeCatalogues({ n: v('x') }, { n: v('y') }, { n: v('x') });
    expect(agreed).toEqual({ merged: { n: v('y') }, conflicts: [] });
    expect(mergeCatalogues({ n: v('x') }, { n: v('y') }, { n: v('z') }).conflicts).toEqual(['n']);
  });
});

describe('the driver inside git', () => {
  const script = resolve(__dirname, '../scripts/merge-catalogue.mjs');
  let dir: string;
  let file: string;
  const git = (...args: string[]) => spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
  const commit = (message: string, catalogue: Record<string, unknown>) => {
    writeFileSync(file, serializeCatalogue(catalogue));
    git('commit', '-qam', message);
  };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'merge-catalogue-'));
    mkdirSync(join(dir, 'messages'));
    file = join(dir, 'messages', 'en.json');
    git('init', '-q', '-b', 'main');
    git('config', 'user.email', 't@example.com');
    git('config', 'user.name', 't');
    git('config', 'merge.catalogue.driver', `node ${script} %O %A %B %P`);
    writeFileSync(join(dir, '.gitattributes'), readFileSync(resolve(__dirname, '../.gitattributes'), 'utf8'));
    writeFileSync(file, serializeCatalogue({ $schema: 'x', pre_a: 'A', pre_z: 'Z' }));
    git('add', '-A');
    git('commit', '-qm', 'base');
    git('checkout', '-qb', 'other');
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('merges two branches adding different keys under one prefix, sorted', () => {
    commit('other', { $schema: 'x', pre_a: 'A', pre_b: 'B', pre_z: 'Z' });
    git('checkout', '-q', 'main');
    commit('main', { $schema: 'x', pre_a: 'A', pre_c: 'C', pre_z: 'Z' });
    const merge = git('merge', '--no-edit', 'other');
    expect(merge.status).toBe(0);
    const text = readFileSync(file, 'utf8');
    expect(Object.keys(JSON.parse(text))).toEqual(['$schema', 'pre_a', 'pre_b', 'pre_c', 'pre_z']);
    expect(text).toBe(serializeCatalogue(JSON.parse(text)));
  });

  it('reports a conflict naming the key both branches changed differently', () => {
    commit('other', { $schema: 'x', pre_a: 'theirs', pre_z: 'Z' });
    git('checkout', '-q', 'main');
    commit('main', { $schema: 'x', pre_a: 'ours', pre_z: 'Z2' });
    const merge = git('merge', '--no-edit', 'other');
    expect(merge.status).not.toBe(0);
    expect(merge.stderr + merge.stdout).toContain('pre_a');
    expect(git('status', '--porcelain').stdout).toContain('UU messages/en.json');
    const left = JSON.parse(readFileSync(file, 'utf8'));
    expect(left).toMatchObject({ pre_a: 'ours', pre_z: 'Z2' });
  });
});
