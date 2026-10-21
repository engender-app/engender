import assert from 'node:assert/strict';
import { test } from 'vitest';
import { isLegacyHairStaging, legacyHairStagingText } from './hairStageScales.ts';

test('an older staging is a published grade on its scale, or other with no grade', () => {
  assert.ok(isLegacyHairStaging('norwood_hamilton', '3a'));
  assert.ok(isLegacyHairStaging('sinclair', '5'));
  assert.ok(isLegacyHairStaging('other', ''));
  // The scales share codes 1 to 5 and nothing else.
  assert.equal(isLegacyHairStaging('sinclair', '3a'), false);
  assert.equal(isLegacyHairStaging('sinclair', '7'), false);
  assert.equal(isLegacyHairStaging('other', '1'), false);
  assert.equal(isLegacyHairStaging('ludwig', 'ii'), false);
  assert.equal(isLegacyHairStaging('norwood_hamilton', ''), false);
});

test('a graded staging reads as its scale and code, and other as its own words', () => {
  assert.equal(legacyHairStagingText('norwood_hamilton', '3v', ''), 'Norwood-Hamilton 3V');
  assert.equal(legacyHairStagingText('sinclair', '2', ''), 'Sinclair 2');
  assert.equal(legacyHairStagingText('other', '', 'thinner on top'), 'thinner on top');
});
