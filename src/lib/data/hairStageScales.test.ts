import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
  HAIR_SCALES,
  NORWOOD_HAMILTON_STAGES,
  SINCLAIR_GRADES,
  gradesOfScale,
  isHairScale,
  isHairStaging,
  stagesByScale
} from './hairStageScales.ts';

test('the two published scales are the ones they were published as', () => {
  assert.deepEqual([...NORWOOD_HAMILTON_STAGES], ['1', '2', '2a', '3', '3v', '3a', '4', '4a', '5', '5a', '6', '7']);
  assert.deepEqual([...SINCLAIR_GRADES], ['1', '2', '3', '4', '5']);
});

test('other is a scale you can record under, with no grades of its own', () => {
  assert.ok(isHairScale('other'));
  assert.deepEqual([...gradesOfScale('other')], []);
});

test('nothing else is a scale', () => {
  assert.equal(isHairScale('ludwig'), false);
  assert.equal(isHairScale(''), false);
  assert.equal(isHairScale('Norwood-Hamilton'), false);
});

test('the two scales share grade codes and are never interchangeable', () => {
  // '1' through '5' are codes on both scales and mean different things on
  // each, which is exactly why a stage is stored with its scale.
  assert.ok(isHairStaging('norwood_hamilton', '3a'));
  assert.equal(isHairStaging('sinclair', '3a'), false);

  assert.ok(isHairStaging('sinclair', '5'));
  assert.equal(isHairStaging('sinclair', '7'), false);
  assert.ok(isHairStaging('norwood_hamilton', '7'));
});

test('a staging under other carries no grade', () => {
  assert.ok(isHairStaging('other', ''));
  assert.equal(isHairStaging('other', '1'), false);
});

test('a grade under a scale that is not one is not a staging', () => {
  assert.equal(isHairStaging('ludwig', 'ii'), false);
  assert.equal(isHairStaging('norwood_hamilton', ''), false);
});

const staging = (id: string, scale: string, stage = '') => ({ id, scale, stage });

test('grouping keeps every scale to itself', () => {
  const grouped = stagesByScale([
    staging('a', 'norwood_hamilton', '3'),
    staging('b', 'sinclair', '3'),
    staging('c', 'other'),
    staging('d', 'norwood_hamilton', '4')
  ]);

  assert.deepEqual(
    grouped.map((g) => [g.scale, g.stages.map((s) => s.id)]),
    [
      ['norwood_hamilton', ['a', 'd']],
      ['sinclair', ['b']],
      ['other', ['c']]
    ]
  );
});

test('grouping lists the scales in one fixed order, whatever order the stages arrive in', () => {
  const grouped = stagesByScale([staging('a', 'other'), staging('b', 'sinclair', '1')]);

  assert.deepEqual(
    grouped.map((g) => g.scale),
    ['sinclair', 'other']
  );
  assert.deepEqual([...HAIR_SCALES].slice(1), ['sinclair', 'other']);
});

test('a scale with nothing recorded under it is not a group', () => {
  assert.deepEqual(stagesByScale([]), []);
  assert.deepEqual(
    stagesByScale([staging('a', 'sinclair', '2')]).map((g) => g.scale),
    ['sinclair']
  );
});

test('grouping preserves the order it was handed within a scale', () => {
  const grouped = stagesByScale([
    staging('late', 'norwood_hamilton', '4'),
    staging('early', 'norwood_hamilton', '2')
  ]);

  assert.deepEqual(grouped[0].stages.map((s) => s.id), ['late', 'early']);
});
